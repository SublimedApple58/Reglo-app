/**
 * REG-815 — fase di partenza di chi si registra dall'app.
 *
 * Impostazione per autoscuola in `CompanyService.limits.signupStartPhase`:
 *   AWAITING → in attesa di attivazione (decide il titolare)
 *   TEORIA   → licenza quiz subito, se ce n'è una libera; altrimenti in attesa
 *   PRATICA  → foglio rosa: parte dalle guide, nessuna licenza quiz
 *
 * Retrocompatibilità: se il campo manca vale il vecchio interruttore
 * `autoAssignQuizOnSignup` (acceso = TEORIA, spento = AWAITING). Chi salva
 * l'impostazione tiene allineato anche quello (`autoAssignFor`), così i
 * lettori vecchi (backoffice, API dell'app) restano coerenti.
 *
 * Senza la fase Teoria attiva l'impostazione non conta: si parte in PRATICA.
 */
export const SIGNUP_START_PHASES = ["AWAITING", "TEORIA", "PRATICA"] as const;
export type SignupStartPhase = (typeof SIGNUP_START_PHASES)[number];

type LimitsLike = Record<string, unknown> | null | undefined;

const isSignupStartPhase = (value: unknown): value is SignupStartPhase =>
  typeof value === "string" && (SIGNUP_START_PHASES as readonly string[]).includes(value);

const theoryEnabled = (limits: LimitsLike) =>
  Array.isArray(limits?.phasesEnabled) && limits.phasesEnabled.includes("TEORIA");

/** L'impostazione salvata, col ripiego sul vecchio interruttore. */
export function resolveSignupStartPhase(limits: LimitsLike): SignupStartPhase {
  if (isSignupStartPhase(limits?.signupStartPhase)) return limits.signupStartPhase;
  return limits?.autoAssignQuizOnSignup ? "TEORIA" : "AWAITING";
}

/** Valore del vecchio interruttore da salvare insieme all'impostazione. */
export const autoAssignFor = (phase: SignupStartPhase) => phase === "TEORIA";

/**
 * Fase e posto quiz del nuovo iscritto. `seatsConsumed` va letto nella stessa
 * transazione della creazione (due iscrizioni insieme non devono superare i posti).
 */
export function decideSignupPhase(
  limits: LimitsLike,
  seatsConsumed: number,
): { studentPhase: SignupStartPhase; grantSeat: boolean } {
  if (!theoryEnabled(limits)) return { studentPhase: "PRATICA", grantSeat: false };

  const start = resolveSignupStartPhase(limits);
  if (start !== "TEORIA") return { studentPhase: start, grantSeat: false };

  const raw = limits?.quizSeats;
  const quizSeats = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return seatsConsumed < quizSeats
    ? { studentPhase: "TEORIA", grantSeat: true }
    : { studentPhase: "AWAITING", grantSeat: false };
}
