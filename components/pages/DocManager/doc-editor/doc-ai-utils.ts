"use client";

import { pdfjs } from "react-pdf";

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export type DocAiLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocAiPage = {
  page: number;
  lines: DocAiLine[];
};

const DEFAULT_WORKER_SRC = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const labelKeywords = [
  "nome",
  "cognome",
  "email",
  "e-mail",
  "telefono",
  "cell",
  "indirizzo",
  "città",
  "cap",
  "provincia",
  "data",
  "luogo",
  "firma",
  "ragione sociale",
  "azienda",
  "cliente",
  "fornitore",
  "partita iva",
  "p.iva",
  "codice fiscale",
  "iban",
  "importo",
  "totale",
  "scadenza",
  "note",
  "descrizione",
];

const isLabelCandidate = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return false;
  if (normalized.includes("____") || normalized.includes(".....")) return true;
  if (normalized.endsWith(":") || normalized.endsWith(":.") || normalized.endsWith(";")) {
    return true;
  }
  return labelKeywords.some((keyword) => normalized.includes(keyword));
};

const round = (value: number, digits = 4) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export async function extractDocAiLines(
  fileUrl: string,
  options?: { maxLinesPerPage?: number }
): Promise<DocAiPage[]> {
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = DEFAULT_WORKER_SRC;
  }

  const maxLinesPerPage = options?.maxLinesPerPage ?? 80;

  const loadingTask = pdfjs.getDocument({
    url: fileUrl,
    withCredentials: true,
  });
  const pdf = await loadingTask.promise;
  const pages: DocAiPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = (content.items as PdfTextItem[])
      .filter((item) => (item.str ?? "").trim().length > 0)
      .map((item) => {
        const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
        const rawX = transform[4] ?? 0;
        const rawY = transform[5] ?? 0;
        const width = item.width ?? Math.abs(transform[0]) ?? 0;
        const height =
          item.height ??
          Math.max(8, Math.abs(transform[3]) || Math.abs(transform[2]) || 8);
        const x = rawX;
        const yTop = viewport.height - rawY - height;
        return {
          text: (item.str ?? "").replace(/\s+/g, " ").trim(),
          x,
          y: yTop,
          width,
          height,
        };
      })
      .filter((item) => item.text.length > 0);

    const sorted = items.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    const lines: Array<{ y: number; items: typeof sorted }> = [];
    let current: { y: number; items: typeof sorted } | null = null;

    sorted.forEach((item) => {
      if (!current || Math.abs(item.y - current.y) > 6) {
        current = { y: item.y, items: [item] };
        lines.push(current);
        return;
      }
      current.items.push(item);
    });

    const normalizedLines = lines
      .map((line) => {
        const lineItems = line.items.sort((a, b) => a.x - b.x);
        const text = lineItems.map((item) => item.text).join(" ").trim();
        const xMin = Math.min(...lineItems.map((item) => item.x));
        const yMin = Math.min(...lineItems.map((item) => item.y));
        const xMax = Math.max(...lineItems.map((item) => item.x + item.width));
        const yMax = Math.max(...lineItems.map((item) => item.y + item.height));
        const width = xMax - xMin;
        const height = yMax - yMin;

        return {
          text,
          x: clamp01(xMin / viewport.width),
          y: clamp01(yMin / viewport.height),
          width: clamp01(width / viewport.width),
          height: clamp01(height / viewport.height),
        };
      })
      .filter((line) => line.text.length > 0);

    const candidates = normalizedLines.filter((line) => isLabelCandidate(line.text));
    const selected =
      (candidates.length > 0 ? candidates : normalizedLines).slice(0, maxLinesPerPage);

    pages.push({
      page: pageNumber,
      lines: selected.map((line) => ({
        text: line.text,
        x: round(line.x),
        y: round(line.y),
        width: round(line.width),
        height: round(line.height),
      })),
    });
  }

  return pages;
}
