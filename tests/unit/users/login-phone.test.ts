import { isPhoneIdentifier, normalizeLoginPhone } from "@/lib/users/login-phone";
import { isUndeliverableEmail } from "@/lib/users/placeholder-email";

describe("login col telefono", () => {
  it("riconosce un telefono dall'assenza della @", () => {
    expect(isPhoneIdentifier("333 1234567")).toBe(true);
    expect(isPhoneIdentifier("+39 333 1234567")).toBe(true);
    expect(isPhoneIdentifier("mario@esempio.it")).toBe(false);
    expect(isPhoneIdentifier("   ")).toBe(false);
  });

  it("porta le varie scritture dello stesso numero allo stesso E.164", () => {
    for (const raw of ["3331234567", "333 123 4567", "+39 333 1234567", "0039 333-1234567", "393331234567"]) {
      expect(normalizeLoginPhone(raw)).toBe("+393331234567");
    }
  });

  it("accetta un numero estero col suo prefisso", () => {
    expect(normalizeLoginPhone("+41 79 123 45 67")).toBe("+41791234567");
  });

  it("rifiuta un numero inutilizzabile", () => {
    expect(normalizeLoginPhone("")).toBeNull();
    expect(normalizeLoginPhone("12345")).toBeNull();
    expect(normalizeLoginPhone("abc")).toBeNull();
  });
});

describe("isUndeliverableEmail", () => {
  it("riconosce segnaposto e account eliminati", () => {
    expect(isUndeliverableEmail("allievo+abc@no-app.reglo.local")).toBe(true);
    expect(isUndeliverableEmail("deleted+abc@deleted.reglo.local")).toBe(true);
    expect(isUndeliverableEmail("")).toBe(true);
    expect(isUndeliverableEmail(null)).toBe(true);
    expect(isUndeliverableEmail("mario@esempio.it")).toBe(false);
  });
});
