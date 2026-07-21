import "server-only";

import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
