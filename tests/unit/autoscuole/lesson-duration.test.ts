import {
  durationFromEndTime,
  exceedsMaxLessonDuration,
  formatDurationChip,
  MAX_LESSON_DURATION_MINUTES,
  minutesToTime,
} from "@/lib/autoscuole/lesson-duration";

const at = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00Z`);

describe("REG-757 durata delle guide", () => {
  it("4 ore e 10 ore sono ammesse, oltre no", () => {
    expect(MAX_LESSON_DURATION_MINUTES).toBe(600);
    expect(exceedsMaxLessonDuration(at("08:00"), at("12:00"))).toBe(false);
    expect(exceedsMaxLessonDuration(at("08:00"), at("18:00"))).toBe(false);
    expect(exceedsMaxLessonDuration(at("08:00"), at("18:15"))).toBe(true);
  });

  it("la fine scelta a mano diventa la durata", () => {
    expect(durationFromEndTime("08:00", "12:30")).toBe(270);
    expect(durationFromEndTime("08:00", "08:00")).toBeNull();
    expect(durationFromEndTime("10:00", "09:00")).toBeNull();
  });

  it("la fine non scavalca la mezzanotte", () => {
    expect(minutesToTime(22 * 60 + 240)).toBe("24:00");
  });

  it("etichette delle scelte rapide", () => {
    expect([30, 60, 90, 180, 240].map(formatDurationChip)).toEqual(["30m", "1h", "1h30", "3h", "4h"]);
  });
});
