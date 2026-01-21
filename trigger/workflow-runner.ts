import { task, wait } from "@trigger.dev/sdk/v3";
import {
  computeExecutionOrder,
  evaluateCondition,
  getNextNodeId,
  interpolateTemplate,
  type Condition,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/lib/workflows/engine";
import { decryptSecret } from "@/lib/integrations/secrets";
import { getR2Bucket, getR2Client } from "@/lib/storage/r2";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomUUID } from "crypto";
import { sendDynamicEmail } from "@/email";

type SlackProfileResponse = {
  ok: boolean;
  user?: { id?: string };
  error?: string;
};

type SlackOpenConversationResponse = {
  ok: boolean;
  channel?: { id?: string };
  error?: string;
};

type SlackPostMessageResponse = {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
};

type TemplateField = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  meta?: unknown;
  bindingKey?: string | null;
  label?: string | null;
  type?: string;
};

let prismaClient: unknown = null;
const getPrisma = async (): Promise<any> => {
  if (!prismaClient) {
    const [{ PrismaClient }, { PrismaNeon }, neonModule, wsModule] =
      await Promise.all([
        import("@prisma/client"),
        import("@prisma/adapter-neon"),
        import("@neondatabase/serverless"),
        import("ws"),
      ]);
    const neonConfig = neonModule.neonConfig;
    const ws = (wsModule as { default?: unknown }).default ?? wsModule;
    neonConfig.webSocketConstructor = ws as typeof globalThis.WebSocket;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL for Trigger Prisma client");
    }
    const adapter = new PrismaNeon({ connectionString });
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient as any;
};

const toJsonValue = (value: unknown) => {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
};

const streamToBuffer = async (stream: unknown) => {
  if (!stream) return Buffer.from([]);
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  if (typeof stream === "string") return Buffer.from(stream);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

const resolvePayloadValue = (payload: unknown, path?: string | null) => {
  if (!path || !payload || typeof payload !== "object") return "";
  const parts = path.split(".").filter(Boolean);
  let current: unknown = payload;
  for (const part of parts) {
    if (current == null) return "";
    if (Array.isArray(current)) {
      const index = Number(part);
      if (Number.isNaN(index)) return "";
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return "";
  if (typeof current === "string") return current;
  if (typeof current === "number" || typeof current === "boolean") return String(current);
  try {
    return JSON.stringify(current);
  } catch {
    return String(current);
  }
};

export const workflowRunner = task({
  id: "workflow-runner",
  run: async (payload: { runId: string }) => {
    const prisma = await getPrisma();
    if (!("workflowRun" in prisma)) {
      const prototypeKeys = Object.getOwnPropertyNames(
        Object.getPrototypeOf(prisma),
      ).filter((key) => !key.startsWith("$") && key !== "constructor");
      throw new Error(
        `Prisma client missing WorkflowRun model. Available models: ${prototypeKeys.join(", ")}`,
      );
    }
    const run = await prisma.workflowRun.findUnique({
      where: { id: payload.runId },
      include: { workflow: true },
    });

    if (!run) {
      throw new Error("Workflow run not found");
    }

    const definition = run.workflow.definition as {
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
      settings?: {
        retryPolicy?: { maxAttempts?: number; backoffSeconds?: number };
      };
    };

    const executionOrder = computeExecutionOrder(definition);
    const retryPolicy = definition.settings?.retryPolicy ?? {};
    const maxAttempts = retryPolicy.maxAttempts ?? 3;
    const backoffSeconds = retryPolicy.backoffSeconds ?? 5;

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "running",
        startedAt: new Date(),
      },
    });

    const nodes = definition.nodes ?? [];
    const edges = definition.edges ?? [];
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const stepOutputs: Record<string, unknown> = {};
    const loopCounters = new Map<string, number>();
    const maxSteps = Math.max(50, nodes.length * 5);

    const getAppBaseUrl = () =>
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_SERVER_URL ||
      "http://localhost:3000";

    const getSlackToken = async (companyId: string) => {
      const connection = await prisma.integrationConnection.findUnique({
        where: {
          companyId_provider: {
            companyId,
            provider: "SLACK",
          },
        },
      });

      if (
        !connection?.accessTokenCiphertext ||
        !connection.accessTokenIv ||
        !connection.accessTokenTag
      ) {
        throw new Error("Slack integration not connected");
      }

      return decryptSecret({
        ciphertext: connection.accessTokenCiphertext,
        iv: connection.accessTokenIv,
        tag: connection.accessTokenTag,
      });
    };

    const getFicConnection = async (companyId: string) => {
      const connection = await prisma.integrationConnection.findUnique({
        where: {
          companyId_provider: {
            companyId,
            provider: "FATTURE_IN_CLOUD",
          },
        },
      });

      if (
        !connection?.accessTokenCiphertext ||
        !connection.accessTokenIv ||
        !connection.accessTokenTag
      ) {
        throw new Error("Fatture in Cloud non connesso");
      }

      const metadata =
        connection.metadata && typeof connection.metadata === "object"
          ? (connection.metadata as { entityId?: string; entityName?: string })
          : {};

      if (!metadata.entityId) {
        throw new Error("Seleziona l'azienda FIC in Settings");
      }

      const token = decryptSecret({
        ciphertext: connection.accessTokenCiphertext,
        iv: connection.accessTokenIv,
        tag: connection.accessTokenTag,
      });

      return { token, entityId: metadata.entityId, entityName: metadata.entityName };
    };

    const ficFetch = async (
      path: string,
      token: string,
      init?: RequestInit,
    ) => {
      const response = await fetch(`https://api-v2.fattureincloud.it${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Errore Fatture in Cloud");
      }
      return response.json();
    };

    const executeSlackChannelMessage = async (
      token: string,
      channel: string,
      message: string,
    ) => {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel, text: message }),
      });
      const payload = (await response.json()) as SlackPostMessageResponse;
      if (!payload.ok) {
        throw new Error(payload.error || "Slack message failed");
      }
      return payload;
    };

    const executeSlackUserMessage = async (
      token: string,
      userInput: string,
      message: string,
    ) => {
      let userId = userInput.trim();
      if (userId.includes("@")) {
        const response = await fetch(
          "https://slack.com/api/users.lookupByEmail",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ email: userId }),
          },
        );
        const payload = (await response.json()) as SlackProfileResponse;
        if (!payload.ok || !payload.user?.id) {
          throw new Error(payload.error || "Slack user not found");
        }
        userId = payload.user.id;
      }

      const openResponse = await fetch("https://slack.com/api/conversations.open", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ users: userId }),
      });
      const openPayload = (await openResponse.json()) as SlackOpenConversationResponse;
      if (!openPayload.ok || !openPayload.channel?.id) {
        throw new Error(openPayload.error || "Slack DM failed");
      }

      return executeSlackChannelMessage(token, openPayload.channel.id, message);
    };

    const executeNode = async (nodeId: string) => {
      const node = nodesById.get(nodeId);
      if (!node) {
        throw new Error("Workflow node not found");
      }

      await prisma.workflowRunStep.updateMany({
        where: { runId: run.id, nodeId },
        data: {
          status: "running",
          startedAt: new Date(),
        },
      });

      if (node.type === "logicIf") {
        const condition = node.config?.condition as Condition | undefined;
        const result = condition
          ? evaluateCondition(condition, {
              triggerPayload: run.triggerPayload ?? undefined,
              stepOutputs,
            })
          : false;
        const output = { result };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: result ? "yes" : "no" };
      }

      if (node.type === "logicLoop") {
        const mode = (node.config?.mode as string | undefined) ?? "for";
        const condition = node.config?.condition as Condition | undefined;
        let shouldLoop = false;
        let iterationsLeft = loopCounters.get(nodeId) ?? 0;

        if (mode === "while") {
          shouldLoop = condition
            ? evaluateCondition(condition, {
                triggerPayload: run.triggerPayload ?? undefined,
                stepOutputs,
              })
            : false;
        } else {
          if (iterationsLeft === 0) {
            const total = Number(node.config?.iterations ?? 0);
            iterationsLeft = Number.isFinite(total) ? total : 0;
          }
          if (iterationsLeft > 0) {
            shouldLoop = true;
            iterationsLeft -= 1;
          }
          loopCounters.set(nodeId, iterationsLeft);
        }

        const output = { shouldLoop, iterationsLeft };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });

        return { branch: shouldLoop ? "loop" : "next" };
      }

      if (node.type === "wait") {
        const timeout =
          typeof node.config?.timeout === "string" ? node.config.timeout : "24h";
        const token = await wait.createToken({
          timeout,
          tags: [run.id, nodeId],
        });
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "waiting",
            output: {
              waitpointId: token.id,
              url: token.url,
            },
          },
        });
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: "waiting" },
        });

        const result = await wait.forToken(token).unwrap();

        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output: {
              waitpointId: token.id,
              result: toJsonValue(result),
            },
            finishedAt: new Date(),
          },
        });

        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: "running" },
        });

        stepOutputs[nodeId] = result;
        return { branch: null };
      }

      const settings = (node.config?.settings ?? {}) as Record<string, string>;
      const context = {
        triggerPayload: run.triggerPayload ?? undefined,
        stepOutputs,
      };

      if (node.type === "slack-channel-message") {
        const channel = settings.channel?.trim();
        if (!channel) {
          throw new Error("Slack channel is required");
        }
        const rawMessage = settings.message ?? "";
        const message = interpolateTemplate(rawMessage, context);
        const token = await getSlackToken(run.companyId);
        const result = await executeSlackChannelMessage(token, channel, message);
        const output = { channel: result.channel, ts: result.ts };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: null };
      }

      if (node.type === "slack-user-message") {
        const user = settings.user?.trim();
        if (!user) {
          throw new Error("Slack user is required");
        }
        const rawMessage = settings.message ?? "";
        const message = interpolateTemplate(rawMessage, context);
        const token = await getSlackToken(run.companyId);
        const result = await executeSlackUserMessage(token, user, message);
        const output = { channel: result.channel, ts: result.ts };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: null };
      }

      if (node.type === "doc-compile-template") {
        const templateId = settings.templateId?.trim();
        const rawName = settings.requestName ?? "";
        if (!templateId) {
          throw new Error("Template is required");
        }
        if (!rawName.trim()) {
          throw new Error("Request name is required");
        }
        const name = interpolateTemplate(rawName, context);
        const template = await prisma.documentTemplate.findFirst({
          where: { id: templateId, companyId: run.companyId },
          select: {
            id: true,
            name: true,
            sourceUrl: true,
            fields: { orderBy: { createdAt: "asc" } },
          },
        });
        if (!template) {
          throw new Error("Template not found");
        }
        if (!template.sourceUrl) {
          throw new Error("Template PDF not available");
        }
        const token = randomUUID();
        const request = await prisma.documentRequest.create({
          data: {
            companyId: run.companyId,
            templateId,
            name,
            publicToken: token,
            payload: run.triggerPayload ?? undefined,
          },
        });

        const response = await getR2Client().send(
          new GetObjectCommand({
            Bucket: getR2Bucket(),
            Key: template.sourceUrl,
          }),
        );
        if (!response.Body) {
          throw new Error("Template file not available");
        }
        const pdfBytes = await streamToBuffer(response.Body);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const textFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

        const wrapText = (text: string, fontSize: number, maxWidth: number) => {
          const paragraphs = text.split(/\r?\n/);
          const lines: string[] = [];
          paragraphs.forEach((paragraph, index) => {
            const words = paragraph.split(/\s+/).filter(Boolean);
            let line = "";
            words.forEach((word) => {
              const testLine = line ? `${line} ${word}` : word;
              const lineWidth = textFont.widthOfTextAtSize(testLine, fontSize);
              if (lineWidth > maxWidth && line) {
                lines.push(line);
                line = word;
              } else {
                line = testLine;
              }
            });
            if (line) lines.push(line);
            if (index < paragraphs.length - 1) lines.push("");
          });
          return lines;
        };

        const payload = run.triggerPayload ?? {};
        const fields = Array.isArray(template.fields)
          ? (template.fields as TemplateField[])
          : [];
        fields.forEach((field) => {
          const page = pages[field.page - 1];
          if (!page) return;
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const meta =
            field.meta && typeof field.meta === "object" && !Array.isArray(field.meta)
              ? (field.meta as { unit?: string; html?: string })
              : {};
          const resolved =
            meta.unit === "ratio"
              ? {
                  x: field.x * pageWidth,
                  y: field.y * pageHeight,
                  width: field.width * pageWidth,
                  height: field.height * pageHeight,
                }
              : {
                  x: field.x,
                  y: field.y,
                  width: field.width,
                  height: field.height,
                };
          const x = resolved.x;
          const y = pageHeight - resolved.y - resolved.height;
          const width = resolved.width;
          const height = resolved.height;
          const paddingX = 4;
          const paddingY = 3;

          if (field.type === "text") {
            const text = htmlToText(meta.html ?? field.label ?? "");
            if (!text) return;
            const fontSize = Math.min(12, Math.max(9, height * 0.22));
            const lineHeight = fontSize * 1.3;
            const maxLines = Math.floor((height - paddingY * 2) / lineHeight);
            const lines = wrapText(text, fontSize, width - paddingX * 2);
            lines.slice(0, maxLines).forEach((line, index) => {
              const textY = y + height - paddingY - lineHeight * (index + 1);
              page.drawText(line, {
                x: x + paddingX,
                y: textY,
                size: fontSize,
                font: textFont,
                color: rgb(0.1, 0.1, 0.1),
              });
            });
            return;
          }

          const value = resolvePayloadValue(payload, field.bindingKey);
          if (!value) return;

          if (field.type === "input") {
            const fontSize = Math.min(14, Math.max(9, height * 0.85));
            const textY = y + (height - fontSize) / 2 + paddingY;
            page.drawText(value, {
              x: x + paddingX,
              y: textY,
              size: fontSize,
              font: textFont,
              color: rgb(0.1, 0.1, 0.1),
            });
            return;
          }

          if (field.type === "textarea") {
            const fontSize = Math.min(11, Math.max(8, height * 0.18));
            const lineHeight = fontSize * 1.2;
            const maxLines = Math.floor((height - paddingY * 2) / lineHeight);
            const lines = wrapText(value, fontSize, width - paddingX * 2);
            lines.slice(0, maxLines).forEach((line, index) => {
              const textY = y + height - paddingY - lineHeight * (index + 1);
              page.drawText(line, {
                x: x + paddingX,
                y: textY,
                size: fontSize,
                font: textFont,
                color: rgb(0.1, 0.1, 0.1),
              });
            });
            return;
          }

          if (field.type === "sign") {
            const fontSize = Math.min(20, Math.max(11, height * 0.65));
            const textWidth = signatureFont.widthOfTextAtSize(value, fontSize);
            const textX = x + (width - textWidth) / 2;
            const textY = y + (height - fontSize) / 2 + paddingY;
            page.drawText(value, {
              x: textX,
              y: textY,
              size: fontSize,
              font: signatureFont,
              color: rgb(0.18, 0.2, 0.35),
            });
          }
        });

        const outputBytes = await pdfDoc.save();
        const key = `document-requests/${request.id}/completed-${randomUUID()}.pdf`;
        await getR2Client().send(
          new PutObjectCommand({
            Bucket: getR2Bucket(),
            Key: key,
            Body: Buffer.from(outputBytes),
            ContentType: "application/pdf",
          }),
        );

        await prisma.documentRequest.update({
          where: { id: request.id },
          data: {
            status: "completed",
            resultUrl: key,
            completedAt: new Date(),
            completedByName: "Workflow",
          },
        });

        const path = `/public/documents/${request.publicToken}`;
        const publicUrl = `${getAppBaseUrl()}${path}`;
        const output = {
          requestId: request.id,
          templateId,
          templateName: template.name,
          publicToken: request.publicToken,
          path,
          publicUrl,
          resultUrl: `/api/document-requests/${request.id}/file`,
          status: "completed",
        };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: null };
      }

      if (node.type === "reglo-email") {
        const rawTo = settings.to?.trim();
        const rawSubject = settings.subject?.trim();
        const rawBody = settings.body ?? "";
        if (!rawTo) {
          throw new Error("Destinatario email obbligatorio");
        }
        if (!rawSubject) {
          throw new Error("Oggetto email obbligatorio");
        }
        if (!rawBody.trim()) {
          throw new Error("Corpo email obbligatorio");
        }
        const to = interpolateTemplate(rawTo, context);
        const subject = interpolateTemplate(rawSubject, context);
        const body = interpolateTemplate(rawBody, context);
        const from = settings.from?.trim() || undefined;
        await sendDynamicEmail({ to, subject, body, from });
        const output = { to, subject };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: null };
      }

      const normalizeSetting = (value: unknown) =>
        typeof value === "string" ? value : value == null ? "" : String(value);

      if (node.type === "fic-create-invoice") {
        const rawClientId = normalizeSetting(settings.clientId).trim();
        const rawAmount = normalizeSetting(settings.amount).trim();
        const rawCurrency = normalizeSetting(settings.currency).trim() || "EUR";
        const rawDescription = normalizeSetting(settings.description);
        const rawVatTypeId = normalizeSetting(settings.vatTypeId).trim();
        const rawDueDate = normalizeSetting(settings.dueDate).trim();

        if (!rawClientId) {
          throw new Error("Cliente FIC obbligatorio");
        }
        if (!rawAmount) {
          throw new Error("Importo obbligatorio");
        }
        if (!rawVatTypeId) {
          throw new Error("Aliquota IVA obbligatoria");
        }

        const clientId = interpolateTemplate(rawClientId, context);
        const amountValue = Number(interpolateTemplate(rawAmount, context));
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          throw new Error("Importo non valido");
        }
        const currency = interpolateTemplate(rawCurrency, context) || "EUR";
        const description =
          interpolateTemplate(rawDescription || "Servizio", context) || "Servizio";
        const vatTypeId = interpolateTemplate(rawVatTypeId, context);
        const dueDateRaw = rawDueDate
          ? interpolateTemplate(rawDueDate, context)
          : "";
        const dueDate = (() => {
          const value = dueDateRaw.trim();
          if (!value) return "";
          if (value.includes("/")) {
            const [day, month, year] = value.split("/");
            if (day && month && year) {
              return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
            }
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value;
          }
          throw new Error("Formato scadenza non valido (usa GG/MM/AAAA).");
        })();

        const { token, entityId, entityName } = await getFicConnection(run.companyId);
        const vatTypes = await ficFetch(
          `/c/${entityId}/info/vat_types`,
          token,
          { method: "GET" },
        );
        const vatList = Array.isArray(vatTypes)
          ? vatTypes
          : ((vatTypes as { data?: unknown }).data as Array<{
              id?: string;
              value?: number | string;
            }>) ?? [];
        const vatMatch = vatList.find((vat) => String(vat.id) === vatTypeId);
        const vatRateRaw =
          vatMatch?.value != null ? Number(vatMatch.value) : null;
        const vatRate = Number.isFinite(vatRateRaw) ? vatRateRaw : null;
        const grossAmount = vatRate != null
          ? Number((amountValue * (1 + vatRate / 100)).toFixed(2))
          : amountValue;
        const paymentMethod =
          dueDate && (await (async () => {
            const paymentMethodsPayload = await (async () => {
              try {
                return await ficFetch(
                  `/c/${entityId}/settings/payment_methods`,
                  token,
                  { method: "GET" },
                );
              } catch {
                return await ficFetch(
                  `/c/${entityId}/info/payment_methods`,
                  token,
                  { method: "GET" },
                );
              }
            })();
            const paymentMethodList = Array.isArray(paymentMethodsPayload)
              ? paymentMethodsPayload
              : ((paymentMethodsPayload as { data?: unknown }).data as Array<{
                  id?: string | number;
                  name?: string;
                  type?: string;
                }>) ?? [];
            return paymentMethodList[0] ?? null;
          })());
        if (dueDate && !paymentMethod?.id) {
          throw new Error("Nessun metodo di pagamento FIC disponibile.");
        }
        const clientDetails = await ficFetch(
          `/c/${entityId}/entities/clients/${clientId}`,
          token,
          { method: "GET" },
        );
        const clientData =
          clientDetails && typeof clientDetails === "object" && "data" in clientDetails
            ? (clientDetails as { data?: Record<string, unknown> }).data ?? {}
            : (clientDetails as Record<string, unknown>) ?? {};
        const resolvedName =
          (clientData.name as string | undefined) ||
          (clientData.company_name as string | undefined) ||
          [
            clientData.firstname as string | undefined,
            clientData.lastname as string | undefined,
          ]
            .filter(Boolean)
            .join(" ") ||
          "Cliente";

        const buildPayload = (paymentAmount: number | null) => ({
          data: {
            type: "invoice",
            entity: { id: clientId, name: resolvedName },
            currency: { code: currency },
            language: { code: "it", name: "Italiano" },
            items_list: [
              {
                name: description,
                qty: 1,
                net_price: amountValue,
                vat: { id: vatTypeId },
              },
            ],
            ...(dueDate && paymentAmount != null && paymentMethod?.id
              ? {
                  payment_method: {
                    id: Number(paymentMethod.id),
                    name: paymentMethod.name,
                    type: paymentMethod.type,
                  },
                  payments_list: [
                    {
                      amount: paymentAmount,
                      due_date: dueDate,
                    },
                  ],
                }
              : {}),
          },
        });

        const createInvoice = async (paymentAmount: number | null) => {
          const response = await fetch(
            `https://api-v2.fattureincloud.it/c/${entityId}/issued_documents`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(buildPayload(paymentAmount)),
            },
          );
          const rawText = await response.text();
          let json: unknown = null;
          try {
            json = rawText ? JSON.parse(rawText) : null;
          } catch {
            json = null;
          }
          if (!response.ok) {
            return {
              ok: false,
              message:
                (json as { error?: { message?: string } } | null)?.error?.message ||
                rawText ||
                "Errore Fatture in Cloud",
              amountDue: (json as { extra?: { totals?: { amount_due?: number } } } | null)?.extra
                ?.totals?.amount_due ?? null,
              raw: json,
            } as const;
          }
          return { ok: true, data: json } as const;
        };

        let createResult = await createInvoice(
          dueDate ? grossAmount : null,
        );
        if (
          !createResult.ok &&
          createResult.amountDue != null &&
          typeof createResult.amountDue === "number" &&
          createResult.message.includes("pagamenti")
        ) {
          createResult = await createInvoice(createResult.amountDue);
        }
        if (!createResult.ok) {
          throw new Error(createResult.message);
        }

        const result = createResult.data as
          | { data?: { id?: string | number }; id?: string | number }
          | null;

        const output = {
          entityId,
          entityName,
          invoiceId: result?.data?.id ?? result?.id ?? null,
          dueDate: dueDate || null,
          raw: result,
        };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: null };
      }

      if (node.type === "fic-update-status") {
        const rawInvoiceId = normalizeSetting(settings.invoiceId).trim();
        const rawStatus = normalizeSetting(settings.status).trim();
        if (!rawInvoiceId) {
          throw new Error("ID fattura obbligatorio");
        }
        if (!rawStatus) {
          throw new Error("Stato fattura obbligatorio");
        }
        const invoiceId = interpolateTemplate(rawInvoiceId, context);
        const statusInput = interpolateTemplate(rawStatus, context);
        const statusMap: Record<string, string> = {
          Pagata: "paid",
          "In sospeso": "not_paid",
          Annullata: "cancelled",
        };
        const status = statusMap[statusInput] ?? statusInput;

        const { token, entityId, entityName } = await getFicConnection(run.companyId);
        const result = await ficFetch(
          `/c/${entityId}/issued_documents/${invoiceId}/status`,
          token,
          {
            method: "POST",
            body: JSON.stringify({ status }),
          },
        );

        const output = { entityId, entityName, invoiceId, status, raw: result };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: null };
      }

      const output = { message: "Step executed (stub)" };
      stepOutputs[nodeId] = output;
      await prisma.workflowRunStep.updateMany({
        where: { runId: run.id, nodeId },
        data: {
          status: "completed",
          output,
          finishedAt: new Date(),
        },
      });
      return { branch: null };
    };

    let current: string | null = executionOrder[0] ?? null;
    let stepsVisited = 0;

    while (current && stepsVisited < maxSteps) {
      stepsVisited += 1;
      let branch: string | null = null;
      let attempt = 0;
      while (attempt < maxAttempts) {
        attempt += 1;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId: current },
          data: { attempt },
        });
        try {
          const result = await executeNode(current);
          branch = result.branch ?? null;
          break;
        } catch (error) {
          if (attempt >= maxAttempts) {
            await prisma.workflowRunStep.updateMany({
              where: { runId: run.id, nodeId: current },
              data: {
                status: "failed",
                error: {
                  message: error instanceof Error ? error.message : "Step failed",
                },
                finishedAt: new Date(),
              },
            });
            await prisma.workflowRun.update({
              where: { id: run.id },
              data: { status: "failed", finishedAt: new Date() },
            });
            return { status: "failed" };
          }
          await new Promise((resolve) =>
            setTimeout(resolve, backoffSeconds * 1000),
          );
        }
      }

      current = getNextNodeId(current, edges, branch);
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
      },
    });

    return { status: "completed" };
  },
});
