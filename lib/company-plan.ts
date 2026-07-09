/** Helper condivisi (client + server) del piano autoscuola. */

export function formatEuroCents(cents: number) {
  return `${(cents / 100).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export const BILLING_PERIOD_LABELS = {
  monthly: "Mensile",
  annual: "Annuale",
} as const;

export const BILLING_PERIOD_SUFFIX = {
  monthly: "/mese",
  annual: "/anno",
} as const;

/** "264,00" | "264.5" | "264" → centesimi (null se non parsabile). */
export function parseEuroToCents(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/** Centesimi → stringa editabile "264,00". */
export function centsToEuroInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
