import {
  convertCreditBalance,
  creditCost,
  formatCreditDelta,
  formatCredits,
  formatRemainder,
  paidCredit,
  parseLessonCreditUnit,
  parseRemainderPolicy,
  refundAmount,
} from "@/lib/autoscuole/lesson-credit-unit";

/** REG-783: crediti guida a guide o a minuti, con le regole di Tiziano (24/11/2026). */
const at = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00Z`);
const lesson90 = { startsAt: at("10:00"), endsAt: at("11:30") };
const lesson60 = { startsAt: at("10:00"), endsAt: at("11:00") };

describe("parse", () => {
  it("unità: solo «minutes» vale minuti, tutto il resto è guide", () => {
    expect(parseLessonCreditUnit("minutes")).toBe("minutes");
    expect(parseLessonCreditUnit("lessons")).toBe("lessons");
    expect(parseLessonCreditUnit(undefined)).toBe("lessons");
    expect(parseLessonCreditUnit("ore")).toBe("lessons");
  });
  it("resto: default al più vicino", () => {
    expect(parseRemainderPolicy("floor")).toBe("floor");
    expect(parseRemainderPolicy("ceil")).toBe("ceil");
    expect(parseRemainderPolicy(undefined)).toBe("round");
  });
});

describe("creditCost", () => {
  it("a guide una guida costa 1, qualunque durata", () => {
    expect(creditCost("lessons", lesson90.startsAt, lesson90.endsAt)).toBe(1);
  });
  it("a minuti costa la sua durata", () => {
    expect(creditCost("minutes", lesson90.startsAt, lesson90.endsAt)).toBe(90);
    expect(creditCost("minutes", lesson60.startsAt, lesson60.endsAt)).toBe(60);
  });
});

describe("paidCredit", () => {
  it("guida pagata prima di REG-783 (colonne vuote) = 1 guida", () => {
    expect(paidCredit({ creditAmount: null, creditUnit: null })).toEqual({ amount: 1, unit: "lessons" });
  });
  it("guida pagata a minuti", () => {
    expect(paidCredit({ creditAmount: 90, creditUnit: "minutes" })).toEqual({ amount: 90, unit: "minutes" });
  });
});

describe("refundAmount", () => {
  it("stessa unità: torna quanto aveva consumato", () => {
    expect(refundAmount({ currentUnit: "minutes", appointment: { ...lesson90, creditAmount: 75, creditUnit: "minutes" } })).toBe(75);
    expect(refundAmount({ currentUnit: "lessons", appointment: { ...lesson90, creditAmount: 1, creditUnit: "lessons" } })).toBe(1);
  });
  it("pagata a guide prima del passaggio a minuti: torna la sua durata (regola definitiva)", () => {
    expect(refundAmount({ currentUnit: "minutes", appointment: { ...lesson90, creditAmount: 1, creditUnit: "lessons" } })).toBe(90);
  });
  it("pagata prima di REG-783 e resa a minuti: la durata", () => {
    expect(refundAmount({ currentUnit: "minutes", appointment: { ...lesson60 } })).toBe(60);
  });
  it("caso 12: conta la durata al momento del rimborso, non quella pagata", () => {
    const longer = { startsAt: at("10:00"), endsAt: at("12:00"), creditAmount: 1, creditUnit: "lessons" };
    expect(refundAmount({ currentUnit: "minutes", appointment: longer })).toBe(120);
  });
  it("caso 7: pagata a minuti e resa dopo il ritorno a guide → 1 guida", () => {
    expect(refundAmount({ currentUnit: "lessons", appointment: { ...lesson90, creditAmount: 90, creditUnit: "minutes" } })).toBe(1);
  });
});

describe("convertCreditBalance", () => {
  it("da guide a minuti moltiplica, senza resto", () => {
    expect(
      convertCreditBalance({ amount: 3, fromUnit: "lessons", toUnit: "minutes", minutesPerLesson: 60, remainderPolicy: "round" }),
    ).toEqual({ amount: 180, remainderMinutes: 0 });
  });
  it("da minuti a guide al più vicino: 4 ore e 30 → 5 guide, 30 minuti in più", () => {
    expect(
      convertCreditBalance({ amount: 270, fromUnit: "minutes", toUnit: "lessons", minutesPerLesson: 60, remainderPolicy: "round" }),
    ).toEqual({ amount: 5, remainderMinutes: 30 });
  });
  it("al più vicino: 2 ore e 15 → 2 guide, 15 minuti persi", () => {
    expect(
      convertCreditBalance({ amount: 135, fromUnit: "minutes", toUnit: "lessons", minutesPerLesson: 60, remainderPolicy: "round" }),
    ).toEqual({ amount: 2, remainderMinutes: -15 });
  });
  it("per difetto e per eccesso", () => {
    const base = { amount: 135, fromUnit: "minutes" as const, toUnit: "lessons" as const, minutesPerLesson: 60 };
    expect(convertCreditBalance({ ...base, remainderPolicy: "floor" }).amount).toBe(2);
    expect(convertCreditBalance({ ...base, remainderPolicy: "ceil" })).toEqual({ amount: 3, remainderMinutes: 45 });
  });
  it("caso 18: un saldo negativo si converte con la stessa regola", () => {
    expect(
      convertCreditBalance({ amount: -2, fromUnit: "lessons", toUnit: "minutes", minutesPerLesson: 45, remainderPolicy: "round" }).amount,
    ).toBe(-90);
  });
  it("stessa unità: invariato", () => {
    expect(
      convertCreditBalance({ amount: 7, fromUnit: "lessons", toUnit: "lessons", minutesPerLesson: 60, remainderPolicy: "round" }),
    ).toEqual({ amount: 7, remainderMinutes: 0 });
  });
});

describe("testi", () => {
  it("saldo a parole", () => {
    expect(formatCredits("lessons", 1)).toBe("1 guida");
    expect(formatCredits("lessons", 3)).toBe("3 guide");
    expect(formatCredits("minutes", 330)).toBe("5 ore e 30");
    expect(formatCredits("minutes", 50)).toBe("50 minuti");
    expect(formatCredits("minutes", 0)).toBe("0 ore");
  });
  it("movimenti col segno", () => {
    expect(formatCreditDelta("minutes", 150)).toBe("+2 ore e 30");
    expect(formatCreditDelta("minutes", -90)).toBe("−1 ora e 30");
    expect(formatCreditDelta("lessons", -1)).toBe("−1 guida");
  });
  it("resto", () => {
    expect(formatRemainder(30)).toBe("30 minuti in più");
    expect(formatRemainder(-15)).toBe("15 minuti persi");
    expect(formatRemainder(0)).toBeNull();
  });
});
