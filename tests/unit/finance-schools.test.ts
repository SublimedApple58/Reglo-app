import { normalizeVatNumber, planNeedsRenewal, schoolState, schoolsTotals } from "@/lib/finance/finance-schools";

const row = (over: Record<string, unknown> = {}) => ({
  commercial: null as { status: "active" | "paused" | "churned" } | null,
  plan: null as { annualCents: number; renewsAt: string | null } | null,
  instructors: 2,
  students: 10,
  activeStudentsMonth: 3,
  lessonsMonth: 5,
  lessonsTotal: 40,
  ...over,
});

describe("finance schools (REG-413)", () => {
  it("partita IVA: pulisce IT e spazi, rifiuta ciò che non ha 11 cifre", () => {
    expect(normalizeVatNumber("IT 012 345 678 90")).toBe("01234567890");
    expect(normalizeVatNumber("")).toBeNull();
    expect(normalizeVatNumber(null)).toBeNull();
    expect(() => normalizeVatNumber("123")).toThrow("11 cifre");
  });

  it("senza anagrafica lo stato è «da completare», non un'ipotesi", () => {
    expect(schoolState(row())).toBe("incomplete");
    expect(schoolState(row({ commercial: { status: "paused" } }))).toBe("paused");
  });

  it("rinnovo da completare solo per i piani a pagamento senza data", () => {
    expect(planNeedsRenewal(row({ plan: { annualCents: 35000, renewsAt: null } }))).toBe(true);
    expect(planNeedsRenewal(row({ plan: { annualCents: 0, renewsAt: null } }))).toBe(false);
    expect(planNeedsRenewal(row({ plan: { annualCents: 35000, renewsAt: "2027-01-01" } }))).toBe(false);
    expect(planNeedsRenewal(row())).toBe(false);
  });

  it("totali: le disdette restano nei conteggi ma non nel valore dei piani", () => {
    const t = schoolsTotals([
      row({ commercial: { status: "active" }, plan: { annualCents: 35000, renewsAt: "2027-01-01" } }),
      row({ commercial: { status: "churned" }, plan: { annualCents: 50000, renewsAt: null } }),
      row({ plan: { annualCents: 12000, renewsAt: null } }),
    ]);
    expect(t).toMatchObject({
      count: 3,
      active: 1,
      churned: 1,
      incomplete: 1,
      planAnnualCents: 47000,
      plansToComplete: 2,
      instructors: 6,
      students: 30,
      lessonsMonth: 15,
      lessonsTotal: 120,
    });
  });
});
