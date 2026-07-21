import {
  isWithinRestrictedWindow,
  pickRestrictedWindowSlots,
} from "@/lib/autoscuole/restricted-window";

const HOUR = 60;
const at = (h: number) => h * HOUR;

// Fascia usata dal caso reale (Autoscuola Robatto): 08:00–13:00.
const WIN_START = at(8);
const WIN_END = at(13);

describe("isWithinRestrictedWindow", () => {
  it("accetta uno slot interamente dentro la fascia", () => {
    expect(isWithinRestrictedWindow(at(9), 60, WIN_START, WIN_END)).toBe(true);
  });

  it("accetta lo slot al bordo esatto (12:00–13:00)", () => {
    expect(isWithinRestrictedWindow(at(12), 60, WIN_START, WIN_END)).toBe(true);
  });

  it("rifiuta lo slot che inizia prima della fascia", () => {
    expect(isWithinRestrictedWindow(at(7), 60, WIN_START, WIN_END)).toBe(false);
  });

  it("rifiuta lo slot che finisce dopo la fascia (12:30–13:30)", () => {
    expect(isWithinRestrictedWindow(at(12) + 30, 60, WIN_START, WIN_END)).toBe(false);
  });

  it("rifiuta uno slot pomeridiano (16:00) — il caso di Renzo", () => {
    expect(isWithinRestrictedWindow(at(16), 60, WIN_START, WIN_END)).toBe(false);
  });
});

describe("pickRestrictedWindowSlots (priorità morbida)", () => {
  const slot = (label: string, inRestrictedWindow: boolean) => ({ label, inRestrictedWindow });

  it("se ci sono slot dentro la fascia, mostra SOLO quelli", () => {
    const slots = [
      slot("09:00", true),
      slot("16:00", false),
      slot("11:00", true),
    ];
    expect(pickRestrictedWindowSlots(slots).map((s) => s.label)).toEqual(["09:00", "11:00"]);
  });

  it("se NON c'è nulla dentro la fascia, ripiega su tutti (fallback)", () => {
    const slots = [slot("16:00", false), slot("18:00", false)];
    expect(pickRestrictedWindowSlots(slots).map((s) => s.label)).toEqual(["16:00", "18:00"]);
  });

  it("lista vuota → resta vuota", () => {
    expect(pickRestrictedWindowSlots([])).toEqual([]);
  });

  it("preserva l'ordine originale", () => {
    const slots = [slot("11:00", true), slot("09:00", true), slot("10:00", true)];
    expect(pickRestrictedWindowSlots(slots).map((s) => s.label)).toEqual(["11:00", "09:00", "10:00"]);
  });
});
