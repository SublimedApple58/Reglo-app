/**
 * Esito di un esame: **idoneo** o **respinto**.
 *
 * Nasce da una constatazione sui dati di produzione: su 476 esami, 240 erano
 * `status: "completed"` fra Macchiavello e Robatto — ma `completed` dice
 * soltanto che l'esame **si è svolto**, non che l'allievo sia passato. Oggi
 * quell'informazione entra dalla porta dell'autoscuola e non viene registrata
 * da nessuna parte.
 *
 * L'esito vive sulla riga dell'appuntamento, non su una tabella nuova, perché
 * un esame è **già** una riga per allievo (`materializeExamSlot`): ogni
 * partecipante ha la propria, e un allievo respinto che ripete l'esame ha due
 * righe con due esiti. Lo storico non si sovrascrive mai.
 */

export const EXAM_OUTCOMES = ["idoneo", "respinto"] as const;
export type ExamOutcome = (typeof EXAM_OUTCOMES)[number];

export function isExamOutcome(value: unknown): value is ExamOutcome {
  return typeof value === "string" && (EXAM_OUTCOMES as readonly string[]).includes(value);
}

/** Null-safe: qualunque cosa non sia un esito noto vale "non registrato". */
export function asExamOutcome(value: unknown): ExamOutcome | null {
  return isExamOutcome(value) ? value : null;
}

export const EXAM_OUTCOME_LABELS: Record<ExamOutcome, string> = {
  idoneo: "Idoneo",
  respinto: "Respinto",
};

export function examOutcomeLabel(value: unknown): string | null {
  const outcome = asExamOutcome(value);
  return outcome ? EXAM_OUTCOME_LABELS[outcome] : null;
}

/**
 * Un esito si registra solo su un esame vero (non un segnaposto senza
 * iscritti), non annullato, e **non prima che l'esame sia iniziato**: un esame
 * di domani non ha un esito, ha una data.
 *
 * La tolleranza di 10 minuti è la stessa dell'esito delle guide nel dettaglio
 * allievo: chi registra lo fa mentre la cosa accade, non al secondo esatto.
 */
export const EXAM_OUTCOME_LEAD_MS = 10 * 60 * 1000;

export function canRecordExamOutcome(
  appointment: {
    type: string;
    status: string;
    studentId: string | null;
    startsAt: Date | string;
  },
  now: Date = new Date(),
): boolean {
  if (appointment.type !== "esame") return false;
  if (!appointment.studentId) return false;
  if (appointment.status === "cancelled") return false;
  const startsAt =
    appointment.startsAt instanceof Date ? appointment.startsAt : new Date(appointment.startsAt);
  if (Number.isNaN(startsAt.getTime())) return false;
  return startsAt.getTime() - EXAM_OUTCOME_LEAD_MS <= now.getTime();
}

/**
 * Un idoneo chiude il percorso: l'allievo diventa PATENTATO (decisione di
 * Tiziano del 23/09 — automatico, non proposto).
 *
 * Conseguenze volute, documentate qui perché non sono ovvie da fuori:
 * `examReady` si azzera, e l'allievo **sparisce dal picker "Seleziona allievo"
 * dell'app istruttore**, che mostra solo la fase PRATICA (REG-499). L'agenda
 * web non filtra per fase, quindi il titolare può comunque prenotargli
 * qualcosa. Tutto reversibile riportando la fase a PRATICA.
 *
 * Il respinto NON tocca la fase: chi non passa resta dov'è, e ripeterà.
 */
export function phaseAfterExamOutcome(outcome: ExamOutcome): "PATENTATO" | null {
  return outcome === "idoneo" ? "PATENTATO" : null;
}

/**
 * Il numero di patente si accetta solo su un idoneo, e solo ripulito. Su un
 * respinto qualunque numero è un errore di compilazione, non un dato: si
 * scarta invece di salvarlo.
 */
export function normalizeLicenseNumber(
  outcome: ExamOutcome,
  raw: string | null | undefined,
): string | null {
  if (outcome !== "idoneo") return null;
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
