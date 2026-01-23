import { randomUUID } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { getR2Bucket, getR2Client } from "@/lib/storage/r2";
import { resolvePayloadValue, streamToBuffer, htmlToText } from "@/trigger/workflow-runner/utils";
import { interpolateTemplate } from "@/lib/workflows/engine";

export type DocCompileArgs = {
  prisma: any;
  run: { id: string; companyId: string; triggerPayload?: unknown };
  nodeId: string;
  settings: Record<string, string>;
  context: { triggerPayload?: unknown; stepOutputs: Record<string, unknown> };
  stepOutputs: Record<string, unknown>;
  getAppBaseUrl: () => string;
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

export const executeDocCompileTemplate = async ({
  prisma,
  run,
  nodeId,
  settings,
  context,
  stepOutputs,
  getAppBaseUrl,
}: DocCompileArgs) => {
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
  const fields = Array.isArray(template.fields) ? (template.fields as TemplateField[]) : [];
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
};
