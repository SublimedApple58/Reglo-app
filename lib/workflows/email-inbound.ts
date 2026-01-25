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

  const fromRaw =
    (record.from as string | undefined) ??
    (record.sender as string | undefined) ??
    (record["from"] as string | undefined) ??
    (record["sender"] as string | undefined);
  const toRaw =
    (record.to as string | string[] | undefined) ??
    (record.recipient as string | string[] | undefined) ??
    (record["to"] as string | string[] | undefined) ??
    (record["recipients"] as string | string[] | undefined);
  const subject =
    (record.subject as string | undefined) ??
    (record["Subject"] as string | undefined) ??
    "";
  const text =
    (record.text as string | undefined) ??
    (record.text_body as string | undefined) ??
    (record["text"] as string | undefined) ??
    "";
  const html =
    (record.html as string | undefined) ??
    (record.html_body as string | undefined) ??
    (record["html"] as string | undefined);

  const from = fromRaw ? normalizeAddress(fromRaw) : "";
  const to = parseRecipients(toRaw);
  const normalizedText = text || (html ? htmlToText(html) : "");

  return {
    from,
    to,
    subject,
    text: normalizedText,
    html: html ?? undefined,
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
      text: inbound.text,
      html: inbound.html,
    });

    const fields = Object.fromEntries(
      schemaKeys.map((key) => [key, extraction.fields[key] ?? ""]),
    );

    const warnings = [
      ...extraction.warnings,
      ...requiredFields
        .filter((key) => !fields[key] || !fields[key].trim())
        .map((key) => `Campo mancante: ${key}`),
    ];

    const triggerPayload = {
      ...fields,
      _email: {
        from: inbound.from,
        to: inbound.to.join(", "),
        subject: inbound.subject,
        text: inbound.text,
        html: inbound.html ?? undefined,
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
