import {
  cancelledText,
  describeWhen,
  examCreatedText,
  examTimeClearedText,
  examTimeSetText,
  hasDefinedTime,
  isExamType,
  locationChangedText,
  movedText,
} from "@/lib/autoscuole/exam-notifications";

/**
 * REG-604. La regola che questi test blindano è una sola:
 *
 *   **l'orario si scrive se e solo se `endsAt` è valorizzato.**
 *
 * Il difetto che REG-604 chiude è che ogni punto di invio si formattava
 * l'orario da sé e nessuno guardava `endsAt`, quindi un esame senza orario
 * usciva con la mezzanotte segnaposto: «il tuo esame del 14 ottobre alle
 * 00:00». Qui il controllo è strutturale, non per singola frase.
 */

// 14 ottobre 2026 è un mercoledì. Ore italiane (il modulo formatta in
// Europe/Rome), quindi 09:00 locali = 07:00 UTC.
const ORE_9 = new Date("2026-10-14T07:00:00.000Z");
const ORE_11 = new Date("2026-10-14T09:00:00.000Z");
const FINE_10 = new Date("2026-10-14T08:00:00.000Z");
const MEZZANOTTE = new Date("2026-10-13T22:00:00.000Z");
const ALTRO_GIORNO = new Date("2026-10-16T09:00:00.000Z");
const ALTRO_GIORNO_MEZZANOTTE = new Date("2026-10-15T22:00:00.000Z");

const esameConOrario = { type: "esame", startsAt: ORE_9, endsAt: FINE_10 };
const esameSenzaOrario = { type: "esame", startsAt: MEZZANOTTE, endsAt: null };
const guida = { type: "guida", startsAt: ORE_9, endsAt: FINE_10 };

/** Un orario in formato hh:mm da qualche parte nel testo. */
const contieneUnOrario = (testo: string) => /\b\d{1,2}:\d{2}\b/.test(testo);

describe("la regola dell'orario", () => {
  it("riconosce l'esame qualunque sia la forma del valore", () => {
    expect(isExamType("esame")).toBe(true);
    expect(isExamType(" ESAME ")).toBe(true);
    expect(isExamType("guida")).toBe(false);
    expect(isExamType(null)).toBe(false);
  });

  it("l'orario è definito solo se endsAt c'è", () => {
    expect(hasDefinedTime({ endsAt: FINE_10 })).toBe(true);
    expect(hasDefinedTime({ endsAt: null })).toBe(false);
  });

  it("senza endsAt l'etichetta non porta l'ora, nemmeno la mezzanotte", () => {
    expect(describeWhen(esameSenzaOrario).when).toBe("mercoledì 14 ottobre");
    expect(contieneUnOrario(describeWhen(esameSenzaOrario).when)).toBe(false);
  });

  it("con endsAt l'etichetta porta l'ora", () => {
    expect(describeWhen(esameConOrario).when).toBe("mercoledì 14 ottobre alle 09:00");
  });

  it("il nome segue il tipo", () => {
    expect(describeWhen(esameConOrario).noun).toBe("esame di guida");
    expect(describeWhen(guida).noun).toBe("guida");
  });
});

describe("nessun testo d'esame senza orario contiene un orario", () => {
  // È la guardia vera: qualunque testo questo modulo produca per un esame
  // senza orario, non deve poter contenere un hh:mm.
  const testi = [
    examCreatedText(esameSenzaOrario),
    examTimeClearedText(esameSenzaOrario),
    cancelledText(esameSenzaOrario),
    locationChangedText(esameSenzaOrario, "Motorizzazione di Genova"),
    movedText(esameSenzaOrario, {
      type: "esame",
      startsAt: ALTRO_GIORNO_MEZZANOTTE,
      endsAt: null,
    }),
  ];

  it.each(testi.map((t, i) => [i, t] as const))("testo #%i", (_i, testo) => {
    expect(testo).not.toBeNull();
    expect(contieneUnOrario(testo!.body)).toBe(false);
    expect(contieneUnOrario(testo!.title)).toBe(false);
  });
});

describe("nessun testo d'esame parla di guide", () => {
  const testi = [
    examCreatedText(esameConOrario),
    examTimeSetText({ startsAt: ORE_9, endsAt: FINE_10 }),
    examTimeClearedText(esameConOrario),
    cancelledText(esameConOrario),
    locationChangedText(esameConOrario, "Motorizzazione"),
    movedText(esameConOrario, { type: "esame", startsAt: ALTRO_GIORNO, endsAt: null }),
  ];

  it.each(testi.map((t, i) => [i, t] as const))("testo #%i", (_i, testo) => {
    // "esame di guida" è giusto; "la tua guida" e "🔄" no.
    expect(testo!.body).not.toMatch(/\b(la tua|della tua|La guida)\s+guida\b/);
    expect(testo!.title).not.toContain("Guida");
    expect(testo!.title).not.toContain("🔄");
  });

  it("non propone mai di riprenotare l'esame dall'app", () => {
    // La CTA delle guide era «Prenota una nuova guida dall'app quando vuoi»:
    // su un esame è assurda, l'allievo non se lo prenota.
    expect(cancelledText(esameConOrario).body).not.toContain("dall'app");
    expect(cancelledText(esameConOrario).body).toContain("ti contatterà l'autoscuola");
  });

  it("non distingue annullato da annullato definitivamente", () => {
    expect(cancelledText(esameConOrario, { permanent: true }).title).toBe("❌ Esame annullato");
    expect(cancelledText(esameConOrario, { permanent: false }).title).toBe("❌ Esame annullato");
  });
});

describe("esame fissato", () => {
  it("con orario dice l'ora e promette il luogo", () => {
    const { title, body } = examCreatedText(esameConOrario);
    expect(title).toBe("🎓 Esame fissato");
    expect(body).toBe(
      "Il tuo esame di guida è fissato per mercoledì 14 ottobre alle 09:00. " +
        "Il luogo di presentazione ti verrà comunicato dall'autoscuola.",
    );
  });

  it("senza orario promette orario e luogo, con le stesse parole del promemoria", () => {
    expect(examCreatedText(esameSenzaOrario).body).toBe(
      "Il tuo esame di guida è fissato per mercoledì 14 ottobre. " +
        "Orario e luogo di presentazione ti verranno comunicati dall'autoscuola.",
    );
  });
});

describe("spostamento", () => {
  it("etichette identiche → nessun messaggio", () => {
    // Cambiata solo la durata: start invariato.
    expect(
      movedText(
        { type: "guida", startsAt: ORE_9, endsAt: FINE_10 },
        { type: "guida", startsAt: ORE_9, endsAt: ORE_11 },
      ),
    ).toBeNull();
  });

  it("esame senza orario che resta nello stesso giorno → nessun messaggio", () => {
    expect(
      movedText(esameSenzaOrario, {
        type: "esame",
        startsAt: new Date("2026-10-13T22:30:00.000Z"),
        endsAt: null,
      }),
    ).toBeNull();
  });

  it("senza orario → con orario, stesso giorno = «orario definito»", () => {
    const testo = movedText(esameSenzaOrario, {
      type: "esame",
      startsAt: ORE_9,
      endsAt: FINE_10,
    });
    expect(testo?.title).toBe("🎓 Orario dell'esame definito");
    expect(testo?.body).toContain("è stato definito: alle 09:00");
  });

  it("con orario → senza orario, stesso giorno = «orario da definire»", () => {
    const testo = movedText(esameConOrario, {
      type: "esame",
      startsAt: MEZZANOTTE,
      endsAt: null,
    });
    expect(testo?.title).toBe("🎓 Orario dell'esame da definire");
    expect(contieneUnOrario(testo!.body)).toBe(false);
  });

  it("esame spostato di giorno, orario noto prima e dopo", () => {
    const testo = movedText(esameConOrario, {
      type: "esame",
      startsAt: ALTRO_GIORNO,
      endsAt: new Date("2026-10-16T10:00:00.000Z"),
    });
    expect(testo?.title).toBe("🎓 Esame spostato");
    expect(testo?.body).toBe(
      "Il tuo esame di guida di mercoledì 14 ottobre alle 09:00 è stato spostato " +
        "a venerdì 16 ottobre alle 11:00.",
    );
  });

  it("esame spostato di giorno senza orario: aggiunge la coda", () => {
    const testo = movedText(esameSenzaOrario, {
      type: "esame",
      startsAt: ALTRO_GIORNO_MEZZANOTTE,
      endsAt: null,
    });
    expect(testo?.body).toContain("Orario e luogo di presentazione");
  });

  it("sulle guide il testo e l'attore restano quelli di prima", () => {
    const testo = movedText(
      guida,
      { type: "guida", startsAt: ALTRO_GIORNO, endsAt: new Date("2026-10-16T10:00:00.000Z") },
      { actorRole: "instructor", instructorName: "Marco" },
    );
    expect(testo?.title).toBe("🔄 Guida spostata");
    expect(testo?.body).toContain("con Marco");
    expect(testo?.body).toContain("dall'istruttore");
  });

  it("sugli esami l'attore non compare: la data non la decide la segreteria", () => {
    const testo = movedText(
      esameConOrario,
      { type: "esame", startsAt: ALTRO_GIORNO, endsAt: new Date("2026-10-16T10:00:00.000Z") },
      { actorRole: "owner", instructorName: "Marco" },
    );
    expect(testo?.body).not.toContain("dalla segreteria");
    expect(testo?.body).not.toContain("con Marco");
  });
});

describe("guide: niente regressioni", () => {
  it("l'annullamento di una guida tiene titolo, attore e CTA", () => {
    const { title, body } = cancelledText(guida, {
      actorRole: "owner",
      instructorName: "Marco",
      guideCta: "Prenota una nuova guida dall'app quando vuoi.",
    });
    expect(title).toBe("❌ Guida annullata");
    expect(body).toBe(
      "La tua guida di mercoledì 14 ottobre alle 09:00 con Marco è stata annullata " +
        "dalla segreteria. Prenota una nuova guida dall'app quando vuoi.",
    );
  });

  it("permanent_cancel ha il titolo più forte, sulle guide", () => {
    expect(cancelledText(guida, { permanent: true }).title).toBe(
      "❌ Guida annullata definitivamente",
    );
  });

  it("il luogo di una guida resta «Luogo guida aggiornato»", () => {
    expect(locationChangedText(guida, "Sede centrale").title).toBe("📍 Luogo guida aggiornato");
  });
});
