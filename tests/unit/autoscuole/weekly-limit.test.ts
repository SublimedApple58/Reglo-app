import {
  exceedsWeeklyLimit,
  formatDrivingMinutes,
  formatWeeklyLimit,
  formatWeeklyUsage,
  lessonMinutes,
  minutesToHoursInput,
  parseHoursInput,
  parseWeeklyLimitMinutes,
  parseWeeklyLimitUnit,
  weeklyLimitFrom,
  type WeeklyLimit,
} from "@/lib/autoscuole/weekly-limit";

/** REG-782: limite settimanale a guide o a ore (minuti). */
const lessons3: WeeklyLimit = { unit: "lessons", lessons: 3, minutes: 240 };
const hours4h30: WeeklyLimit = { unit: "minutes", lessons: 3, minutes: 270 };

describe("exceedsWeeklyLimit", () => {
  it("a guide: la quarta guida supera il limite di 3, come prima", () => {
    expect(exceedsWeeklyLimit(lessons3, { lessons: 2, minutes: 400 }, { lessons: 1, minutes: 120 })).toBe(false);
    expect(exceedsWeeklyLimit(lessons3, { lessons: 3, minutes: 90 }, { lessons: 1, minutes: 30 })).toBe(true);
  });

  it("a ore: conta la durata, non il numero", () => {
    // 3 ore già prenotate + 1 ora e mezza = 4 ore e 30: ci sta.
    expect(exceedsWeeklyLimit(hours4h30, { lessons: 5, minutes: 180 }, { lessons: 1, minutes: 90 })).toBe(false);
    // + 2 ore = 5 ore: no.
    expect(exceedsWeeklyLimit(hours4h30, { lessons: 1, minutes: 180 }, { lessons: 1, minutes: 120 })).toBe(true);
  });

  it("guide in serie: somma tutte le nuove", () => {
    expect(exceedsWeeklyLimit(lessons3, { lessons: 1, minutes: 60 }, { lessons: 2, minutes: 120 })).toBe(false);
    expect(exceedsWeeklyLimit(lessons3, { lessons: 1, minutes: 60 }, { lessons: 3, minutes: 180 })).toBe(true);
  });
});

describe("weeklyLimitFrom e parse", () => {
  it("senza unità resta a guide, con i minuti di default", () => {
    expect(weeklyLimitFrom({ weeklyBookingLimit: 3 })).toEqual({ unit: "lessons", lessons: 3, minutes: 240 });
  });
  it("prende unità e minuti del cluster/autoscuola", () => {
    expect(
      weeklyLimitFrom({ weeklyBookingLimit: 3, weeklyBookingLimitUnit: "minutes", weeklyBookingLimitMinutes: 270 }),
    ).toEqual(hours4h30);
  });
  it.each([
    ["minutes", "minutes"],
    ["lessons", "lessons"],
    ["ore", "lessons"],
    [undefined, "lessons"],
  ])("parseWeeklyLimitUnit(%p) → %p", (raw, expected) => {
    expect(parseWeeklyLimitUnit(raw)).toBe(expected);
  });
  it.each([
    [270, 270],
    [30, 30],
    [3000, 3000],
    [29, null],
    [3001, null],
    [4.5, null],
    ["270", null],
  ])("parseWeeklyLimitMinutes(%p) → %p", (raw, expected) => {
    expect(parseWeeklyLimitMinutes(raw)).toBe(expected);
  });
});

describe("ore scritte dal titolare", () => {
  it.each([
    ["4", 240],
    ["4,5", 270],
    ["4.5", 270],
    ["4:30", 270],
    [" 2,25 ", 135],
    ["0", null],
    ["abc", null],
    ["4:75", null],
  ])("parseHoursInput(%p) → %p", (raw, expected) => {
    expect(parseHoursInput(raw)).toBe(expected);
  });
  it.each([
    [240, "4"],
    [270, "4,5"],
    [250, "4:10"],
    [30, "0,5"],
  ])("minutesToHoursInput(%p) → %p", (minutes, expected) => {
    expect(minutesToHoursInput(minutes)).toBe(expected);
  });
});

describe("testi", () => {
  it("formatta ore e minuti", () => {
    expect(formatDrivingMinutes(270)).toBe("4 ore e 30");
    expect(formatDrivingMinutes(60)).toBe("1 ora");
    expect(formatDrivingMinutes(45)).toBe("45 minuti");
  });
  it("limite e uso nell'unità giusta", () => {
    expect(formatWeeklyLimit(lessons3)).toBe("3 guide");
    expect(formatWeeklyLimit(hours4h30)).toBe("4 ore e 30 di guida");
    expect(formatWeeklyUsage(lessons3, { lessons: 1, minutes: 60 })).toBe("1 guida");
    expect(formatWeeklyUsage(hours4h30, { lessons: 2, minutes: 180 })).toBe("3 ore");
  });
  it("durata guida senza fine = 60 minuti", () => {
    const start = new Date("2026-11-24T08:00:00Z");
    expect(lessonMinutes(start, null)).toBe(60);
    expect(lessonMinutes(start, new Date("2026-11-24T09:30:00Z"))).toBe(90);
  });
});
