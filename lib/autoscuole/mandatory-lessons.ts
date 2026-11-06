/**
 * Guide obbligatorie: quante sono e quali guide ci entrano.
 *
 * Due regole diverse, per due domande diverse:
 *
 * 1. **Quanto manca all'obbligo** (contatore della scheda e della lista Allievi
 *    web) — dal 2026-11-06 si contano le **ore guidate**, non le guide. Prima
 *    contavano solo le guide da esattamente 60 minuti: un allievo con quattro
 *    guide da mezz'ora restava a 0/6, e una guida Road (che dal REG-723 prende
 *    la fine reale, es. 55' o 65') non contava più (segnalazione Ricca). Ora
 *    ogni guida completata vale i suoi minuti; il totale si mostra a mezz'ore
 *    (`creditedMinutes`). La soglia è una sola costante: quando le obbligatorie
 *    passeranno a 8 ore si cambia `REQUIRED_DRIVING_HOURS`.
 *
 * 2. **Quali guide colorare in agenda come obbligatorie** (`mandatoryLesson`
 *    di `buildAppointmentGridFlags`) — resta il criterio del 2026-06-12: le
 *    prime 6 guide da esattamente 60 minuti (`isMandatoryLessonDuration`).
 *
 * Gemello mobile: `reglo-mobile/src/utils/mandatoryLessons.ts` (oggi ancora col
 * criterio dei 60 minuti anche per il contatore).
 */

export const REQUIRED_LESSONS_COUNT = 6;

export const MANDATORY_LESSON_MINUTES = 60;

const MANDATORY_LESSON_MS = MANDATORY_LESSON_MINUTES * 60 * 1000;

/** True se la guida dura esattamente 60 minuti (colori dell'agenda). */
export const isMandatoryLessonDuration = (lesson: {
  startsAt: Date;
  endsAt: Date | null;
}): boolean =>
  lesson.endsAt != null &&
  lesson.endsAt.getTime() - lesson.startsAt.getTime() === MANDATORY_LESSON_MS;

/** Ore di guida obbligatorie. Quando diventano 8, si cambia qui. */
export const REQUIRED_DRIVING_HOURS = 6;

export const REQUIRED_DRIVING_MINUTES = REQUIRED_DRIVING_HOURS * 60;

/** Il contatore avanza a mezz'ore. */
export const DRIVING_STEP_MINUTES = 30;

/**
 * Tolleranza sul gradino: le guide Road finiscono all'orario reale arrotondato
 * ai 5 minuti, quindi un'ora guidata può valere 55'. Senza tolleranza
 * risulterebbe mezz'ora.
 */
const STEP_TOLERANCE_MINUTES = 5;

/** Minuti di una guida; nessuna fine (o fine prima dell'inizio) = 0. */
export const lessonMinutes = (lesson: { startsAt: Date; endsAt: Date | null }): number => {
  if (!lesson.endsAt) return 0;
  const ms = lesson.endsAt.getTime() - lesson.startsAt.getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
};

/** Minuti totali portati a mezz'ore piene (con la tolleranza Road). */
export const creditedMinutes = (totalMinutes: number): number =>
  Math.floor((Math.max(0, totalMinutes) + STEP_TOLERANCE_MINUTES) / DRIVING_STEP_MINUTES) *
  DRIVING_STEP_MINUTES;

export type MandatoryHoursProgress = {
  completedMinutes: number;
  requiredMinutes: number;
  remainingMinutes: number;
  isCompleted: boolean;
};

/** Avanzamento dell'obbligo dalle guide completate (già filtrate dal chiamante). */
export const mandatoryHoursProgress = (
  lessons: Array<{ startsAt: Date; endsAt: Date | null }>,
  requiredMinutes: number = REQUIRED_DRIVING_MINUTES,
): MandatoryHoursProgress => {
  const completedMinutes = creditedMinutes(
    lessons.reduce((sum, lesson) => sum + lessonMinutes(lesson), 0),
  );
  return {
    completedMinutes,
    requiredMinutes,
    remainingMinutes: Math.max(0, requiredMinutes - completedMinutes),
    isCompleted: completedMinutes >= requiredMinutes,
  };
};
