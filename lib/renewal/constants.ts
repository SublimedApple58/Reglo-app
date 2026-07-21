/**
 * Rinnovo Patenti — shared enums/labels (string-enum convention, matching the
 * `String @default(...)` columns in the schema).
 */

export const RENEWAL_DOCUMENT_TYPES = [
  "identity",
  "license",
  "photo",
  "anamnestic",
] as const;
export type RenewalDocumentType = (typeof RENEWAL_DOCUMENT_TYPES)[number];

/**
 * Documents the citizen MUST provide. The anamnestic certificate is NOT
 * mandated nationally (see docs/features/rinnovo-patenti.md) but many medici
 * require it, so each autoscuola can make it required via
 * `licenseRenewalAnamnesticRequired`.
 */
export const BASE_REQUIRED_DOCUMENT_TYPES: RenewalDocumentType[] = [
  "identity",
  "license",
  "photo",
];

export const requiredDocumentTypes = (
  anamnesticRequired: boolean,
): RenewalDocumentType[] =>
  anamnesticRequired
    ? [...BASE_REQUIRED_DOCUMENT_TYPES, "anamnestic"]
    : BASE_REQUIRED_DOCUMENT_TYPES;

export const RENEWAL_DOCUMENT_LABELS: Record<RenewalDocumentType, string> = {
  identity: "Documento di identità",
  license: "Patente attuale",
  photo: "Fototessera",
  anamnestic: "Certificato anamnestico",
};

export const RENEWAL_REQUEST_STATUSES = [
  "submitted",
  "under_review",
  "awaiting_documents",
  "approved",
  "rejected",
  "cancelled",
  "completed",
] as const;
export type RenewalRequestStatus = (typeof RENEWAL_REQUEST_STATUSES)[number];

export const RENEWAL_REQUEST_STATUS_LABELS: Record<RenewalRequestStatus, string> = {
  submitted: "Ricevuta",
  under_review: "In revisione",
  awaiting_documents: "In attesa di documenti",
  approved: "Approvata",
  rejected: "Rifiutata",
  cancelled: "Annullata",
  completed: "Completata",
};

/** Resume-link validity for the "ricontatto automatico" email. */
export const RENEWAL_RESUME_TOKEN_DAYS = 7;

export const RENEWAL_BOOKING_STATUSES = [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type RenewalBookingStatus = (typeof RENEWAL_BOOKING_STATUSES)[number];

/** Accepted upload mime types + max size for citizen documents. */
export const RENEWAL_UPLOAD_ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const RENEWAL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
