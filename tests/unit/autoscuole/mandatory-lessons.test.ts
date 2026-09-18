import {
  MANDATORY_LESSON_MINUTES,
  REQUIRED_LESSONS_COUNT,
  isMandatoryLessonDuration,
} from "@/lib/autoscuole/mandatory-lessons";

const at = (iso: string) => new Date(iso);
const lesson = (startIso: string, minutes: number | null) => ({
  startsAt: at(startIso),
  endsAt:
    minutes === null
      ? null
      : new Date(at(startIso).getTime() + minutes * 60 * 1000),
});

describe("guide obbligatorie", () => {
  it("l'obbligo è di 6 guide da 60 minuti", () => {
    expect(REQUIRED_LESSONS_COUNT).toBe(6);
    expect(MANDATORY_LESSON_MINUTES).toBe(60);
  });

  it("conta la guida da esattamente 60 minuti", () => {
    expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", 60))).toBe(true);
  });

  it("NON conta la guida da 30 minuti (il bug che ha originato la modifica)", () => {
    expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", 30))).toBe(false);
  });

  it("NON conta le durate intermedie né quelle più lunghe", () => {
    for (const minutes of [45, 50, 59, 61, 90, 120, 180]) {
      expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", minutes))).toBe(
        false,
      );
    }
  });

  it("NON conta la guida senza fine registrata", () => {
    expect(isMandatoryLessonDuration(lesson("2026-09-18T09:00:00Z", null))).toBe(false);
  });

  it("regge il cambio d'ora legale: conta i millisecondi, non l'ora del giorno", () => {
    // 26/10/2025 in Europe/Rome le 03:00 tornano alle 02:00: un'ora "di orologio"
    // non è un'ora di calendario, ma la durata in millisecondi resta 60 minuti.
    const startsAt = new Date("2025-10-26T00:30:00Z");
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    expect(isMandatoryLessonDuration({ startsAt, endsAt })).toBe(true);
  });

  it("scarta una fine precedente all'inizio", () => {
    const startsAt = at("2026-09-18T09:00:00Z");
    expect(
      isMandatoryLessonDuration({
        startsAt,
        endsAt: new Date(startsAt.getTime() - 60 * 60 * 1000),
      }),
    ).toBe(false);
  });
});
