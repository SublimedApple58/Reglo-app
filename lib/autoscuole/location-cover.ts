import "server-only";

import { randomUUID } from "crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { prisma } from "@/db/prisma";
import { getR2Bucket, getR2Client, getSignedAssetUrl } from "@/lib/storage/r2";

/**
 * Foto di copertina della SEDE (REG-639). La carica il titolare da
 * Impostazioni → Sede e luoghi; l'app istruttore la mostra in testa a
 * Disponibilità. Solo la sede (`isDefault`) ha una foto: gli altri luoghi
 * sono parcheggi e punti di ritrovo, non sedi.
 *
 * L'URL è quello pubblico di R2 (`R2_PUBLIC_BASE_URL`, impostato in ogni
 * ambiente): non scade. Ogni caricamento scrive una chiave nuova, quindi chi
 * ha in cache la foto vecchia non la rivede mai al posto della nuova.
 */

/** Lato lungo massimo salvato: la copertina mobile è 402 pt @3x ≈ 1206 px. */
const COVER_MAX_WIDTH = 1600;

export async function coverPhotoUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  try {
    return await getSignedAssetUrl(key);
  } catch {
    return null;
  }
}

/**
 * Normalizza la foto (rotazione EXIF applicata, metadati e posizione GPS
 * tolti, JPEG ≤ 1600 px) e la salva come copertina della sede. Restituisce la
 * nuova chiave; la vecchia viene cancellata da R2 (best-effort).
 */
export async function saveSedeCoverPhoto(input: {
  companyId: string;
  locationId: string;
  previousKey: string | null;
  file: Buffer;
}) {
  const jpeg = await sharp(input.file)
    .rotate()
    .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const key = `companies/${input.companyId}/locations/${input.locationId}/cover-${randomUUID()}.jpg`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: jpeg,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  await prisma.autoscuolaLocation.update({
    where: { id: input.locationId },
    data: { coverPhotoKey: key },
  });
  await deleteCoverObject(input.previousKey);
  return key;
}

export async function removeSedeCoverPhoto(input: { locationId: string; previousKey: string | null }) {
  await prisma.autoscuolaLocation.update({
    where: { id: input.locationId },
    data: { coverPhotoKey: null },
  });
  await deleteCoverObject(input.previousKey);
}

async function deleteCoverObject(key: string | null) {
  if (!key || /^https?:\/\//.test(key)) return;
  try {
    await getR2Client().send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }));
  } catch (error) {
    // Un oggetto orfano su R2 non deve far fallire il salvataggio.
    console.error("Copertina sede: cancellazione file R2 fallita", error);
  }
}

/**
 * Copertina da mostrare a un membro per ogni sua autoscuola: la foto del suo
 * luogo di default (`CompanyMember.defaultLocationId`) se ne ha una, altrimenti
 * quella della sede; null = l'app usa il segnaposto. Una query sola per tutte
 * le autoscuole del membro.
 */
export async function resolveCoverPhotoUrls(
  memberships: { companyId: string; defaultLocationId: string | null }[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!memberships.length) return result;
  const locations = await prisma.autoscuolaLocation.findMany({
    where: {
      companyId: { in: memberships.map((m) => m.companyId) },
      archivedAt: null,
      coverPhotoKey: { not: null },
    },
    select: { id: true, companyId: true, isDefault: true, coverPhotoKey: true },
  });
  for (const m of memberships) {
    const own = m.defaultLocationId
      ? locations.find((l) => l.id === m.defaultLocationId)
      : undefined;
    const sede = locations.find((l) => l.companyId === m.companyId && l.isDefault);
    result.set(m.companyId, await coverPhotoUrl((own ?? sede)?.coverPhotoKey));
  }
  return result;
}
