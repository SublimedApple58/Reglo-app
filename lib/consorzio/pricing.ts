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

export type ConsorzioPricing = {
  hourlyByCategory: Partial<Record<string, number>>;
  billingModeByCategory: Partial<Record<string, ConsorzioBillingMode>>;
  courseByCategory: Partial<Record<string, number>>;
  /** € per esame; null = non impostata (l'esame vale 0). */
  examFee: number | null;
  lateCancellationCutoffHours: number;
  lateCancellationPenaltyPct: number;
  guideRequestMinLeadHours: number;
};

export const DEFAULT_LATE_CANCELLATION_CUTOFF_HOURS = 48;
export const DEFAULT_LATE_CANCELLATION_PENALTY_PCT = 100;

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
