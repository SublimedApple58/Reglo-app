/**
 * Guide obbligatorie: quante sono e quali guide ci entrano.
 *
 * Il criterio (2026-06-12) è **solo le guide da esattamente 60 minuti**: una
 * guida di altra durata non è una guida obbligatoria e non consuma nemmeno uno
 * dei 6 posti. Nasceva nei flag dell'agenda (`buildAppointmentGridFlags`),
 * mentre il contatore "x/6" del dettaglio allievo contava TUTTE le guide
 * completate, comprese quelle da 30 minuti: le due viste si contraddicevano.
 * Da qui in poi la regola sta in un posto solo.
 *
 * `endsAt` nullo NON conta: è una guida senza fine registrata, che altrove vale
 * 30 minuti per convenzione (`computeAppointmentEnd`).
 *
 * Gemello mobile: `reglo-mobile/src/utils/mandatoryLessons.ts` — le due copie
 * vanno cambiate insieme.
 */

export const REQUIRED_LESSONS_COUNT = 6;

export const MANDATORY_LESSON_MINUTES = 60;

const MANDATORY_LESSON_MS = MANDATORY_LESSON_MINUTES * 60 * 1000;

/** True se la guida dura esattamente 60 minuti, quindi conta per l'obbligo. */
export const isMandatoryLessonDuration = (lesson: {
  startsAt: Date;
  endsAt: Date | null;
}): boolean =>
  lesson.endsAt != null &&
  lesson.endsAt.getTime() - lesson.startsAt.getTime() === MANDATORY_LESSON_MS;
