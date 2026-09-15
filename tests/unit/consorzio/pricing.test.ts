import {
  billingModeFor,
  billingMonthOf,
  coursePrice,
  examPrice,
  guidePrice,
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
