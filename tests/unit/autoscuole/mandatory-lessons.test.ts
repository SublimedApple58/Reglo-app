import {
  MANDATORY_LESSON_MINUTES,
  REQUIRED_DRIVING_MINUTES,
  REQUIRED_LESSONS_COUNT,
  creditedMinutes,
  isMandatoryLessonDuration,
  lessonMinutes,
  mandatoryHoursProgress,
} from "@/lib/autoscuole/mandatory-lessons";

const at = (iso: string) => new Date(iso);
const lesson = (startIso: string, minutes: number | null) => ({
  startsAt: at(startIso),
  endsAt:
    minutes === null
      ? null
      : new Date(at(startIso).getTime() + minutes * 60 * 1000),
});
const lessons = (...minutes: Array<number | null>) =>
  minutes.map((m, i) => lesson(`2026-09-${String(10 + i).padStart(2, "0")}T09:00:00Z`, m));

describe("guide obbligatorie — colori agenda (prime 6 da 60')", () => {
  it("l'obbligo agenda è di 6 guide da 60 minuti", () => {
    expect(REQUIRED_LESSONS_COUNT).toBe(6);
    expect(MANDATORY_LESSON_MINUTES).toBe(60);
  });

  it("conta la guida da esattamente 60 minuti", () => {
    expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", 60))).toBe(true);
  });

  it("NON conta le altre durate né la guida senza fine", () => {
    for (const minutes of [30, 45, 59, 61, 90]) {
      expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", minutes))).toBe(false);
    }
    expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", null))).toBe(false);
  });

  it("regge il cambio d'ora legale: conta i millisecondi, non l'ora del giorno", () => {
    const startsAt = new Date("2025-10-26T00:30:00Z");
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    expect(isMandatoryLessonDuration({ startsAt, endsAt })).toBe(true);
  });
});

describe("guide obbligatorie — contatore a ore (segnalazione Ricca)", () => {
  it("la soglia è di 6 ore", () => {
    expect(REQUIRED_DRIVING_MINUTES).toBe(360);
  });

  it("quattro mezz'ore fanno 2 ore (prima: 0/6)", () => {
    expect(mandatoryHoursProgress(lessons(30, 30, 30, 30)).completedMinutes).toBe(120);
  });

  it("una mezz'ora vale mezz'ora, non una guida", () => {
    expect(mandatoryHoursProgress(lessons(30)).completedMinutes).toBe(30);
  });

  it("le guide Road a fine reale contano (55' e 65' = 2 ore)", () => {
    expect(mandatoryHoursProgress(lessons(55, 65)).completedMinutes).toBe(120);
  });

  it("un'ora Road da 55' vale un'ora (tolleranza 5')", () => {
    expect(creditedMinutes(55)).toBe(60);
    expect(creditedMinutes(50)).toBe(30);
    expect(creditedMinutes(7)).toBe(0);
  });

  it("completa a 6 ore e non va sotto zero il residuo", () => {
    const done = mandatoryHoursProgress(lessons(60, 60, 60, 60, 60, 60, 60));
    expect(done.isCompleted).toBe(true);
    expect(done.remainingMinutes).toBe(0);
    const half = mandatoryHoursProgress(lessons(60, 60, 30));
    expect(half).toEqual({
      completedMinutes: 150,
      requiredMinutes: 360,
      remainingMinutes: 210,
      isCompleted: false,
    });
  });

  it("soglia diversa (es. 8 ore) senza toccare il calcolo", () => {
    expect(mandatoryHoursProgress(lessons(60, 60, 60, 60, 60, 60), 480).isCompleted).toBe(false);
  });

  it("ignora guide senza fine o con fine prima dell'inizio", () => {
    expect(lessonMinutes(lesson("2026-09-18T09:00:00Z", null))).toBe(0);
    expect(lessonMinutes(lesson("2026-09-18T09:00:00Z", -60))).toBe(0);
  });
});
