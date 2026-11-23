import {
  DEFAULT_WELCOME_TEMPLATE,
  buildWhatsAppLink,
  insertToken,
  licenseCategoryWithArticle,
  renderWelcomeMessage,
  resolveWelcomeTemplate,
  staffFirstName,
} from "@/lib/autoscuole/whatsapp-welcome";

/**
 * REG-767 — il messaggio di presa in carico e il link `wa.me`.
 */

const values = {
  nome: "Giulia",
  cognome: "Rossi",
  staff: "Marta",
  autoscuola: "Consorzio Riunite",
  categoria: "la CQC persone",
};

describe("renderWelcomeMessage", () => {
  it("compila il testo di default", () => {
    expect(renderWelcomeMessage(DEFAULT_WELCOME_TEMPLATE, values)).toBe(
      "Ciao Giulia! Sono Marta di Consorzio Riunite, abbiamo preso in carico la tua iscrizione per la CQC persone: da adesso ti seguiamo noi",
    );
  });

  it("{scuola} è la consorziata, e fuori dal consorzio l'azienda", () => {
    const template = "Arrivi da {scuola}, {cognome}";
    expect(renderWelcomeMessage(template, { ...values, scuola: "Autoscuola Centrale" })).toBe(
      "Arrivi da Autoscuola Centrale, Rossi",
    );
    expect(renderWelcomeMessage(template, values)).toBe("Arrivi da Consorzio Riunite, Rossi");
  });

  it("lascia com'è un segnaposto sconosciuto e non distingue maiuscole", () => {
    expect(renderWelcomeMessage("Ciao {Nome} {telefono}", values)).toBe("Ciao Giulia {telefono}");
  });

  it("non lascia doppi spazi quando un valore manca", () => {
    expect(renderWelcomeMessage("Sono {staff} di {autoscuola}", { ...values, staff: "" })).toBe(
      "Sono di Consorzio Riunite",
    );
  });
});

describe("licenseCategoryWithArticle", () => {
  it.each([
    ["B", "la patente B"],
    ["C", "la patente C"],
    ["CQC", "la CQC merci"],
    ["CQCP", "la CQC persone"],
    ["ADR", "il patentino ADR"],
    [null, "la patente"],
  ])("%s → %s", (category, expected) => {
    expect(licenseCategoryWithArticle(category)).toBe(expected);
  });
});

describe("resolveWelcomeTemplate e staffFirstName", () => {
  it("vuoto o assente = default", () => {
    expect(resolveWelcomeTemplate(undefined)).toBe(DEFAULT_WELCOME_TEMPLATE);
    expect(resolveWelcomeTemplate("   ")).toBe(DEFAULT_WELCOME_TEMPLATE);
    expect(resolveWelcomeTemplate("Ciao {nome}")).toBe("Ciao {nome}");
  });

  it("primo nome, mai il segnaposto del database", () => {
    expect(staffFirstName("Marta Bianchi")).toBe("Marta");
    expect(staffFirstName("NO_NAME")).toBe("");
    expect(staffFirstName(null)).toBe("");
  });
});

describe("buildWhatsAppLink", () => {
  it("cellulare senza prefisso → wa.me col +39 e il testo codificato", () => {
    const link = buildWhatsAppLink("333 123 4567", "Ciao Giulia! A presto");
    expect(link).toEqual({
      state: "ready",
      e164: "+393331234567",
      href: "https://wa.me/393331234567?text=Ciao%20Giulia!%20A%20presto",
    });
  });

  it("numero estero con il + resta com'è", () => {
    const link = buildWhatsAppLink("+44 7700 900123", "x");
    expect(link.state).toBe("ready");
    if (link.state === "ready") expect(link.href).toMatch(/^https:\/\/wa\.me\/447700900123\?/);
  });

  it("numero assente → missing", () => {
    expect(buildWhatsAppLink(null, "x")).toEqual({ state: "missing" });
    expect(buildWhatsAppLink("   ", "x")).toEqual({ state: "missing" });
  });

  it("ambiguo, troppo corto o fisso → invalid", () => {
    expect(buildWhatsAppLink("12345", "x")).toEqual({ state: "invalid" });
    expect(buildWhatsAppLink("abc 123 4567", "x")).toEqual({ state: "invalid" });
    expect(buildWhatsAppLink("06 1234 5678", "x")).toEqual({ state: "invalid" });
    expect(buildWhatsAppLink("4471234567", "x")).toEqual({ state: "invalid" });
  });
});

describe("REG-771 bis: insertToken", () => {
  it("entra al punto del cursore senza spazi doppi", () => {
    expect(insertToken("Ciao !", 5, 5, "{nome}")).toEqual({ text: "Ciao {nome}!", caret: 11 });
  });

  it("aggiunge lo spazio prima e dopo quando mancano", () => {
    expect(insertToken("Ciaoda adesso", 4, 4, "{nome}").text).toBe("Ciao {nome} da adesso");
  });

  it("sostituisce la selezione", () => {
    expect(insertToken("Sono Marco di X", 5, 10, "{staff}").text).toBe("Sono {staff} di X");
  });

  it("in un campo vuoto non aggiunge spazi", () => {
    expect(insertToken("", 0, 0, "{nome}")).toEqual({ text: "{nome}", caret: 6 });
  });
});
