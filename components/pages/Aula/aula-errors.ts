/**
 * Reglo Aula — traduce i codici d'errore delle server action in messaggi
 * italiani leggibili. Le action lanciano codici tecnici (es. AULA_NOT_ENABLED)
 * che non vanno mai mostrati grezzi all'utente.
 */
const MESSAGES: Record<string, string> = {
  AULA_NOT_ENABLED: "Reglo Aula non è attivo per la tua autoscuola.",
  FORBIDDEN: "Non hai i permessi per accedere a Reglo Aula.",
  LESSON_NOT_FOUND: "Lezione non trovata.",
  LESSON_NOT_EDITABLE: "Questa lezione non è modificabile.",
  TEMPLATE_NOT_FOUND: "Lezione standard non trovata.",
  NO_CHAPTER_FOR_QUIZ:
    "Aggiungi almeno una domanda alla lezione (blocco “Domanda quiz”) o imposta un capitolo per avviare il quiz.",
  SESSION_NOT_FOUND: "Sessione quiz non trovata o scaduta.",
  NAME_TAKEN: "Nome già in uso, scegline un altro.",
};

/** Messaggio italiano per un codice d'errore Aula; fallback al generico. */
export function aulaErrorMessage(
  code?: string | null,
  fallback = "Si è verificato un errore. Riprova.",
): string {
  if (!code) return fallback;
  return MESSAGES[code] ?? fallback;
}
