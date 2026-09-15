import {
  buildPlaceholderEmail,
  displayEmail,
  isPlaceholderEmail,
} from "@/lib/users/placeholder-email";

describe("placeholder email", () => {
  it("costruisce un indirizzo sul dominio riservato", () => {
    const email = buildPlaceholderEmail("abc-123");
    expect(email).toBe("allievo+abc-123@no-app.reglo.local");
    expect(isPlaceholderEmail(email)).toBe(true);
  });

  it("riconosce il segnaposto anche con maiuscole", () => {
    expect(isPlaceholderEmail("Allievo+X@No-App.Reglo.Local")).toBe(true);
  });

  it("non scambia per segnaposto un'email vera", () => {
    expect(isPlaceholderEmail("mario@example.com")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
  });

  it("nasconde il segnaposto in UI e lascia passare le email vere", () => {
    expect(displayEmail(buildPlaceholderEmail("seed"))).toBeNull();
    expect(displayEmail("")).toBeNull();
    expect(displayEmail("mario@example.com")).toBe("mario@example.com");
  });
});
