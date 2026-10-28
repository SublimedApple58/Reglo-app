import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/db/prisma";
import { getR2Bucket, getR2Client } from "@/lib/storage/r2";
import {
  AVATAR_CACHE_CONTROL,
  avatarVariantKey,
  buildAvatarJpeg,
  canHaveAvatarVariant,
} from "@/lib/images/avatar-variant";

/**
 * Crea la copia avatar 512 px della foto profilo appena salvata e la registra
 * su `User.imageAvatar`. Best-effort: se fallisce (es. HEIC non decodificabile)
 * l'avatar resta l'originale, come prima. Va chiamata DOPO aver scritto
 * `User.image` con la stessa chiave.
 */
export async function saveAvatarVariant(input: { userId: string; imageKey: string; original?: Buffer }) {
  if (!canHaveAvatarVariant(input.imageKey)) return;
  try {
    const original = input.original ?? (await readObject(input.imageKey));
    const jpeg = await buildAvatarJpeg(original);
    const key = avatarVariantKey(input.imageKey);
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: jpeg,
        ContentType: "image/jpeg",
        CacheControl: AVATAR_CACHE_CONTROL,
      }),
    );
    // Solo se la foto è ancora quella: un caricamento più recente vince.
    await prisma.user.updateMany({
      where: { id: input.userId, image: input.imageKey },
      data: { imageAvatar: key },
    });
  } catch (error) {
    console.warn("[avatar] copia 512 non creata", input.imageKey, error);
  }
}

async function readObject(key: string): Promise<Buffer> {
  const res = await getR2Client().send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("oggetto vuoto");
  return Buffer.from(bytes);
}
