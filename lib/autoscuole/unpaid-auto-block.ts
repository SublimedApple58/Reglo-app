import { prisma } from "@/db/prisma";
import { getAutoscuolaPaymentConfig } from "@/lib/autoscuole/payments";

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

const normalizeStatus = (value: string) => value.trim().toLowerCase();

function isCompanyManualMode(config: {
  enabled: boolean;
  lessonCreditFlowEnabled: boolean;
  lessonCreditsRequired: boolean;
}): boolean {
  return (
    (!config.enabled && !config.lessonCreditFlowEnabled) ||
    (config.lessonCreditFlowEnabled && !config.lessonCreditsRequired)
  );
}

/**
 * Predicato "guida da pagare non saldata". Definizione unica condivisa dalla
 * lista allievi, dal dettaglio allievo e dal conteggio dell'auto-block, così la
 * regola non può divergere tra i vari punti.
 */
export function isLessonUnpaid(
  l: {
    status: string;
    manualPaymentStatus?: string | null;
    creditApplied?: boolean | null;
    lateCancellationAction?: string | null;
  },
  manualMode: boolean,
): boolean {
  if (l.creditApplied) return false;
  if (l.manualPaymentStatus === "paid") return false;
  const s = normalizeStatus(l.status);
  return (
    (["completed", "checked_in"].includes(s) && manualMode) ||
    (["cancelled", "no_show"].includes(s) &&
      l.lateCancellationAction === "charged" &&
      l.manualPaymentStatus === "unpaid")
  );
}

/** Conta le guide non pagate non saldate di un singolo allievo. */
export async function getStudentUnpaidLessonCount(
  companyId: string,
  studentId: string,
): Promise<number> {
  const [config, lessons] = await Promise.all([
    getAutoscuolaPaymentConfig({ companyId }),
    prisma.autoscuolaAppointment.findMany({
      where: { companyId, studentId },
      select: {
        status: true,
        manualPaymentStatus: true,
        creditApplied: true,
        lateCancellationAction: true,
      },
      take: 5000,
    }),
  ]);
  const manualMode = isCompanyManualMode(config);
  return lessons.filter((l) => isLessonUnpaid(l, manualMode)).length;
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
