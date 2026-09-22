import {
  absencePrice,
  billingModeFor,
  billingMonthOf,
  coursePrice,
  examPrice,
  guidePrice,
  isBillableAbsence,
  parseConsorzioPricing,
} from "@/lib/consorzio/pricing";

const limits = (consorzioPricing: Record<string, unknown>) => ({ consorzioPricing });

describe("listino consorzio", () => {
  it("default: tutto a ore, cutoff 48h, penale 100%, preavviso 8h", () => {
    const pricing = parseConsorzioPricing({});
    expect(pricing.billingModeByCategory).toEqual({});
    expect(billingModeFor(pricing, "C")).toBe("hourly");
    expect(pricing.lateCancellationCutoffHours).toBe(48);
    expect(pricing.lateCancellationPenaltyPct).toBe(100);
    expect(pricing.guideRequestMinLeadHours).toBe(8);
    // REG-507: chi non sceglie il criterio resta su quello storico.
    expect(pricing.lateCancellationMode).toBe("percent");
  });

  it("la BE ha la sua tariffa oraria (REG-456)", () => {
    const pricing = parseConsorzioPricing(limits({ hourlyByCategory: { BE: 35 } }));
    expect(guidePrice(pricing, "BE", 60)).toBe(35);
  });

  it("a ore: durata/60 × tariffa", () => {
    const pricing = parseConsorzioPricing(limits({ hourlyByCategory: { DE: 90 } }));
    expect(guidePrice(pricing, "DE", 90)).toBe(135);
    expect(guidePrice(pricing, "DE", 45)).toBe(67.5);
  });

  it("senza tariffa o senza patente la guida vale 0", () => {
    const pricing = parseConsorzioPricing(limits({ hourlyByCategory: { C: 80 } }));
    expect(guidePrice(pricing, "D", 60)).toBe(0);
    expect(guidePrice(pricing, null, 60)).toBe(0);
  });

  it("a percorso: guide incluse (0) e prezzo unico dal listino (REG-462)", () => {
    const pricing = parseConsorzioPricing(
      limits({
        hourlyByCategory: { CQC: 60 },
        courseByCategory: { CQC: 1200 },
        billingModeByCategory: { CQC: "course" },
      }),
    );
    expect(billingModeFor(pricing, "CQC")).toBe("course");
    expect(guidePrice(pricing, "CQC", 120)).toBe(0);
    expect(coursePrice(pricing, "CQC")).toBe(1200);
  });

  it("vale per qualsiasi patente, non solo la CQC", () => {
    const pricing = parseConsorzioPricing(
      limits({ courseByCategory: { CE: 900 }, billingModeByCategory: { CE: "course" } }),
    );
    expect(coursePrice(pricing, "CE")).toBe(900);
    expect(coursePrice(pricing, "C")).toBeNull();
  });

  it("tornando a ore la tariffa oraria salvata torna a valere", () => {
    const pricing = parseConsorzioPricing(
      limits({
        hourlyByCategory: { D: 100 },
        courseByCategory: { D: 1500 },
        billingModeByCategory: { D: "hourly" },
      }),
    );
    expect(guidePrice(pricing, "D", 60)).toBe(100);
    expect(coursePrice(pricing, "D")).toBeNull();
  });

  it("scarta valori sporchi: criteri ignoti, importi negativi, patenti fuori listino", () => {
    const pricing = parseConsorzioPricing(
      limits({
        hourlyByCategory: { C: -5, B: 40, CE: "70" },
        billingModeByCategory: { C: "weird", B: "course" },
      }),
    );
    expect(pricing.hourlyByCategory).toEqual({});
    expect(pricing.billingModeByCategory).toEqual({});
  });

  it("tariffa esame fissa, anche con patente a percorso (REG-459)", () => {
    const pricing = parseConsorzioPricing(
      limits({ examFee: 150, billingModeByCategory: { CQC: "course" } }),
    );
    expect(examPrice(pricing)).toBe(150);
    expect(parseConsorzioPricing({}).examFee).toBeNull();
    expect(examPrice(parseConsorzioPricing({}))).toBe(0);
    expect(parseConsorzioPricing(limits({ examFee: -1 })).examFee).toBeNull();
  });

  it("mese di fatturazione in UTC", () => {
    expect(billingMonthOf(new Date("2026-09-30T23:30:00.000Z"))).toBe("2026-09");
    expect(billingMonthOf(new Date("2026-10-01T00:10:00.000Z"))).toBe("2026-10");
  });
});

/* ───────────────── Costo dell'assenza (REG-507) ───────────────── */

describe("absencePrice", () => {
  const listino = (extra: Record<string, unknown> = {}) =>
    parseConsorzioPricing(
      limits({ hourlyByCategory: { CE: 110, BE: 35 }, ...extra }),
    );

  it("a importo fisso costa uguale per ogni patente", () => {
    // È letteralmente la richiesta: «20 € a prescindere dalla categoria».
    const pricing = listino({ lateCancellationMode: "fixed", lateCancellationFixedAmount: 20 });
    expect(absencePrice(pricing, "CE", 60)).toBe(20);
    expect(absencePrice(pricing, "BE", 60)).toBe(20);
    expect(absencePrice(pricing, "CE", 90)).toBe(20);
    expect(absencePrice(pricing, null, 60)).toBe(20);
  });

  it("a percentuale dipende dalla patente e dalla durata", () => {
    const pricing = listino({ lateCancellationPenaltyPct: 100 });
    expect(absencePrice(pricing, "CE", 60)).toBe(110);
    expect(absencePrice(pricing, "BE", 60)).toBe(35);
    const meta = listino({ lateCancellationPenaltyPct: 50 });
    expect(absencePrice(meta, "CE", 60)).toBe(55);
  });

  it("l'importo fisso vale anche per le patenti a percorso", () => {
    // La guida vale 0 perché è inclusa nel prezzo unico, ma il posto sprecato
    // resta un costo per il consorzio.
    const pricing = listino({
      billingModeByCategory: { CE: "course" },
      courseByCategory: { CE: 1250 },
      lateCancellationMode: "fixed",
      lateCancellationFixedAmount: 20,
    });
    expect(guidePrice(pricing, "CE", 60)).toBe(0);
    expect(absencePrice(pricing, "CE", 60)).toBe(20);
  });

  it("a percentuale, una patente a percorso non produce addebito", () => {
    const pricing = listino({
      billingModeByCategory: { CE: "course" },
      lateCancellationPenaltyPct: 100,
    });
    expect(absencePrice(pricing, "CE", 60)).toBe(0);
  });

  it("un default assurdo non produce importi negativi", () => {
    const pricing = listino({ lateCancellationMode: "fixed", lateCancellationFixedAmount: -5 });
    // -5 non è un importo valido → si ricade sul default, non su un credito.
    expect(absencePrice(pricing, "CE", 60)).toBe(20);
  });
});

describe("isBillableAbsence", () => {
  const startsAt = new Date("2026-10-10T10:00:00Z");
  const cutoff = 48;

  it("il no-show è sempre un'assenza", () => {
    expect(isBillableAbsence({ status: "no_show", startsAt }, cutoff)).toBe(true);
    // Anche senza cutoff: non presentarsi non ha preavviso.
    expect(isBillableAbsence({ status: "no_show", startsAt }, 0)).toBe(true);
  });

  it("l'annullamento dell'allievo oltre il cutoff è un'assenza", () => {
    expect(
      isBillableAbsence(
        {
          status: "cancelled",
          cancellationKind: "manual_cancel",
          startsAt,
          cancelledAt: new Date("2026-10-09T10:00:00Z"), // 24h prima, oltre il cutoff
        },
        cutoff,
      ),
    ).toBe(true);
  });

  it("annullare in tempo non costa niente", () => {
    expect(
      isBillableAbsence(
        {
          status: "cancelled",
          cancellationKind: "manual_cancel",
          startsAt,
          cancelledAt: new Date("2026-10-07T10:00:00Z"), // 72h prima
        },
        cutoff,
      ),
    ).toBe(false);
  });

  it("gli annullamenti decisi dalla scuola non si addebitano mai", () => {
    // Istruttore malato o mezzo fermo: l'allievo non c'entra.
    for (const kind of ["operational_cancel", "operational_reposition", "record_cleanup", "permanent_cancel"]) {
      expect(
        isBillableAbsence(
          {
            status: "cancelled",
            cancellationKind: kind,
            startsAt,
            cancelledAt: new Date("2026-10-09T23:00:00Z"),
          },
          cutoff,
        ),
      ).toBe(false);
    }
  });

  it("col cutoff a 0 la regola è spenta", () => {
    expect(
      isBillableAbsence(
        {
          status: "cancelled",
          cancellationKind: "manual_cancel",
          startsAt,
          cancelledAt: new Date("2026-10-10T09:59:00Z"),
        },
        0,
      ),
    ).toBe(false);
  });

  it("le guide vive e completate non sono assenze", () => {
    for (const status of ["scheduled", "completed", "pending_review", "checked_in"]) {
      expect(isBillableAbsence({ status, startsAt }, cutoff)).toBe(false);
    }
  });
});
