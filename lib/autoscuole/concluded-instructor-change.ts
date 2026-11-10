/**
 * Cambio istruttore su una guida già conclusa (richiesta Macchiavello: il
 * sostituto "al volo" si scopre a guida finita, e il job la segna completata
 * pochi secondi dopo la fine). Lo può fare solo il titolare/admin, su guide
 * completate o assenti, entro 30 giorni dalla data della guida. Le annullate
 * restano bloccate. Usato dal server e dal foglio «Modifica guida» del web.
 */

export const CONCLUDED_INSTRUCTOR_CHANGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const isConcludedForInstructorChange = (status: string) =>
  status === "completed" || status === "no_show";

/** La guida è abbastanza recente da poterne correggere l'istruttore. */
export function isWithinConcludedInstructorChangeWindow(
  startsAt: Date,
  now: Date = new Date(),
) {
  return now.getTime() - startsAt.getTime() <= CONCLUDED_INSTRUCTOR_CHANGE_DAYS * DAY_MS;
}
