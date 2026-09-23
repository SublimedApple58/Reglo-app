import {
  asExamOutcome,
  canRecordExamOutcome,
  examOutcomeLabel,
  normalizeLicenseNumber,
  phaseAfterExamOutcome,
} from "@/lib/autoscuole/exam-outcome";

const ORA = new Date("2026-09-23T10:00:00.000Z");
const esame = (over: Partial<Parameters<typeof canRecordExamOutcome>[0]> = {}) => ({
  type: "esame",
  status: "scheduled",
  studentId: "11111111-1111-1111-1111-111111111111",
  startsAt: new Date("2026-09-23T09:00:00.000Z"),
  ...over,
});

describe("asExamOutcome", () => {
  it("riconosce i due esiti", () => {
    expect(asExamOutcome("idoneo")).toBe("idoneo");
    expect(asExamOutcome("respinto")).toBe("respinto");
  });

  it("qualunque altra cosa è 'non registrato', non un errore", () => {
    // Le righe vecchie hanno examOutcome null, e una lista non deve esplodere
    // né inventare un esito per 476 esami che non ne hanno uno.
    for (const value of [null, undefined, "", "IDONEO", "promosso", 1, {}]) {
      expect(asExamOutcome(value)).toBeNull();
      expect(examOutcomeLabel(value)).toBeNull();
    }
  });
});

describe("canRecordExamOutcome", () => {
  it("si registra su un esame iniziato con un iscritto", () => {
    expect(canRecordExamOutcome(esame(), ORA)).toBe(true);
  });

  it("non su un esame futuro: quello ha una data, non un esito", () => {
    expect(
      canRecordExamOutcome(esame({ startsAt: new Date("2026-09-24T09:00:00.000Z") }), ORA),
    ).toBe(false);
  });

  it("tollera i 10 minuti prima, come l'esito delle guide", () => {
    expect(
      canRecordExamOutcome(esame({ startsAt: new Date("2026-09-23T10:05:00.000Z") }), ORA),
    ).toBe(true);
    expect(
      canRecordExamOutcome(esame({ startsAt: new Date("2026-09-23T10:11:00.000Z") }), ORA),
    ).toBe(false);
  });

  it("non su un segnaposto senza iscritti", () => {
    // 27 esami in produzione sono righe con studentId null: un esito lì non
    // apparterrebbe a nessuno.
    expect(canRecordExamOutcome(esame({ studentId: null }), ORA)).toBe(false);
  });

  it("non su un esame annullato, né su una guida", () => {
    expect(canRecordExamOutcome(esame({ status: "cancelled" }), ORA)).toBe(false);
    expect(canRecordExamOutcome(esame({ type: "guida" }), ORA)).toBe(false);
  });

  it("accetta una data ISO come la manda il client", () => {
    expect(canRecordExamOutcome(esame({ startsAt: "2026-09-23T09:00:00.000Z" }), ORA)).toBe(true);
    expect(canRecordExamOutcome(esame({ startsAt: "non-una-data" }), ORA)).toBe(false);
  });
});

describe("phaseAfterExamOutcome", () => {
  it("l'idoneo chiude il percorso", () => {
    expect(phaseAfterExamOutcome("idoneo")).toBe("PATENTATO");
  });

  it("il respinto non tocca la fase: chi non passa resta dov'è", () => {
    expect(phaseAfterExamOutcome("respinto")).toBeNull();
  });
});

describe("normalizeLicenseNumber", () => {
  it("tiene il numero su un idoneo, ripulito", () => {
    expect(normalizeLicenseNumber("idoneo", "  GE1234567X ")).toBe("GE1234567X");
  });

  it("un idoneo senza numero è legittimo: arriva giorni dopo", () => {
    expect(normalizeLicenseNumber("idoneo", "")).toBeNull();
    expect(normalizeLicenseNumber("idoneo", "   ")).toBeNull();
    expect(normalizeLicenseNumber("idoneo", null)).toBeNull();
  });

  it("su un respinto il numero si scarta: è un errore di compilazione", () => {
    expect(normalizeLicenseNumber("respinto", "GE1234567X")).toBeNull();
  });
});
