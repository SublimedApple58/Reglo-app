import sharp from "sharp";

/**
 * Copia «avatar» delle foto profilo (REG-639 giro Road, Tiziano 28/10/2026).
 *
 * Le foto profilo si salvano ORIGINALI (richiesta esplicita: servono intatte,
 * es. documenti dell'allievo) e pesano anche 2–3 MB: gli avatar dell'app le
 * scaricavano intere. Accanto all'originale si salva quindi una copia
 * quadrata 512 px JPEG (rotazione EXIF applicata, metadati tolti), immutabile
 * e con Cache-Control lungo. L'originale non si tocca mai.
 *
 * Modulo senza `server-only`: lo usa anche lo script di recupero
 * (`scripts/avatar-variants.ts`).
 */

export const AVATAR_SIZE = 512;
export const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Chiave della copia: derivata dall'originale, così non può mai riferirsi a un'altra foto. */
export function avatarVariantKey(imageKey: string): string {
  return `${imageKey.replace(/^\/+/, "")}.avatar-${AVATAR_SIZE}.jpg`;
}

/** Solo le chiavi R2 nostre hanno una copia (non gli URL esterni, es. Google). */
export function canHaveAvatarVariant(imageKey: string | null | undefined): imageKey is string {
  return !!imageKey && !/^https?:\/\//.test(imageKey);
}

/** La copia salvata vale solo se è quella dell'immagine attuale. */
export function currentAvatarKey(image: string | null | undefined, imageAvatar: string | null | undefined): string | null {
  if (!canHaveAvatarVariant(image) || !imageAvatar) return null;
  return imageAvatar === avatarVariantKey(image) ? imageAvatar : null;
}

export async function buildAvatarJpeg(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: "cover", position: "centre", withoutEnlargement: false })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
