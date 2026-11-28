jest.mock("sharp", () => jest.fn());

import { buildSignupInstructor } from "@/lib/autoscuole/signup-instructor";

const sign = jest.fn(async (key: string) => `https://cdn.test/${key}`);

beforeEach(() => sign.mockClear());

describe("buildSignupInstructor", () => {
  it("nessun istruttore (codice di autoscuola o di luogo): null", async () => {
    expect(await buildSignupInstructor(null, sign)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it("istruttore senza utente collegato: nome e colore, niente foto", async () => {
    expect(await buildSignupInstructor({ name: "Mario Rossi", color: "#111111", user: null }, sign)).toEqual({
      name: "Mario Rossi",
      photoUrl: null,
      color: "#111111",
    });
    expect(sign).not.toHaveBeenCalled();
  });

  it("utente senza foto: niente foto, colore automatico", async () => {
    expect(
      await buildSignupInstructor({ name: "Mario", color: null, user: { image: null, imageAvatar: null } }, sign),
    ).toEqual({ name: "Mario", photoUrl: null, color: null });
  });

  it("usa la copia avatar quando è quella della foto attuale", async () => {
    const out = await buildSignupInstructor(
      { name: "Mario", color: null, user: { image: "users/u1/foto.jpg", imageAvatar: "users/u1/foto.jpg.avatar-512.jpg" } },
      sign,
    );
    expect(out?.photoUrl).toBe("https://cdn.test/users/u1/foto.jpg.avatar-512.jpg");
  });

  it("copia avatar di una foto vecchia: serve l'originale", async () => {
    const out = await buildSignupInstructor(
      { name: "Mario", color: null, user: { image: "users/u1/nuova.jpg", imageAvatar: "users/u1/vecchia.jpg.avatar-512.jpg" } },
      sign,
    );
    expect(out?.photoUrl).toBe("https://cdn.test/users/u1/nuova.jpg");
  });

  it("se la firma dell'URL fallisce resta senza foto", async () => {
    const out = await buildSignupInstructor(
      { name: "Mario", color: "#222222", user: { image: "users/u1/foto.jpg", imageAvatar: null } },
      async () => {
        throw new Error("r2");
      },
    );
    expect(out).toEqual({ name: "Mario", photoUrl: null, color: "#222222" });
  });
});
