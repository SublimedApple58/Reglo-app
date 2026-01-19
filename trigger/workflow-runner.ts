import { task, wait } from "@trigger.dev/sdk/v3";
import { prisma } from "@/db/prisma";
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
              result,
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
        template.fields.forEach((field) => {
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
