import "server-only";

import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2Bucket } from "@/lib/storage/r2";

/**
 * Rinnovo Patenti — R2 storage for citizen documents.
 * Key layout: renewal/{companyId}/{requestId}/{type}-{uuid}.{ext}
 */

const extFromContentType = (contentType: string): string => {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
};

export async function putRenewalDocument(input: {
  companyId: string;
  requestId: string;
  type: string;
  bytes: Buffer | Uint8Array;
  contentType: string;
}): Promise<string> {
  const ext = extFromContentType(input.contentType);
  const key = `renewal/${input.companyId}/${input.requestId}/${input.type}-${randomUUID()}.${ext}`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
    }),
  );
  return key;
}

// TTL breve: i documenti d'identità sono riservati, l'URL serve solo per la
// visualizzazione immediata nella console titolare.
const VIEW_URL_TTL_SECONDS = 300;

/**
 * URL di visualizzazione SEMPRE firmato e a scadenza per i documenti dei
 * cittadini. NON usare `getSignedAssetUrl`: con `R2_PUBLIC_BASE_URL` impostata
 * ritornerebbe un URL pubblico permanente (vietato per file riservati — vedi
 * docs/features/company-documents.md).
 */
export async function signedRenewalDocumentUrl(fileKey: string): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: fileKey,
    }),
    { expiresIn: VIEW_URL_TTL_SECONDS },
  );
}
