import { isWhatsAppCapable, normalizeToE164 } from "@/lib/phone-e164";

/**
 * La regola che conta è la prudenza: davanti a un numero ambiguo si rinuncia.
 * Un messaggio mandato al numero sbagliato è peggio di un messaggio non mandato.
 */
describe("normalizeToE164", () => {
  it("lascia stare un numero già in E.164", () => {
    const res = normalizeToE164("+393331234567");
    expect(res).toEqual({ ok: true, e164: "+393331234567", changed: false });
  });

  it("aggiunge +39 a un cellulare italiano senza prefisso (il caso dei 795)", () => {
    expect(normalizeToE164("3331234567")).toEqual({
      ok: true,
      e164: "+393331234567",
      changed: true,
    });
  });

  it("accetta i cellulari a 9 cifre dopo il 3", () => {
    expect(normalizeToE164("333123456")).toEqual({
      ok: true,
      e164: "+39333123456",
      changed: true,
    });
  });

  it("toglie spazi, punti, trattini e parentesi", () => {
    expect(normalizeToE164("333 12.34-567")).toMatchObject({ e164: "+393331234567" });
    expect(normalizeToE164("(+39) 333 1234567")).toMatchObject({ e164: "+393331234567" });
  });

  it("tratta 0039 come +39", () => {
    expect(normalizeToE164("00393331234567")).toMatchObject({ e164: "+393331234567" });
  });

  it("riconosce il prefisso 39 senza + quando segue un cellulare plausibile", () => {
    expect(normalizeToE164("393331234567")).toMatchObject({ e164: "+393331234567" });
  });

  it("toglie il prefisso whatsapp: che si portava dietro il vecchio codice", () => {
    expect(normalizeToE164("whatsapp:+393331234567")).toMatchObject({
      e164: "+393331234567",
    });
  });

  it("converte anche un fisso italiano", () => {
    expect(normalizeToE164("0445060017")).toMatchObject({ e164: "+390445060017" });
  });

  it("tiene i numeri esteri come sono", () => {
    expect(normalizeToE164("+4915112345678")).toMatchObject({
      e164: "+4915112345678",
      changed: false,
    });
  });

  // ── I casi in cui si rinuncia ────────────────────────────────────────────
  it("rifiuta il vuoto", () => {
    expect(normalizeToE164("")).toEqual({ ok: false, reason: "vuoto" });
    expect(normalizeToE164(null)).toEqual({ ok: false, reason: "vuoto" });
    expect(normalizeToE164(undefined)).toEqual({ ok: false, reason: "vuoto" });
  });

  it("rifiuta un numero troppo corto invece di indovinare", () => {
    expect(normalizeToE164("12345")).toEqual({ ok: false, reason: "troppo corto" });
  });

  it("rifiuta oltre le 15 cifre di E.164", () => {
    expect(normalizeToE164("+1234567890123456")).toEqual({
      ok: false,
      reason: "troppo lungo",
    });
  });

  it("rifiuta quello che non è un numero", () => {
    expect(normalizeToE164("chiedere in segreteria")).toEqual({
      ok: false,
      reason: "ambiguo",
    });
    expect(normalizeToE164("333/1234567 oppure 3387654321")).toEqual({
      ok: false,
      reason: "ambiguo",
    });
  });

  it("NON inventa un prefisso per un numero che non sembra italiano", () => {
    // 8 cifre che non iniziano né per 3 né per 0: potrebbe essere di chiunque.
    expect(normalizeToE164("55512345")).toEqual({ ok: false, reason: "ambiguo" });
  });
});

describe("isWhatsAppCapable", () => {
  it("accetta un cellulare in E.164", () => {
    expect(isWhatsAppCapable("+393331234567")).toBe(true);
  });

  it("scarta i fissi italiani: su WhatsApp non ci sono, è un tentativo pagato a vuoto", () => {
    expect(isWhatsAppCapable("+390445060017")).toBe(false);
  });

  it("scarta quello che non è E.164", () => {
    expect(isWhatsAppCapable("3331234567")).toBe(false);
    expect(isWhatsAppCapable("+39")).toBe(false);
  });
});
