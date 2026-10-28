import sharp from "sharp";

import {
  AVATAR_SIZE,
  avatarVariantKey,
  buildAvatarJpeg,
  canHaveAvatarVariant,
  currentAvatarKey,
} from "@/lib/images/avatar-variant";

describe("avatar-variant (REG-639 giro Road)", () => {
  const image = "users/u1/photo-abc.png";

  it("deriva la chiave della copia dall'originale", () => {
    expect(avatarVariantKey(image)).toBe("users/u1/photo-abc.png.avatar-512.jpg");
  });

  it("usa la copia solo se è quella della foto attuale", () => {
    expect(currentAvatarKey(image, avatarVariantKey(image))).toBe(avatarVariantKey(image));
    // Foto cambiata da un percorso che non ha aggiornato la copia: si torna all'originale.
    expect(currentAvatarKey("users/u1/photo-new.png", avatarVariantKey(image))).toBeNull();
    expect(currentAvatarKey(image, null)).toBeNull();
    expect(currentAvatarKey(null, avatarVariantKey(image))).toBeNull();
  });

  it("non crea copie per gli URL esterni", () => {
    expect(canHaveAvatarVariant("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(canHaveAvatarVariant(image)).toBe(true);
  });

  it("produce un JPEG quadrato 512 px", async () => {
    const original = await sharp({
      create: { width: 1056, height: 1158, channels: 3, background: { r: 120, g: 90, b: 60 } },
    })
      .png()
      .toBuffer();
    const out = await buildAvatarJpeg(original);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(AVATAR_SIZE);
    expect(meta.height).toBe(AVATAR_SIZE);
    expect(out.length).toBeLessThan(original.length);
  });
});
