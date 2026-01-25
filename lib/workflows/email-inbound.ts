import { prisma } from "@/db/prisma";
import { tasks } from "@trigger.dev/sdk/v3";
import { computeExecutionOrder } from "@/lib/workflows/engine";
import { collectTriggerPayloadKeys } from "@/lib/workflows/payload";
import { extractEmailFields } from "@/lib/ai/email-extract";

export type NormalizedInboundEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  emailId?: string;
  raw?: unknown;
};

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const extractEmail = (value: string) => {
  const match = value.match(emailRegex);
  return match ? match[0] : value.trim();
};

const normalizeAddress = (value: string) => extractEmail(value).toLowerCase().trim();

const parseRecipients = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => parseRecipients(item))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => normalizeAddress(item));
  }
  if (typeof value === "object") {
    const maybeAddress = (value as { address?: string }).address;
    if (typeof maybeAddress === "string") {
      return [normalizeAddress(maybeAddress)];
    }
  }
  return [];
};

const htmlToText = (html: string) => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const normalizeInboundPayload = (payload: unknown): NormalizedInboundEmail | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data ?? payload;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  const pickString = (source: Record<string, unknown> | null, keys: string[]) => {
    if (!source) return "";
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  };

  const pickStringFromList = (sources: Record<string, unknown>[], keys: string[]) => {
    for (const source of sources) {
      const value = pickString(source, keys);
      if (value) return value;
    }
    return "";
  };

  const nestedCandidates = [
    record.email,
    record.message,
    record.mail,
    record.data,
    record.payload,
    record.body,
  ].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));

  const fromRaw =
    pickString(record, ["from", "sender", "from_email", "fromEmail"]) ||
    pickStringFromList(nestedCandidates, ["from", "sender", "from_email", "fromEmail"]);
  const toRaw =
    (record.to as string | string[] | undefined) ??
    (record.recipient as string | string[] | undefined) ??
    (record.recipients as string | string[] | undefined) ??
    (record["to"] as string | string[] | undefined) ??
    (record["recipients"] as string | string[] | undefined) ??
    (record["rcpt"] as string | string[] | undefined);
  const subject =
    pickString(record, ["subject", "Subject", "email_subject"]) ||
    pickStringFromList(nestedCandidates, ["subject", "Subject", "email_subject"]) ||
    "";
  const emailId =
    pickString(record, ["email_id", "emailId", "id"]) ||
    pickStringFromList(nestedCandidates, ["email_id", "emailId", "id"]) ||
    undefined;
  const text =
    pickString(record, [
      "text",
      "text_body",
      "text_plain",
      "plain",
      "body",
      "body_plain",
      "stripped_text",
      "content",
    ]) ||
    pickStringFromList(nestedCandidates, [
      "text",
      "text_body",
      "text_plain",
      "plain",
      "body",
      "body_plain",
      "stripped_text",
      "content",
    ]);
  const html =
    pickString(record, ["html", "html_body", "body_html", "stripped_html"]) ||
    pickStringFromList(nestedCandidates, ["html", "html_body", "body_html", "stripped_html"]) ||
    undefined;

  const from = fromRaw ? normalizeAddress(fromRaw) : "";
  const to = parseRecipients(toRaw);
  const normalizedText = text || (html ? htmlToText(html) : "");

  return {
    from,
    to,
    subject,
    text: normalizedText,
    html: html ?? undefined,
    emailId: emailId || undefined,
    raw: payload,
  };
};

const matchRecipient = (address: string, recipients: string[]) => {
  if (!address.trim()) return false;
  const normalized = normalizeAddress(address);
  if (normalized.includes("@")) {
    return recipients.includes(normalized);
  }
  return recipients.some((recipient) => recipient.startsWith(`${normalized}@`));
};

const matchFilter = (value: string, filter?: string) => {
  if (!filter?.trim()) return true;
  return value.toLowerCase().includes(filter.toLowerCase().trim());
};

const matchKeywords = (text: string, keywords?: string) => {
  if (!keywords?.trim()) return true;
  const list = keywords
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.every((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
};

export const triggerEmailInboundWorkflows = async ({
  inbound,
}: {
  inbound: NormalizedInboundEmail;
}) => {
  const workflows = await prisma.workflow.findMany({
    where: { status: "active" },
  });

  const fetchReceivedEmailContent = async (emailId: string) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { content: null, warning: "RESEND_API_KEY mancante per recuperare il corpo." };
    }
    try {
      const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          content: null,
          warning: `Impossibile recuperare il corpo email da Resend (HTTP ${res.status}). ${errText.slice(0, 140)}`,
        };
      }
      const json = (await res.json()) as {
        data?: { html?: string; text?: string; body?: string };
      };
      return { content: json.data ?? null, warning: null };
    } catch {
      return {
        content: null,
        warning: "Errore durante il recupero del corpo email da Resend.",
      };
    }
  };

  for (const workflow of workflows) {
    const definition = workflow.definition as {
      trigger?: { type?: string; config?: Record<string, unknown> };
      nodes?: Array<{ id: string; type?: string; config?: Record<string, unknown> }>;
      edges?: Array<{ from: string; to: string; condition?: Record<string, unknown> | null }>;
    };
    const trigger = definition.trigger;
    if (trigger?.type !== "email_inbound") continue;
    const config = trigger.config ?? {};
    const address = (config.address as string | undefined) ?? "";
    if (!address) continue;
    if (!matchRecipient(address, inbound.to)) continue;
    const fromFilter = config.fromFilter as string | undefined;
    const subjectFilter = config.subjectFilter as string | undefined;
    const keywords = config.keywords as string | undefined;

    if (!matchFilter(inbound.from, fromFilter)) continue;
    if (!matchFilter(inbound.subject, subjectFilter)) continue;
    if (!matchKeywords(`${inbound.subject}\n${inbound.text}`, keywords)) continue;

    let resolvedText = inbound.text;
    let resolvedHtml = inbound.html;
    const extraWarnings: string[] = [];
    if (!resolvedText && inbound.emailId) {
      const { content, warning } = await fetchReceivedEmailContent(inbound.emailId);
      if (warning) {
        extraWarnings.push(warning);
      }
      if (content) {
        resolvedText = content.text ?? content.body ?? "";
        resolvedHtml = content.html ?? resolvedHtml;
        if (!resolvedText && content.html) {
          resolvedText = htmlToText(content.html);
        }
        if (!resolvedText) {
          extraWarnings.push("Corpo email vuoto anche dopo fetch Resend.");
        }
      }
    }

    const emailFieldMeta = Array.isArray((config as { emailFieldMeta?: unknown }).emailFieldMeta)
      ? ((config as { emailFieldMeta?: Array<{ key: string; required: boolean }> }).emailFieldMeta ??
          [])
      : [];
    const emailFields = Array.isArray((config as { emailFields?: unknown }).emailFields)
      ? ((config as { emailFields?: string[] }).emailFields ?? [])
      : [];

    const requiredFields = emailFieldMeta
      .filter((field) => field.key && field.required)
      .map((field) => field.key);

    const inferredKeys =
      emailFields.length > 0
        ? emailFields
        : emailFieldMeta.length > 0
          ? emailFieldMeta.map((field) => field.key)
          : collectTriggerPayloadKeys(definition);

    const schemaKeys = Array.from(new Set(inferredKeys.filter(Boolean)));
    const extraction = await extractEmailFields({
      schemaKeys,
      subject: inbound.subject,
      text: resolvedText,
      html: resolvedHtml,
    });

    const fields = Object.fromEntries(
      schemaKeys.map((key) => [key, extraction.fields[key] ?? ""]),
    );

    const warnings = [
      ...extraction.warnings,
      ...requiredFields
        .filter((key) => !fields[key] || !fields[key].trim())
        .map((key) => `Campo mancante: ${key}`),
      ...extraWarnings,
    ];

    const triggerPayload = {
      ...fields,
      _email: {
        id: inbound.emailId ?? undefined,
        from: inbound.from,
        to: inbound.to.join(", "),
        subject: inbound.subject,
        text: resolvedText,
        html: resolvedHtml ?? undefined,
      },
      _warnings: warnings,
    };

    const executionOrder = computeExecutionOrder(definition);

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        companyId: workflow.companyId,
        status: "queued",
        triggerType: "email_inbound",
        triggerPayload,
      },
    });

    if (executionOrder.length) {
      await prisma.workflowRunStep.createMany({
        data: executionOrder.map((nodeId) => ({
          runId: run.id,
          nodeId,
          status: "pending",
          attempt: 0,
        })),
      });
    }

    await tasks.trigger("workflow-runner", { runId: run.id });
  }
};
