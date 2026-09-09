import {
  DEFAULT_GUIDE_REQUEST_MIN_LEAD_HOURS,
  guideRequestLeadTimeError,
} from "@/lib/consorzio/guide-request-lead";

const now = new Date("2026-09-09T10:00:00.000Z");
const inHours = (hours: number) => new Date(now.getTime() + hours * 3600_000);

describe("preavviso minimo richiesta guida", () => {
  it("il default è 8 ore", () => {
    expect(DEFAULT_GUIDE_REQUEST_MIN_LEAD_HOURS).toBe(8);
  });

  it("accetta uno slot oltre il preavviso", () => {
    expect(guideRequestLeadTimeError(inHours(9), 8, now)).toBeNull();
  });

  it("accetta uno slot esattamente sul limite", () => {
    expect(guideRequestLeadTimeError(inHours(8), 8, now)).toBeNull();
  });

  it("rifiuta uno slot dentro il preavviso", () => {
    expect(guideRequestLeadTimeError(inHours(7), 8, now)).toMatch(/Preavviso minimo di 8 ore/);
  });

  it("rifiuta uno slot nel passato", () => {
    expect(guideRequestLeadTimeError(inHours(-1), 8, now)).not.toBeNull();
  });

  it("è configurabile: con 24 ore anche 12 ore di anticipo non bastano", () => {
    expect(guideRequestLeadTimeError(inHours(12), 24, now)).toMatch(/Preavviso minimo di 24 ore/);
    expect(guideRequestLeadTimeError(inHours(25), 24, now)).toBeNull();
  });

  it("0 ore disattiva la regola", () => {
    expect(guideRequestLeadTimeError(inHours(0.1), 0, now)).toBeNull();
  });

  it("singolare per 1 ora", () => {
    expect(guideRequestLeadTimeError(inHours(0.5), 1, now)).toMatch(/1 ora:/);
  });
});
