import {
  backofficePasswordProblem,
  generateBackofficeToken,
  hashBackofficePassword,
  hashBackofficeToken,
  safeEqual,
  verifyBackofficePassword,
} from "@/lib/backoffice/admin-credentials";

describe("backoffice admin credentials (REG-413)", () => {
  it("verifica la password giusta e rifiuta quella sbagliata", async () => {
    const stored = await hashBackofficePassword("cavallo-batteria-graffetta");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("cavallo");
    await expect(verifyBackofficePassword("cavallo-batteria-graffetta", stored)).resolves.toBe(true);
    await expect(verifyBackofficePassword("cavallo-batteria-graffettA", stored)).resolves.toBe(false);
  });

  it("usa un sale diverso a ogni hash", async () => {
    const a = await hashBackofficePassword("stessa-password-lunga");
    const b = await hashBackofficePassword("stessa-password-lunga");
    expect(a).not.toBe(b);
  });

  it("rifiuta hash mancanti o di altro formato", async () => {
    await expect(verifyBackofficePassword("qualsiasi", null)).resolves.toBe(false);
    await expect(verifyBackofficePassword("qualsiasi", "abc123")).resolves.toBe(false);
  });

  it("token casuali e hash stabile", () => {
    const token = generateBackofficeToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(generateBackofficeToken()).not.toBe(token);
    expect(hashBackofficeToken(token)).toBe(hashBackofficeToken(token));
    expect(hashBackofficeToken(token)).not.toContain(token);
  });

  it("controlla lunghezza e parole vietate", () => {
    const email = "tiziano.difelice@reglo.it";
    expect(backofficePasswordProblem("corta", email)).toMatch(/almeno 12/);
    expect(backofficePasswordProblem("miapasswordreglo!", email)).toMatch(/reglo/);
    expect(backofficePasswordProblem("TizianoForte2026", email)).toMatch(/nome/);
    expect(backofficePasswordProblem("cavallo-batteria-graffetta", email)).toBeNull();
  });

  it("safeEqual", () => {
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "aa")).toBe(false);
  });
});
