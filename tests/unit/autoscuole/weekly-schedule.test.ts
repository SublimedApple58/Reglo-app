import {
  activeDaysOf,
  groupDaysByRanges,
  hasPerDayHours,
  rangesForWeekday,
  scheduleFromWeekly,
  sharedRangesOf,
  weeklyPayloadFromSchedule,
} from "@/lib/autoscuole/weekly-schedule";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const legacy = {
  daysOfWeek: [1, 3, 5],
  startMinutes: 540,
  endMinutes: 1080,
  ranges: [{ startMinutes: 540, endMinutes: 780 }, { startMinutes: 900, endMinutes: 1080 }],
};

const perDay = {
  daysOfWeek: [1, 2],
  startMinutes: 540,
  endMinutes: 780,
  ranges: [{ startMinutes: 540, endMinutes: 780 }],
  rangesByDay: {
    "1": [{ startMinutes: 540, endMinutes: 780 }],
    "2": [{ startMinutes: 900, endMinutes: 1140 }],
    // giorno spento salvato come array vuoto: va ignorato
    "3": [],
  },
};

describe("weekly-schedule", () => {
  it("proietta il modello condiviso su tutti i giorni attivi", () => {
    const schedule = scheduleFromWeekly(legacy);
    expect(activeDaysOf(schedule)).toEqual([1, 3, 5]);
    expect(schedule[1]).toEqual(legacy.ranges);
    expect(schedule[3]).toEqual(legacy.ranges);
    expect(schedule[5]).toEqual(legacy.ranges);
  });

  it("usa i campi piatti quando `ranges` è vuoto", () => {
    expect(sharedRangesOf({ daysOfWeek: [2], startMinutes: 600, endMinutes: 720 })).toEqual([
      { startMinutes: 600, endMinutes: 720 },
    ]);
  });

  it("dà la precedenza a rangesByDay e scarta i giorni vuoti", () => {
    const schedule = scheduleFromWeekly(perDay);
    expect(activeDaysOf(schedule)).toEqual([1, 2]);
    expect(schedule[2]).toEqual([{ startMinutes: 900, endMinutes: 1140 }]);
    expect(rangesForWeekday(perDay, 2)).toEqual([{ startMinutes: 900, endMinutes: 1140 }]);
    expect(rangesForWeekday(perDay, 3)).toEqual([]);
    expect(hasPerDayHours(perDay)).toBe(true);
    expect(hasPerDayHours(legacy)).toBe(false);
  });

  it("non condivide riferimenti con la sorgente", () => {
    const schedule = scheduleFromWeekly(legacy);
    schedule[1][0].startMinutes = 0;
    expect(legacy.ranges[0].startMinutes).toBe(540);
  });

  it("raggruppa i giorni con le stesse fasce nell'ordine di visualizzazione", () => {
    const groups = groupDaysByRanges(scheduleFromWeekly(legacy), DAY_ORDER);
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toEqual([1, 3, 5]);

    const mixed = groupDaysByRanges(scheduleFromWeekly(perDay), DAY_ORDER);
    expect(mixed.map((g) => g.days)).toEqual([[1], [2]]);
  });

  it("include scheduleByDay solo in modalità per-giorno", () => {
    const schedule = scheduleFromWeekly(perDay);

    const shared = weeklyPayloadFromSchedule(schedule, false);
    expect(shared).not.toBeNull();
    expect(shared!.scheduleByDay).toBeUndefined();
    // giorno rappresentativo = il primo attivo
    expect(shared!.daysOfWeek).toEqual([1, 2]);
    expect(shared!.startMinutes).toBe(540);
    expect(shared!.endMinutes).toBe(780);

    const byDay = weeklyPayloadFromSchedule(schedule, true);
    expect(byDay!.scheduleByDay).toEqual({
      "1": [{ startMinutes: 540, endMinutes: 780 }],
      "2": [{ startMinutes: 900, endMinutes: 1140 }],
    });
  });

  it("rifiuta una settimana senza giorni attivi", () => {
    expect(weeklyPayloadFromSchedule({}, true)).toBeNull();
    expect(weeklyPayloadFromSchedule({ 1: [] }, false)).toBeNull();
    expect(scheduleFromWeekly(null)).toEqual({});
  });
});
