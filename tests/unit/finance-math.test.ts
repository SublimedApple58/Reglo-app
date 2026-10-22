import {
  monthBounds,
  monthlyEquivalentCents,
  nextOccurrence,
  occurrencesBetween,
  parseEuroToCents,
  shiftMonth,
  totalsOf,
  vatPortionCents,
} from "@/lib/finance/finance-math";

describe("finance math (REG-413)", () => {
  it("scorpora l'IVA da un importo IVA inclusa", () => {
    expect(vatPortionCents(12200, 2200)).toBe(2200);
    expect(vatPortionCents(10000, 2200)).toBe(1803);
    expect(vatPortionCents(10000, null)).toBe(0);
    expect(vatPortionCents(10000, 0)).toBe(0);
  });

  it("equivalente mensile", () => {
    expect(monthlyEquivalentCents(45000, "quarterly")).toBe(15000);
    expect(monthlyEquivalentCents(120000, "annual")).toBe(10000);
    expect(monthlyEquivalentCents(700, "monthly")).toBe(700);
  });

  it("scadenze mensili col giorno che non esiste", () => {
    const e = { amountCents: 1, cadence: "monthly" as const, startsOn: "2026-01-31", endsOn: null, dayOfMonth: 31 };
    expect(occurrencesBetween(e, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("scadenze trimestrali, fine e partenza rispettate", () => {
    const e = { amountCents: 1, cadence: "quarterly" as const, startsOn: "2026-03-16", endsOn: "2026-12-31", dayOfMonth: 16 };
    expect(occurrencesBetween(e, "2026-01-01", "2027-12-31")).toEqual(["2026-03-16", "2026-06-16", "2026-09-16", "2026-12-16"]);
    expect(nextOccurrence(e, "2026-10-22")).toBe("2026-12-16");
    expect(nextOccurrence(e, "2027-01-01")).toBeNull();
  });

  it("la prima scadenza non precede l'inizio", () => {
    const e = { amountCents: 1, cadence: "monthly" as const, startsOn: "2026-10-20", endsOn: null, dayOfMonth: 5 };
    expect(occurrencesBetween(e, "2026-10-01", "2026-12-31")).toEqual(["2026-11-05", "2026-12-05"]);
  });

  it("mesi", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("totali: incassato, da incassare, IVA da mettere da parte", () => {
    const t = totalsOf([
      { direction: "in", status: "settled", amountCents: 12200, vatRateBps: 2200 },
      { direction: "in", status: "due", amountCents: 50000, vatRateBps: 2200 },
      { direction: "out", status: "settled", amountCents: 6100, vatRateBps: 2200 },
      { direction: "out", status: "settled", amountCents: 1000, vatRateBps: null },
      { direction: "out", status: "planned", amountCents: 3000, vatRateBps: null },
    ]);
    expect(t.inSettledCents).toBe(12200);
    expect(t.outSettledCents).toBe(7100);
    expect(t.balanceCents).toBe(5100);
    expect(t.inDueCents).toBe(50000);
    expect(t.plannedOutCents).toBe(3000);
    expect(t.vatOnSalesCents).toBe(2200);
    expect(t.vatOnPurchasesCents).toBe(1100);
    expect(t.vatToSetAsideCents).toBe(1100);
  });

  it("legge gli euro scritti all'italiana", () => {
    expect(parseEuroToCents("1.234,50")).toBe(123450);
    expect(parseEuroToCents("1234,5")).toBe(123450);
    expect(parseEuroToCents("1234.56")).toBe(123456);
    expect(parseEuroToCents("1.234")).toBe(123400);
    expect(parseEuroToCents("€ 99")).toBe(9900);
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("")).toBeNull();
  });
});
