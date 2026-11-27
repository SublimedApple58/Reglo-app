import {
  allRangesOf,
  defaultToAvailabilityRecord,
  isRecordCoveringMinutes,
  narrowToDay,
  overlapsWindowOnDay,
  parseRangesByDay,
  rangesForDay,
} from "@/lib/autoscuole/availability-record";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

// Riga legacy come la scrive oggi l'app allievo: mattina + pomeriggio, uguali
// su lunedì, mercoledì, venerdì.
const legacyRow = {
  daysOfWeek: [1, 3, 5],
  startMinutes: h(8),
  endMinutes: h(13),
  startMinutes2: h(14),
  endMinutes2: h(19),
  ranges: [
    { startMinutes: h(8), endMinutes: h(13) },
    { startMinutes: h(14), endMinutes: h(19) },
  ],
  rangesByDay: null,
};

// Riga per giorno (REG-802): lunedì mattina, martedì sera, sabato tutto il giorno.
// I campi piatti contengono il "giorno rappresentativo" (il primo attivo), come
// li scrive `createAvailabilitySlots` con `scheduleByDay`.
const perDayRow = {
  daysOfWeek: [1, 2, 6],
  startMinutes: h(8),
  endMinutes: h(13),
  startMinutes2: null,
  endMinutes2: null,
  ranges: [{ startMinutes: h(8), endMinutes: h(13) }],
  rangesByDay: {
    "1": [{ startMinutes: h(8), endMinutes: h(13) }],
    "2": [{ startMinutes: h(18), endMinutes: h(21) }],
    "6": [{ startMinutes: h(8), endMinutes: h(18) }],
  },
};

describe("defaultToAvailabilityRecord", () => {
  it("riga legacy: fasce condivise sui giorni attivi", () => {
    const r = defaultToAvailabilityRecord(legacyRow);
    expect(r.rangesByDay).toBeUndefined();
    expect(r.daysOfWeek).toEqual([1, 3, 5]);
    expect(r.ranges).toHaveLength(2);
  });

  it("riga legacy senza `ranges`: ricade su startMinutes/endMinutes(2)", () => {
    const r = defaultToAvailabilityRecord({ ...legacyRow, ranges: null });
    expect(r.ranges).toEqual([
      { startMinutes: h(8), endMinutes: h(13) },
      { startMinutes: h(14), endMinutes: h(19) },
    ]);
  });

  it("riga per giorno: `ranges` piatto vuoto apposta, giorni dalla mappa", () => {
    const r = defaultToAvailabilityRecord(perDayRow);
    expect(r.ranges).toEqual([]);
    expect(r.daysOfWeek).toEqual([1, 2, 6]);
    expect(Object.keys(r.rangesByDay!)).toEqual(["1", "2", "6"]);
  });
});

describe("parseRangesByDay", () => {
  it("scarta giorni fuori 0..6, fasce invertite e giorni vuoti", () => {
    expect(
      parseRangesByDay({
        "1": [{ startMinutes: h(9), endMinutes: h(8) }],
        "7": [{ startMinutes: h(8), endMinutes: h(9) }],
        x: [{ startMinutes: h(8), endMinutes: h(9) }],
        "3": [],
      }),
    ).toBeNull();
    expect(parseRangesByDay(null)).toBeNull();
    expect(parseRangesByDay([])).toBeNull();
  });
});

describe("rangesForDay", () => {
  it("legacy: le stesse fasce sui giorni attivi, niente negli altri", () => {
    const r = defaultToAvailabilityRecord(legacyRow);
    expect(rangesForDay(r, 3)).toHaveLength(2);
    expect(rangesForDay(r, 2)).toEqual([]);
  });

  it("per giorno: le fasce di quel giorno (il bug del REG-802 leggeva `ranges`, vuoto)", () => {
    const r = defaultToAvailabilityRecord(perDayRow);
    expect(rangesForDay(r, 2)).toEqual([{ startMinutes: h(18), endMinutes: h(21) }]);
    expect(rangesForDay(r, 6)).toEqual([{ startMinutes: h(8), endMinutes: h(18) }]);
    expect(rangesForDay(r, 0)).toEqual([]);
    // Il vecchio lettore: `daysOfWeek.includes(2)` vero ma `ranges` vuoto → zero orari.
    expect(r.ranges).toEqual([]);
  });

  it("narrowToDay produce la forma legacy del solo giorno", () => {
    const r = defaultToAvailabilityRecord(perDayRow);
    expect(narrowToDay(r, 2)).toEqual({ daysOfWeek: [2], ranges: [{ startMinutes: h(18), endMinutes: h(21) }] });
    expect(narrowToDay(r, 4)).toEqual({ daysOfWeek: [], ranges: [] });
  });
});

describe("isRecordCoveringMinutes (lista d'attesa, scambi)", () => {
  it("per giorno: copre solo dentro la fascia di quel giorno", () => {
    const r = defaultToAvailabilityRecord(perDayRow);
    expect(isRecordCoveringMinutes(r, 2, h(18, 30), h(19, 30))).toBe(true);
    expect(isRecordCoveringMinutes(r, 2, h(9), h(10))).toBe(false);
    expect(isRecordCoveringMinutes(r, 1, h(12, 30), h(13, 30))).toBe(false);
    expect(isRecordCoveringMinutes(r, 0, h(9), h(10))).toBe(false);
  });

  it("legacy senza `ranges`: usa i campi piatti (la copia negli scambi non lo faceva)", () => {
    const r = defaultToAvailabilityRecord({ ...legacyRow, ranges: [] });
    expect(isRecordCoveringMinutes(r, 1, h(15), h(16))).toBe(true);
  });

  it("nessuna disponibilità: non copre", () => {
    expect(isRecordCoveringMinutes(null, 1, h(9), h(10))).toBe(false);
  });
});

describe("overlapsWindowOnDay («Riempi le fasce più vuote»)", () => {
  const band = [h(8), h(13)] as const;

  it("legacy: identico a prima su ogni giorno (sovrapposizione delle fasce condivise)", () => {
    const morning = defaultToAvailabilityRecord({ ...legacyRow, ranges: [legacyRow.ranges[0]] });
    const afternoon = defaultToAvailabilityRecord({ ...legacyRow, ranges: [legacyRow.ranges[1]] });
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      expect(overlapsWindowOnDay(morning, day, ...band)).toBe(true);
      expect(overlapsWindowOnDay(afternoon, day, ...band)).toBe(false);
    }
  });

  it("per giorno: decide con le fasce di quel giorno", () => {
    const r = defaultToAvailabilityRecord(perDayRow);
    expect(overlapsWindowOnDay(r, 1, ...band)).toBe(true); // lunedì mattina
    expect(overlapsWindowOnDay(r, 2, ...band)).toBe(false); // martedì solo sera
    expect(overlapsWindowOnDay(r, 6, ...band)).toBe(true); // sabato 8–18
  });

  it("per giorno, giorno senza fasce: guarda la settimana", () => {
    const r = defaultToAvailabilityRecord(perDayRow);
    expect(overlapsWindowOnDay(r, 4, ...band)).toBe(true);
    const eveningsOnly = defaultToAvailabilityRecord({
      ...perDayRow,
      rangesByDay: { "2": [{ startMinutes: h(18), endMinutes: h(21) }] },
    });
    expect(overlapsWindowOnDay(eveningsOnly, 4, ...band)).toBe(false);
  });

  it("nessuna disponibilità: nessuna priorità", () => {
    expect(overlapsWindowOnDay(null, 1, ...band)).toBe(false);
  });
});

describe("allRangesOf", () => {
  it("unisce le fasce di tutti i giorni", () => {
    expect(allRangesOf(defaultToAvailabilityRecord(perDayRow))).toHaveLength(3);
    expect(allRangesOf(defaultToAvailabilityRecord(legacyRow))).toHaveLength(2);
  });
});
