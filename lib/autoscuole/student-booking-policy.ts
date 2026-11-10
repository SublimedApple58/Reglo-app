/**
 * Prenotazione allievi «solo eccezioni».
 *
 * «Chi può prenotare dall'app» (`appBookingActors`) resta la fonte di verità:
 *  - `students` / `both`  → modalità **open**: l'allievo prenota liberamente;
 *  - `instructors`        → l'allievo NON prenota liberamente; può farlo solo
 *    nei casi di eccezione accesi in `studentBookingExceptions` (modalità
 *    **exceptions**) oppure mai (modalità **closed**).
 *
 * Le eccezioni si configurano a livello autoscuola (default + per percorso
 * patente) e, per i gruppi autonomi, a livello gruppo (stessa forma; assente =
 * eredita). Cascata identica a `appBookingActors` (REG-426):
 * gruppo per percorso → gruppo default → autoscuola per percorso → autoscuola
 * default → `LEGACY_INSTRUCTORS_EXCEPTIONS`.
 *
 * Gli scambi tra allievi NON sono un'eccezione: li governa solo `swapEnabled`.
 *
 * Modulo puro (niente Prisma): il caricamento dal DB sta in
 * `student-booking-policy-loader.ts`.
 */
import type { AppBookingActors } from "@/lib/autoscuole/booking-governance";
import {
  LICENSE_PATH_BUCKETS,
  type LicensePathBucket,
} from "@/lib/autoscuole/license";

export type StudentBookingExceptions = {
  /** Interruttore generale «Solo eccezioni» (false = «Disattiva»). */
  enabled: boolean;
  /** Slot liberato da un annullamento (offerte `slot_fill_offer`). */
  slotFill: boolean;
  /** Posti liberi nelle guide di gruppo (`group_lesson_invite`). */
  groupSeats: boolean;
  /** Ultimo minuto: prenotazione libera solo entro `lastMinuteHours` da adesso. */
  lastMinute: boolean;
  lastMinuteHours: number;
};

export type StudentBookingExceptionsByPath = Partial<
  Record<LicensePathBucket, StudentBookingExceptions>
>;

export const LAST_MINUTE_HOURS_MIN = 1;
export const LAST_MINUTE_HOURS_MAX = 168;
export const LAST_MINUTE_HOURS_DEFAULT = 24;

export const STUDENT_BOOKING_EXCEPTIONS_OFF: StudentBookingExceptions = {
  enabled: false,
  slotFill: false,
  groupSeats: false,
  lastMinute: false,
  lastMinuteHours: LAST_MINUTE_HOURS_DEFAULT,
};

/**
 * Valore per chi è su «Solo istruttori» e non ha MAI salvato le eccezioni
 * (tutte le autoscuole esistenti al rilascio). Scelta in sospeso con Tiziano:
 *  - così com'è conserva il comportamento di fatto di oggi (slot liberato e
 *    posti nelle guide di gruppo si potevano già prendere) → «Solo eccezioni»;
 *  - sostituirlo con `STUDENT_BOOKING_EXCEPTIONS_OFF` rende tutti «Disattiva».
 * Nessuna migrazione dati: cambia solo questa costante. Appena il titolare
 * salva la riga, il valore esplicito prende il posto di questo.
 */
export const LEGACY_INSTRUCTORS_EXCEPTIONS: StudentBookingExceptions = {
  enabled: true,
  slotFill: true,
  groupSeats: true,
  lastMinute: false,
  lastMinuteHours: LAST_MINUTE_HOURS_DEFAULT,
};

const clampHours = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return LAST_MINUTE_HOURS_DEFAULT;
  }
  return Math.min(
    LAST_MINUTE_HOURS_MAX,
    Math.max(LAST_MINUTE_HOURS_MIN, Math.round(value)),
  );
};

/** Parse di un oggetto eccezioni grezzo (JSON). `undefined` = assente → eredita. */
export const parseStudentBookingExceptions = (
  raw: unknown,
): StudentBookingExceptions | undefined => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    enabled: obj.enabled === true,
    slotFill: obj.slotFill === true,
    groupSeats: obj.groupSeats === true,
    lastMinute: obj.lastMinute === true,
    lastMinuteHours: clampHours(obj.lastMinuteHours),
  };
};

export const parseStudentBookingExceptionsByPath = (
  raw: unknown,
): StudentBookingExceptionsByPath => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: StudentBookingExceptionsByPath = {};
  for (const bucket of LICENSE_PATH_BUCKETS) {
    const parsed = parseStudentBookingExceptions(obj[bucket]);
    if (parsed) out[bucket] = parsed;
  }
  return out;
};

export const resolveStudentBookingExceptionsForBucket = (input: {
  bucket: LicensePathBucket;
  clusterDefault?: StudentBookingExceptions | null;
  clusterByPath?: StudentBookingExceptionsByPath | null;
  companyDefault?: StudentBookingExceptions | null;
  companyByPath?: StudentBookingExceptionsByPath | null;
}): StudentBookingExceptions =>
  input.clusterByPath?.[input.bucket] ??
  input.clusterDefault ??
  input.companyByPath?.[input.bucket] ??
  input.companyDefault ??
  LEGACY_INSTRUCTORS_EXCEPTIONS;

export type StudentBookingMode = "open" | "exceptions" | "closed";

export type StudentBookingChannel =
  /** Prenotazione libera (available-slots, date-availability, booking-requests). */
  | "free"
  /** Accettare un'offerta «slot liberato». */
  | "slot_fill"
  /** Prendere un posto in una guida di gruppo. */
  | "group_seat"
  /** Accettare uno scambio (governato da `swapEnabled`, non dalle eccezioni). */
  | "swap";

/** Perché l'allievo non può prenotare per niente, a prescindere dal canale. */
export type StudentBookingHold =
  | "blocked"
  | "awaiting"
  | "theory"
  | "license_missing"
  | null;

export type StudentBookingPolicy = {
  mode: StudentBookingMode;
  appBookingActors: AppBookingActors;
  /** Eccezioni efficaci (tutte false se mode ≠ exceptions). */
  exceptions: StudentBookingExceptions;
  hold: StudentBookingHold;
};

const hasAnyException = (ex: StudentBookingExceptions) =>
  ex.slotFill || ex.groupSeats || ex.lastMinute;

export const resolveStudentBookingMode = (
  actors: AppBookingActors,
  exceptions: StudentBookingExceptions,
): StudentBookingMode => {
  if (actors !== "instructors") return "open";
  return exceptions.enabled && hasAnyException(exceptions) ? "exceptions" : "closed";
};

export const resolveStudentBookingHold = (input: {
  blocked: boolean;
  studentPhase?: string | null;
  selfRegistered?: boolean | null;
  licenseCategory?: string | null;
}): StudentBookingHold => {
  if (input.blocked) return "blocked";
  if (input.studentPhase === "AWAITING") return "awaiting";
  if (input.studentPhase === "TEORIA") return "theory";
  if (input.selfRegistered && !input.licenseCategory) return "license_missing";
  return null;
};

export const buildStudentBookingPolicy = (input: {
  appBookingActors: AppBookingActors;
  exceptions: StudentBookingExceptions;
  hold?: StudentBookingHold;
}): StudentBookingPolicy => {
  const mode = resolveStudentBookingMode(input.appBookingActors, input.exceptions);
  return {
    mode,
    appBookingActors: input.appBookingActors,
    exceptions:
      mode === "exceptions"
        ? input.exceptions
        : { ...STUDENT_BOOKING_EXCEPTIONS_OFF, lastMinuteHours: input.exceptions.lastMinuteHours },
    hold: input.hold ?? null,
  };
};

/**
 * Può usare questo canale? Unica regola per destinatari delle notifiche e per
 * l'accettazione. Il blocco e la fase fermano tutto; gli scambi ignorano la
 * modalità (li governa `swapEnabled`, controllato a parte).
 */
export const canStudentUseBookingChannel = (
  policy: StudentBookingPolicy,
  channel: StudentBookingChannel,
): boolean => {
  if (policy.hold) return false;
  if (channel === "swap") return true;
  if (policy.mode === "open") return true;
  if (policy.mode === "closed") return false;
  switch (channel) {
    case "free":
      return policy.exceptions.lastMinute;
    case "slot_fill":
      return policy.exceptions.slotFill;
    case "group_seat":
      return policy.exceptions.groupSeats;
  }
};

/**
 * Fine della finestra di prenotazione libera: `null` = nessun limite (open);
 * una data = solo slot che INIZIANO prima di essa (eccezione «ultimo minuto»).
 * Da usare solo se `canStudentUseBookingChannel(policy, "free")`.
 */
export const studentFreeBookingUntil = (
  policy: StudentBookingPolicy,
  now: Date = new Date(),
): Date | null => {
  if (policy.mode !== "exceptions") return null;
  return new Date(now.getTime() + policy.exceptions.lastMinuteHours * 60 * 60 * 1000);
};

/** Messaggio per l'allievo quando la prenotazione libera è rifiutata. */
export const studentFreeBookingDeniedMessage = (policy: StudentBookingPolicy) => {
  if (policy.mode === "exceptions") {
    return "Le guide le fissa la tua autoscuola. Puoi prenotare tu solo quando si libera un posto: ti avvisiamo noi.";
  }
  return "Le guide le fissa la tua autoscuola.";
};

export const studentLastMinuteOutOfWindowMessage = (policy: StudentBookingPolicy) =>
  `Puoi prenotare tu solo le guide che iniziano entro ${policy.exceptions.lastMinuteHours} ore. Per le altre ci pensa la tua autoscuola.`;
