import { prisma } from "@/db/prisma";
import { getAutoscuolaPaymentConfig } from "@/lib/autoscuole/payments";
import {
  isCompanyManualMode,
  isLessonUnpaid,
  unpaidLessonCandidatesWhere,
  UNPAID_LESSON_SELECT,
} from "@/lib/autoscuole/lesson-unpaid";

/**
 * Auto-block prenotazioni per debito allievo.
 *
 * Il blocco automatico scrive sullo STESSO campo booleano `bookingBlocked` del
 * blocco manuale del titolare (unificazione). Per non entrare in conflitto con
 * l'azione del titolare, ogni blocco porta un'origine (`bookingBlockReason`):
 *
 *   - "manual"           → blocco deciso dal titolare. L'automatismo non lo
 *                          tocca MAI (né sblocca, né riclassifica).
 *   - "unpaid_threshold" → blocco deciso dall'automatismo per soglia superata.
 *                          L'automatismo può sbloccarlo da solo quando l'allievo
 *                          scende sotto soglia.
 *   - null               → non bloccato. (Un blocco legacy con `bookingBlocked`
 *                          true e reason null è trattato come manuale: vedi sotto.)
 *
 * Anti-conflitto: se il titolare sblocca manualmente un allievo bloccato
 * dall'automatismo, non vogliamo che l'automatismo lo riblocchi subito per lo
 * stesso debito residuo. Lo sblocco manuale registra un "watermark"
 * (`unpaidBlockClearedAtCount`) = numero di guide non pagate al momento dello
 * sblocco. L'automatismo riblocca solo se il debito supera quel livello (nuovo
 * incremento) oppure se prima scende sotto soglia e poi risale (il watermark
 * viene azzerato quando si scende sotto soglia).
 */

export const DEFAULT_AUTO_BOOKING_BLOCK_ENABLED = false;
export const DEFAULT_AUTO_BOOKING_BLOCK_THRESHOLD = 3;

export type BookingBlockReason = "manual" | "unpaid_threshold";

export type AutoBlockSettings = {
  enabled: boolean;
  /** Numero di guide da pagare non saldate oltre il quale scatta il blocco. */
  threshold: number;
};

export type MemberBlockState = {
  bookingBlocked: boolean;
  bookingBlockReason: BookingBlockReason | null;
  unpaidBlockClearedAtCount: number | null;
};

export type AutoBlockDecision =
  | { changed: false }
  | ({ changed: true } & MemberBlockState);

/** Legge le impostazioni auto-block dal JSON `limits` del CompanyService. */
export function readAutoBlockSettings(
  limits: Record<string, unknown> | null | undefined,
): AutoBlockSettings {
  const enabled = (limits?.autoBookingBlockEnabled ?? false) === true;
  const rawThreshold = limits?.autoBookingBlockThreshold;
  const threshold =
    typeof rawThreshold === "number" && rawThreshold >= 1
      ? rawThreshold
      : DEFAULT_AUTO_BOOKING_BLOCK_THRESHOLD;
  return { enabled, threshold };
}

/**
 * Macchina a stati pura: dato lo stato corrente del membro, il numero attuale di
 * guide non pagate e le impostazioni dell'azienda, restituisce lo stato
 * successivo (o "nessun cambiamento"). Non tocca mai un blocco manuale del
 * titolare. Nessun side-effect: testabile in isolamento.
 */
export function resolveUnpaidAutoBlock(
  state: MemberBlockState,
  unpaidCount: number,
  settings: AutoBlockSettings,
): AutoBlockDecision {
  // Blocco manuale del titolare (o legacy: bloccato senza reason) → intoccabile.
  if (state.bookingBlockReason === "manual") return { changed: false };
  if (state.bookingBlocked && state.bookingBlockReason == null) {
    return { changed: false };
  }

  // Feature spenta → l'automatismo rilascia solo i blocchi che ha messo lui e
  // ripulisce eventuali watermark residui. I blocchi manuali sono già esclusi.
  if (!settings.enabled) {
    if (state.bookingBlockReason === "unpaid_threshold") {
      return {
        changed: true,
        bookingBlocked: false,
        bookingBlockReason: null,
        unpaidBlockClearedAtCount: null,
      };
    }
    if (state.unpaidBlockClearedAtCount != null) {
      return {
        changed: true,
        bookingBlocked: state.bookingBlocked,
        bookingBlockReason: state.bookingBlockReason,
        unpaidBlockClearedAtCount: null,
      };
    }
    return { changed: false };
  }

  const overThreshold = unpaidCount >= settings.threshold;

  // Già bloccato dall'automatismo per soglia.
  if (state.bookingBlockReason === "unpaid_threshold") {
    if (!overThreshold) {
      // Debito sceso sotto soglia → l'automatismo sblocca il proprio blocco.
      return {
        changed: true,
        bookingBlocked: false,
        bookingBlockReason: null,
        unpaidBlockClearedAtCount: null,
      };
    }
    return { changed: false };
  }

  // Da qui in poi lo studente NON è bloccato (reason null, bookingBlocked false).
  if (!overThreshold) {
    // Sotto soglia: niente da bloccare e un eventuale watermark è ormai stantìo.
    if (state.unpaidBlockClearedAtCount != null) {
      return {
        changed: true,
        bookingBlocked: false,
        bookingBlockReason: null,
        unpaidBlockClearedAtCount: null,
      };
    }
    return { changed: false };
  }

  // Sopra soglia e non bloccato: rispetta lo sblocco manuale del titolare finché
  // il debito non supera il livello a cui aveva sbloccato.
  if (
    state.unpaidBlockClearedAtCount != null &&
    unpaidCount <= state.unpaidBlockClearedAtCount
  ) {
    return { changed: false };
  }

  // Nuovo superamento soglia (o incremento oltre il livello dismesso) → blocca.
  return {
    changed: true,
    bookingBlocked: true,
    bookingBlockReason: "unpaid_threshold",
    unpaidBlockClearedAtCount: null,
  };
}

// Predicato e pre-filtro vivono in un modulo puro (REG-634), importabile anche
// dai client component: qui li ri-esportiamo per i chiamanti storici.
export { isCompanyManualMode, isLessonUnpaid };

/** Conta le guide non pagate non saldate di un singolo allievo. */
export async function getStudentUnpaidLessonCount(
  companyId: string,
  studentId: string,
): Promise<number> {
  const counts = await getStudentsUnpaidLessonCounts(companyId, [studentId]);
  return counts.get(studentId) ?? 0;
}

/**
 * Applica la macchina a stati e persiste il cambiamento sul CompanyMember quando
 * necessario. Restituisce lo stato (aggiornato o invariato) così il chiamante
 * può usarlo subito senza rileggere il DB.
 */
export async function reconcileUnpaidAutoBlock(params: {
  companyId: string;
  userId: string;
  state: MemberBlockState;
  unpaidCount: number;
  settings: AutoBlockSettings;
}): Promise<MemberBlockState> {
  const decision = resolveUnpaidAutoBlock(
    params.state,
    params.unpaidCount,
    params.settings,
  );
  if (!decision.changed) return params.state;
  const next: MemberBlockState = {
    bookingBlocked: decision.bookingBlocked,
    bookingBlockReason: decision.bookingBlockReason,
    unpaidBlockClearedAtCount: decision.unpaidBlockClearedAtCount,
  };
  await prisma.companyMember.updateMany({
    where: {
      companyId: params.companyId,
      userId: params.userId,
      autoscuolaRole: "STUDENT",
    },
    data: next,
  });
  return next;
}

/**
 * Conta le guide da pagare di N allievi con una sola lettura. È l'unico
 * conteggio del debito lato server: lo usano la prenotazione da app, la lista
 * Allievi e lo sblocco (anche in bulk, REG-442, per il watermark).
 *
 * Legge solo le guide candidate (`unpaidLessonCandidatesWhere`), non tutto lo
 * storico, e senza `take`: un tetto senza ordinamento faceva sparire guide a
 * caso e scendere il debito sotto soglia (REG-634). La regola finale resta
 * `isLessonUnpaid`, applicata riga per riga.
 */
export async function getStudentsUnpaidLessonCounts(
  companyId: string,
  studentIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(studentIds.map((id) => [id, 0]));
  if (!studentIds.length) return counts;
  const config = await getAutoscuolaPaymentConfig({ companyId });
  const manualMode = isCompanyManualMode(config);
  const lessons = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId: { in: studentIds },
      ...unpaidLessonCandidatesWhere(manualMode),
    },
    select: { studentId: true, ...UNPAID_LESSON_SELECT },
  });
  for (const lesson of lessons) {
    if (!lesson.studentId) continue;
    if (!counts.has(lesson.studentId)) continue;
    if (!isLessonUnpaid(lesson, manualMode)) continue;
    counts.set(lesson.studentId, (counts.get(lesson.studentId) ?? 0) + 1);
  }
  return counts;
}
