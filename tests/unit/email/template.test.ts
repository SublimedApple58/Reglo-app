import {
  headingFromSubject,
  renderRegloEmail,
  renderRegloEmailText,
  splitParagraphs,
} from "@/email/template";

const render = (content: Parameters<typeof renderRegloEmail>[0]) =>
  renderRegloEmail(content, { baseUrl: "https://app.reglo.it/" });

describe("titolo ricavato dall'oggetto", () => {
  it("toglie il prefisso 'Reglo Autoscuole ·', che dentro la mail è rumore", () => {
    expect(headingFromSubject("Reglo Autoscuole · Guida domani")).toBe("Guida domani");
    expect(headingFromSubject("Reglo · Pagamento registrato")).toBe("Pagamento registrato");
  });

  it("toglie l'emoji iniziale: sta nell'oggetto perché lo stesso testo titola il push", () => {
    expect(headingFromSubject("❌ Guida annullata")).toBe("Guida annullata");
    expect(headingFromSubject("🏖️ Giorno festivo")).toBe("Giorno festivo");
    expect(headingFromSubject("⏰ Slot guida disponibile")).toBe("Slot guida disponibile");
  });

  it("non svuota un oggetto fatto solo di emoji", () => {
    expect(headingFromSubject("🎉")).toBe("🎉");
  });

  it("toglie anche il suffisso '— Reglo', che serve in lista ma non nel titolo", () => {
    expect(headingFromSubject("Il tuo codice per reimpostare la password — Reglo")).toBe(
      "Il tuo codice per reimpostare la password",
    );
    expect(headingFromSubject("Domani hai la guida — Reglo")).toBe("Domani hai la guida");
  });

  it("lascia stare un oggetto già pulito", () => {
    expect(headingFromSubject("Pagamento registrato")).toBe("Pagamento registrato");
  });
});

describe("paragrafi dal testo semplice", () => {
  it("separa sulle righe vuote e tiene gli a capo singoli dentro il paragrafo", () => {
    expect(splitParagraphs("Ciao,\n\nprima riga\nseconda riga\n\nfine")).toEqual([
      "Ciao,",
      "prima riga\nseconda riga",
      "fine",
    ]);
  });
});

describe("HTML della mail", () => {
  const base = { subject: "Guida domani", body: "Promemoria guida il 14 ottobre." };

  it("mette il marchio bianco su pastiglia nera, non il marchio nero su trasparente", () => {
    const html = render(base);
    // In dark mode un marchio nero su fondo trasparente sparirebbe.
    expect(html).toContain("/images/nav/logo-reglo-white.png");
    expect(html).toContain('bgcolor="#111111"');
  });

  it("usa i colori del design system, non la vecchia palette slate", () => {
    const html = render(base);
    expect(html).toContain("#111111");
    expect(html).not.toMatch(/#1E293B|#64748B|#94A3B8|#F1F5F9/i);
  });

  it("non lascia tracce della vecchia palette rosa/gialla del logo storico", () => {
    expect(render(base)).not.toMatch(/#EC4899/i);
  });

  it("non colora niente per tipo di messaggio: la mail è in bianco e nero", () => {
    const html = render({ ...base, eyebrow: "Guida annullata" });
    // Nessun verde/rosso/giallo: l'identità la fanno marchio e carattere.
    expect(html).not.toMatch(/#FACC15|#22C55E|#c13515|#A16207/i);
  });

  it("mette il marchio due volte: testata nera in cima e firma in fondo", () => {
    const html = render(base);
    expect(html.match(/logo-reglo-white\.png/g)).toHaveLength(2);
    expect(html).toContain("La tua autoscuola, semplice.");
    expect(html).toContain("Ricevi questa email perché hai un account Reglo.");
  });

  it("scrive il preheader con la prima riga del corpo, non con la parola 'Reglo'", () => {
    expect(render(base)).toContain("Promemoria guida il 14 ottobre.");
  });

  it("fa l'escape di quello che scrive l'autoscuola", () => {
    const html = render({
      subject: "<b>Avviso</b>",
      body: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rende assoluti i link del logo anche se SERVER_URL finisce con /", () => {
    expect(render(base)).toContain("https://app.reglo.it/images/nav/logo-reglo-white.png");
    expect(render(base)).not.toContain("https://app.reglo.it//images");
  });

  it("mette il riquadro e il testo che lo segue nell'ordine giusto", () => {
    const html = render({
      ...base,
      highlight: { label: "Il tuo codice", value: "123456", mono: true },
      bodyAfter: "Il codice scade tra 10 minuti.",
    });
    expect(html.indexOf("123456")).toBeLessThan(html.indexOf("Il codice scade"));
  });

  it("rende il bottone con il link di riserva quando la CTA apre l'app", () => {
    const html = render({
      ...base,
      cta: { label: "Entra", url: "reglo://invite/abc" },
      fallbackLink: { label: "apri nel browser", url: "https://app.reglo.it/it/invite/abc" },
    });
    expect(html).toContain('href="reglo://invite/abc"');
    expect(html).toContain("apri nel browser");
  });

  it("niente CSS esterno né classi: Gmail scarta <style> e le classi", () => {
    const html = render(base);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sclass=/);
  });
});

describe("versione testo", () => {
  it("riporta titolo, corpo, codice e link del bottone", () => {
    const text = renderRegloEmailText({
      subject: "Reglo · Reimposta la password",
      body: "Ciao Marco,\n\nusa questo codice:",
      highlight: { label: "Il tuo codice", value: "123456" },
      bodyAfter: "Scade tra 10 minuti.",
      cta: { label: "Apri Reglo", url: "https://app.reglo.it" },
    });
    expect(text).toContain("Reimposta la password");
    expect(text).toContain("Il tuo codice: 123456");
    expect(text).toContain("Scade tra 10 minuti.");
    expect(text).toContain("Apri Reglo: https://app.reglo.it");
    expect(text).not.toContain("<");
  });
});
