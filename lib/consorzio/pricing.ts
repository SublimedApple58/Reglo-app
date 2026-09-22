import { CONSORTIUM_LICENSE_CATEGORIES } from "@/lib/autoscuole/license";
import { DEFAULT_GUIDE_REQUEST_MIN_LEAD_HOURS } from "@/lib/consorzio/guide-request-lead";

/**
 * Listino del consorzio (`CompanyService.limits.consorzioPricing`), configurato
 * in Impostazioni → Prenotazioni e allievi → Prezzi. Modulo puro (niente
 * Prisma) così parse e calcolo prezzi sono testabili e condivisi tra le action.
 *
 * Criterio di fatturazione per patente (REG-462):
 * - "hourly" (default): ogni guida costa durata/60 × tariffa oraria;
 * - "course": prezzo unico per l'intero percorso dell'allievo. Le guide di
 *   quella patente valgono 0 (incluse) e il percorso compare come voce a sé in
 *   Fatturazione, nel mese della prima guida dell'allievo.
 * Le due cifre restano salvate entrambe: cambiare criterio non perde l'altra.
 *
 * Tariffa esame (REG-459): prezzo fisso per ogni esame prenotato a un allievo,
 * voce "Esame" distinta dalle guide (anche per le patenti a percorso).
 * Vedi docs/features/consorzio.md.
 */

export const CONSORZIO_BILLING_MODES = ["hourly", "course"] as const;
export type ConsorzioBillingMode = (typeof CONSORZIO_BILLING_MODES)[number];

/**
 * Come si calcola il costo di un'assenza (REG-507).
 *
 * "percent" è il comportamento storico dichiarato (una percentuale del prezzo
 * della guida, quindi dipendente dalla categoria); "fixed" è la richiesta del
 * consorzio: una cifra unica «a prescindere dalla categoria», perché una CE
 * saltata al prezzo pieno costa all'autoscuola quanto una guida fatta.
 */
export const LATE_CANCELLATION_MODES = ["percent", "fixed"] as const;
export type LateCancellationMode = (typeof LATE_CANCELLATION_MODES)[number];

export type ConsorzioPricing = {
  hourlyByCategory: Partial<Record<string, number>>;
  billingModeByCategory: Partial<Record<string, ConsorzioBillingMode>>;
  courseByCategory: Partial<Record<string, number>>;
  /** € per esame; null = non impostata (l'esame vale 0). */
  examFee: number | null;
  lateCancellationCutoffHours: number;
  lateCancellationPenaltyPct: number;
  /** Criterio del costo assenza: percentuale della guida o importo fisso. */
  lateCancellationMode: LateCancellationMode;
  /** € addebitati per assenza quando il criterio è "fixed". */
  lateCancellationFixedAmount: number;
  guideRequestMinLeadHours: number;
};

export const DEFAULT_LATE_CANCELLATION_CUTOFF_HOURS = 48;
export const DEFAULT_LATE_CANCELLATION_PENALTY_PCT = 100;
/** Il criterio storico resta il default: chi non sceglie non cambia conto. */
export const DEFAULT_LATE_CANCELLATION_MODE: LateCancellationMode = "percent";
export const DEFAULT_LATE_CANCELLATION_FIXED_AMOUNT = 20;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const readAmounts = (raw: unknown): Partial<Record<string, number>> => {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Partial<Record<string, number>> = {};
  for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
    if (isAmount(source[category])) out[category] = source[category] as number;
  }
  return out;
};

export function parseConsorzioPricing(limits: Record<string, unknown>): ConsorzioPricing {
  const raw = (limits.consorzioPricing ?? {}) as Record<string, unknown>;
  const modesRaw =
    raw.billingModeByCategory && typeof raw.billingModeByCategory === "object"
      ? (raw.billingModeByCategory as Record<string, unknown>)
      : {};
  const billingModeByCategory: Partial<Record<string, ConsorzioBillingMode>> = {};
  for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
    if (modesRaw[category] === "course") billingModeByCategory[category] = "course";
  }
  return {
    hourlyByCategory: readAmounts(raw.hourlyByCategory),
    billingModeByCategory,
    courseByCategory: readAmounts(raw.courseByCategory),
    examFee: isAmount(raw.examFee) ? raw.examFee : null,
    lateCancellationCutoffHours:
      typeof raw.lateCancellationCutoffHours === "number"
        ? raw.lateCancellationCutoffHours
        : DEFAULT_LATE_CANCELLATION_CUTOFF_HOURS,
    lateCancellationPenaltyPct:
      typeof raw.lateCancellationPenaltyPct === "number"
        ? raw.lateCancellationPenaltyPct
        : DEFAULT_LATE_CANCELLATION_PENALTY_PCT,
    lateCancellationMode:
      raw.lateCancellationMode === "fixed" ? "fixed" : DEFAULT_LATE_CANCELLATION_MODE,
    lateCancellationFixedAmount: isAmount(raw.lateCancellationFixedAmount)
      ? raw.lateCancellationFixedAmount
      : DEFAULT_LATE_CANCELLATION_FIXED_AMOUNT,
    guideRequestMinLeadHours:
      typeof raw.guideRequestMinLeadHours === "number"
        ? raw.guideRequestMinLeadHours
        : DEFAULT_GUIDE_REQUEST_MIN_LEAD_HOURS,
  };
}

export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/** Criterio di fatturazione della patente (senza patente → a ore). */
export function billingModeFor(
  pricing: ConsorzioPricing,
  category: string | null | undefined,
): ConsorzioBillingMode {
  if (!category) return "hourly";
  return pricing.billingModeByCategory[category] ?? "hourly";
}

/**
 * Prezzo di una guida: durata/60 × tariffa oraria; 0 se la patente è a
 * percorso (la guida è inclusa nel prezzo unico) o se la tariffa manca.
 */
export function guidePrice(
  pricing: ConsorzioPricing,
  category: string | null | undefined,
  durationMinutes: number,
): number {
  if (!category || billingModeFor(pricing, category) === "course") return 0;
  const tariff = pricing.hourlyByCategory[category];
  if (tariff === undefined) return 0;
  return roundMoney((Math.max(0, durationMinutes) / 60) * tariff);
}

/** Prezzo unico del percorso, `null` se la patente non è a percorso. */
export function coursePrice(
  pricing: ConsorzioPricing,
  category: string | null | undefined,
): number | null {
  if (!category || billingModeFor(pricing, category) !== "course") return null;
  return pricing.courseByCategory[category] ?? 0;
}

/** "YYYY-MM" (UTC, come i confini mese della Fatturazione). */
export const billingMonthOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** Prezzo di un esame (0 se la tariffa esame non è impostata). */
export function examPrice(pricing: ConsorzioPricing): number {
  return pricing.examFee ?? 0;
}

/* ─────────────────────────── Costo dell'assenza ──────────────────────────── */

/**
 * Quanto costa alla scuola una guida che l'allievo non ha fatto.
 *
 * - `fixed`: la stessa cifra per chiunque, **anche** per le patenti a percorso
 *   (lì la guida vale 0 perché è già pagata nel prezzo unico, ma il posto
 *   sprecato resta un costo reale per il consorzio);
 * - `percent`: una quota del prezzo della guida, quindi 0 per le patenti a
 *   percorso e proporzionale alla categoria per le altre — è la conseguenza
 *   onesta di quel criterio, non una svista.
 */
export function absencePrice(
  pricing: ConsorzioPricing,
  category: string | null | undefined,
  durationMinutes: number,
): number {
  if (pricing.lateCancellationMode === "fixed") {
    return roundMoney(Math.max(0, pricing.lateCancellationFixedAmount));
  }
  const full = guidePrice(pricing, category, durationMinutes);
  return roundMoney((full * Math.max(0, pricing.lateCancellationPenaltyPct)) / 100);
}

export type AbsenceCandidate = {
  status: string;
  cancellationKind?: string | null;
  startsAt: Date;
  cancelledAt?: Date | null;
};

/**
 * True se questa guida va addebitata come **assenza** invece che come guida.
 *
 * Due casi, e solo due:
 *  - **no-show**: l'allievo non si è presentato. Sempre, senza preavviso che
 *    tenga.
 *  - **annullamento dell'allievo oltre il cutoff**: `manual_cancel` deciso
 *    troppo tardi perché il posto potesse essere rivenduto.
 *
 * Restano fuori di proposito: `operational_cancel` e `operational_reposition`
 * (li decide la scuola — istruttore malato, mezzo fermo: far pagare l'allievo
 * sarebbe assurdo), `record_cleanup` (è una pulizia dello storico, non un
 * annullamento) e `permanent_cancel`. Nel dubbio non si addebita: un addebito
 * di troppo lo scopre il cliente, uno in meno lo scopre il consorzio.
 */
export function isBillableAbsence(
  appointment: AbsenceCandidate,
  cutoffHours: number,
): boolean {
  if (appointment.status === "no_show") return true;
  if (appointment.status !== "cancelled") return false;
  if (appointment.cancellationKind !== "manual_cancel") return false;
  if (!appointment.cancelledAt) return false;
  // cutoff 0 = regola spenta: nessun annullamento è mai "tardivo".
  if (cutoffHours <= 0) return false;
  const cutoffAt = new Date(
    appointment.startsAt.getTime() - cutoffHours * 60 * 60 * 1000,
  );
  return appointment.cancelledAt.getTime() > cutoffAt.getTime();
}
