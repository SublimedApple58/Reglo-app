import "server-only";

import { randomUUID } from "crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket } from "@/lib/storage/r2";
import {
  emptyPackage,
  slidePackageSchema,
  type SlidePackage,
} from "@/lib/aula/slides";

/**
 * Reglo Aula — store del pacchetto slide (.rppt) su R2.
 *
 * Il pacchetto è un oggetto JSON; il DB tiene solo `AulaLesson.packageR2Key`.
 * Template Reglo: `aula/templates/{lessonId}.json`.
 * Fork autoscuola: `aula/{companyId}/{lessonId}.json`.
 * Asset immagine:  `aula/{companyId}/assets/{uuid}.{ext}`.
 *
 * Vedi docs/features/reglo-aula.md.
 */

export const templatePackageKey = (lessonId: string) =>
  `aula/templates/${lessonId}.json`;

export const companyPackageKey = (companyId: string, lessonId: string) =>
  `aula/${companyId}/${lessonId}.json`;

export const assetKey = (companyId: string, ext: string) =>
  `aula/${companyId}/assets/${randomUUID()}.${ext.replace(/^\.+/, "")}`;

async function streamToString(body: unknown): Promise<string> {
  // AWS SDK v3 in Node: Body is a Readable with transformToString helper.
  const maybe = body as { transformToString?: () => Promise<string> };
  if (maybe?.transformToString) return maybe.transformToString();
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Carica e valida il pacchetto da R2. Ritorna un pacchetto vuoto se manca. */
export async function loadPackage(r2Key: string): Promise<SlidePackage> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: r2Key }),
    );
    if (!res.Body) return emptyPackage();
    const raw = await streamToString(res.Body);
    return slidePackageSchema.parse(JSON.parse(raw));
  } catch (err) {
    const code = (err as { name?: string; Code?: string })?.name ?? (err as { Code?: string })?.Code;
    if (code === "NoSuchKey" || code === "NotFound") return emptyPackage();
    throw err;
  }
}

/** Salva (valida + riscrive) il pacchetto su R2. */
export async function savePackage(
  r2Key: string,
  pkg: SlidePackage,
): Promise<void> {
  const validated = slidePackageSchema.parse(pkg);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: r2Key,
      Body: JSON.stringify(validated),
      ContentType: "application/json",
    }),
  );
}

/** Copia il pacchetto da una key all'altra (fork template → company). */
export async function copyPackage(
  srcKey: string,
  destKey: string,
): Promise<void> {
  await getR2Client().send(
    new CopyObjectCommand({
      Bucket: getR2Bucket(),
      CopySource: `${getR2Bucket()}/${srcKey}`,
      Key: destKey,
    }),
  );
}

/**
 * Elimina il pacchetto slide da R2 (best-effort). NON tocca gli asset immagine:
 * vivono in `aula/{companyId}/assets/` — namespace company-wide potenzialmente
 * condiviso tra lezioni, quindi non è sicuro cancellarli con la lezione.
 */
export async function deletePackage(r2Key: string): Promise<void> {
  if (!r2Key) return;
  try {
    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: r2Key }),
    );
  } catch (err) {
    const code =
      (err as { name?: string; Code?: string })?.name ??
      (err as { Code?: string })?.Code;
    if (code === "NoSuchKey" || code === "NotFound") return;
    throw err;
  }
}

/** Carica un'immagine slide su R2, ritorna l'`r2Key`. */
export async function putAsset(
  companyId: string,
  bytes: Buffer | Uint8Array,
  ext: string,
  contentType: string,
): Promise<string> {
  const key = assetKey(companyId, ext);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  return key;
}
