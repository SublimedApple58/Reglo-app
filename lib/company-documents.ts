/** Tipi e costanti condivisi dei documenti autoscuola (client + server). */

export const DOCUMENT_KINDS = ["contract", "invoice", "other"] as const;
export type CompanyDocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<CompanyDocumentKind, string> = {
  contract: "Contratto",
  invoice: "Fattura",
  other: "Altro documento",
};

export type CompanyDocumentDto = {
  id: string;
  kind: CompanyDocumentKind;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export function formatDocumentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
