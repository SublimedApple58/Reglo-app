import {
  bandsToRangesByDay,
  isInDrivingPhase,
  normalizeBandsByDay,
  rowToBandsByDay,
  snoozeUntilFrom,
  studentAvailabilityStepMode,
  weeklyRowFromBands,
} from "@/lib/autoscuole/student-availability";
import { defaultToAvailabilityRecord, isRecordCoveringMinutes } from "@/lib/autoscuole/availability-record";

const h = (hours: number) => hours * 60;

describe("fasce → minuti", () => {
  it("«venerdì pomeriggio e lunedì sera»", () => {
    expect(bandsToRangesByDay({ "5": ["afternoon"], "1": ["evening"] })).toEqual({
      "1": [{ startMinutes: h(18), endMinutes: h(21) }],
      "5": [{ startMinutes: h(13), endMinutes: h(18) }],
    });
  });

  it("fasce adiacenti si fondono, non adiacenti restano separate", () => {
    expect(bandsToRangesByDay({ "3": ["morning", "afternoon"] })["3"]).toEqual([
      { startMinutes: h(8), endMinutes: h(18) },
    ]);
    expect(bandsToRangesByDay({ "3": ["evening", "morning"] })["3"]).toEqual([
      { startMinutes: h(8), endMinutes: h(13) },
      { startMinutes: h(18), endMinutes: h(21) },
    ]);
    expect(bandsToRangesByDay({ "6": ["morning", "afternoon", "evening"] })["6"]).toEqual([
      { startMinutes: h(8), endMinutes: h(21) },
    ]);
  });

  it("scarta giorni e fasce non validi e giorni vuoti", () => {
    expect(
      normalizeBandsByDay({ "1": ["evening", "evening", "notte"], "7": ["morning"], "01": ["morning"], "2": [] }),
    ).toEqual({ "1": ["evening"] });
  });

  it("la riga scritta la leggono motore e lista d'attesa giorno per giorno", () => {
    const row = weeklyRowFromBands({ "5": ["afternoon"], "1": ["evening"] })!;
    expect(row.daysOfWeek).toEqual([1, 5]);
    // Campi piatti = primo giorno attivo (lunedì sera).
    expect([row.startMinutes, row.endMinutes]).toEqual([h(18), h(21)]);
    const record = defaultToAvailabilityRecord(row);
    expect(isRecordCoveringMinutes(record, 5, h(14), h(15))).toBe(true);
    expect(isRecordCoveringMinutes(record, 5, h(19), h(20))).toBe(false);
    expect(isRecordCoveringMinutes(record, 1, h(19), h(20))).toBe(true);
    expect(weeklyRowFromBands({})).toBeNull();
  });
});

describe("riga salvata → fasce (editor)", () => {
  it("andata e ritorno senza perdite", () => {
    const days = { "1": ["evening" as const], "3": ["morning" as const, "afternoon" as const] };
    expect(rowToBandsByDay(weeklyRowFromBands(days))).toEqual(days);
  });

  it("riga legacy: una fascia è scelta se coperta per almeno metà", () => {
    // App vecchia: mattina 9–12:30 + pomeriggio 14–19, lun/mer/ven.
    const legacy = {
      daysOfWeek: [1, 3, 5],
      startMinutes: h(9),
      endMinutes: h(12) + 30,
      startMinutes2: h(14),
      endMinutes2: h(19),
      ranges: [
        { startMinutes: h(9), endMinutes: h(12) + 30 },
        { startMinutes: h(14), endMinutes: h(19) },
      ],
      rangesByDay: null,
    };
    // mattina 3h30 su 5 ✓, pomeriggio 4h su 5 ✓, sera 1h su 3 ✗
    expect(rowToBandsByDay(legacy)).toEqual({
      "1": ["morning", "afternoon"],
      "3": ["morning", "afternoon"],
      "5": ["morning", "afternoon"],
    });
  });

  it("nessuna riga: nessuna fascia", () => {
    expect(rowToBandsByDay(null)).toEqual({});
  });
});

describe("criterio «fase guide»", () => {
  const base = { activeLicensePathId: null, licensePathCount: 0 };
  it("AWAITING e TEORIA: non ancora", () => {
    expect(isInDrivingPhase({ ...base, studentPhase: "AWAITING" })).toBe(false);
    expect(isInDrivingPhase({ ...base, studentPhase: "TEORIA" })).toBe(false);
  });
  it("PRATICA con percorso aperto, o senza percorsi registrati: sì", () => {
    expect(isInDrivingPhase({ studentPhase: "PRATICA", activeLicensePathId: "p1", licensePathCount: 2 })).toBe(true);
    expect(isInDrivingPhase({ ...base, studentPhase: "PRATICA" })).toBe(true);
    expect(isInDrivingPhase({ ...base, studentPhase: null })).toBe(true);
  });
  it("PATENTATO, o PRATICA con tutti i percorsi chiusi: non fa più guide", () => {
    expect(isInDrivingPhase({ ...base, studentPhase: "PATENTATO" })).toBeNull();
    expect(isInDrivingPhase({ studentPhase: "PRATICA", activeLicensePathId: null, licensePathCount: 1 })).toBeNull();
  });
});

describe("modo dello step Disponibilità", () => {
  const now = new Date("2026-11-27T10:00:00Z");
  const base = {
    hasAvailability: false,
    studentPhase: "PRATICA",
    activeLicensePathId: "p1",
    licensePathCount: 1,
    snoozedUntil: null,
    now,
  };
  it("chi le ha già (anche legacy) non viene fermato", () => {
    expect(studentAvailabilityStepMode({ ...base, hasAvailability: true })).toBe("none");
  });
  it("in fase guide: bloccante, anche con un rinvio in corso", () => {
    expect(studentAvailabilityStepMode(base)).toBe("required");
    expect(studentAvailabilityStepMode({ ...base, snoozedUntil: snoozeUntilFrom(now) })).toBe("required");
  });
  it("prima della fase guide: rimandabile; rinviato → sparisce fino alla scadenza", () => {
    const teoria = { ...base, studentPhase: "TEORIA" };
    expect(studentAvailabilityStepMode(teoria)).toBe("optional");
    const until = snoozeUntilFrom(now);
    expect(until.getTime() - now.getTime()).toBe(3 * 24 * 3600 * 1000);
    expect(studentAvailabilityStepMode({ ...teoria, snoozedUntil: until })).toBe("none");
    const later = new Date(until.getTime() + 1000);
    expect(studentAvailabilityStepMode({ ...teoria, snoozedUntil: until, now: later })).toBe("optional");
  });
  it("patentato: mai", () => {
    expect(studentAvailabilityStepMode({ ...base, studentPhase: "PATENTATO" })).toBe("none");
  });
});
