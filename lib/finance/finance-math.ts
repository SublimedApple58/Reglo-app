/**
 * Matematica della sezione Finanza (REG-413). File puro: niente Prisma, niente
 * Next — si testa da solo (`tests/unit/finance-math.test.ts`).
 *
 * Convenzioni: importi in centesimi interi e IVA INCLUSA; aliquote in punti base
 * (2200 = 22%); date di calendario come stringhe `YYYY-MM-DD`.
 */

export type FinanceDirection = "in" | "out";
export type FinanceStatus = "settled" | "due" | "planned";
export type RecurringCadence = "monthly" | "quarterly" | "annual";

export const DEFAULT_VAT_RATE_BPS = 2200;
export const VAT_RATE_OPTIONS = [2200, 1000, 500, 400, 0] as const;

export const CADENCE_MONTHS: Record<RecurringCadence, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

export const CADENCE_LABEL: Record<RecurringCadence, string> = {
  monthly: "mensile",
  quarterly: "trimestrale",
  annual: "annuale",
};

/** Quota IVA contenuta in un importo IVA inclusa (scorporo). */
export const vatPortionCents = (grossCents: number, vatRateBps: number | null | undefined) => {
  if (!vatRateBps || vatRateBps <= 0) return 0;
  return Math.round((grossCents * vatRateBps) / (10000 + vatRateBps));
};

export const netOfVatCents = (grossCents: number, vatRateBps: number | null | undefined) =>
  grossCents - vatPortionCents(grossCents, vatRateBps);

/** Costo mensile equivalente di una spesa fissa. */
export const monthlyEquivalentCents = (amountCents: number, cadence: RecurringCadence) =>
  Math.round(amountCents / CADENCE_MONTHS[cadence]);

// ── Date di calendario ──────────────────────────────────────────────────────

export const isYmd = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const isYm = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

const pad = (n: number) => String(n).padStart(2, "0");

export const ymdOf = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

/** Oggi a Roma (il backoffice ragiona in ora italiana, il server in UTC). */
export const todayYmdRome = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

export const lastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** `YYYY-MM` → primo e ultimo giorno del mese. */
export const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { from: ymdOf(y, m - 1, 1), to: ymdOf(y, m - 1, lastDayOfMonth(y, m - 1)) };
};

export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** Date del DB (`@db.Date`, mezzanotte UTC) ↔ stringhe. */
export const dbDateToYmd = (date: Date) => date.toISOString().slice(0, 10);
export const ymdToDbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// ── Spese fisse ─────────────────────────────────────────────────────────────

export type RecurringLike = {
  amountCents: number;
  cadence: RecurringCadence;
  startsOn: string;
  endsOn: string | null;
  dayOfMonth: number;
};

/**
 * Le scadenze di una spesa fissa comprese tra `from` e `to` (inclusi). La
 * prima cade nel mese di `startsOn`, poi ogni 1/3/12 mesi, sempre al
 * `dayOfMonth` (o all'ultimo giorno, nei mesi più corti).
 */
export function occurrencesBetween(expense: RecurringLike, from: string, to: string): string[] {
  const [sy, sm] = expense.startsOn.split("-").map(Number);
  const step = CADENCE_MONTHS[expense.cadence];
  const out: string[] = [];
  const end = expense.endsOn && expense.endsOn < to ? expense.endsOn : to;
  // Limite di sicurezza: 100 anni di scadenze mensili.
  for (let i = 0; i < 1200; i += step) {
    const d = new Date(Date.UTC(sy, sm - 1 + i, 1));
    const y = d.getUTCFullYear();
    const mi = d.getUTCMonth();
    const day = Math.min(Math.max(1, expense.dayOfMonth), lastDayOfMonth(y, mi));
    const ymd = ymdOf(y, mi, day);
    if (ymd > end) break;
    if (ymd >= from && ymd >= expense.startsOn) out.push(ymd);
  }
  return out;
}

/** La prossima scadenza da `from` in poi (entro 2 anni), o null. */
export function nextOccurrence(expense: RecurringLike, from: string): string | null {
  const [y, m, d] = from.split("-").map(Number);
  const horizon = ymdOf(y + 2, m - 1, Math.min(d, 28));
  return occurrencesBetween(expense, from, horizon)[0] ?? null;
}

export const isRecurringActive = (expense: { endsOn: string | null }, today: string) =>
  !expense.endsOn || expense.endsOn >= today;

// ── Totali dei movimenti ────────────────────────────────────────────────────

export type EntryLike = {
  direction: FinanceDirection;
  status: FinanceStatus;
  amountCents: number;
  vatRateBps: number | null;
};

export type EntryTotals = {
  inSettledCents: number;
  outSettledCents: number;
  balanceCents: number;
  inDueCents: number;
  outDueCents: number;
  plannedInCents: number;
  plannedOutCents: number;
  /** IVA sugli incassi meno IVA sulle spese registrate con aliquota. */
  vatToSetAsideCents: number;
  vatOnSalesCents: number;
  vatOnPurchasesCents: number;
};

export function totalsOf(entries: EntryLike[]): EntryTotals {
  const t: EntryTotals = {
    inSettledCents: 0,
    outSettledCents: 0,
    balanceCents: 0,
    inDueCents: 0,
    outDueCents: 0,
    plannedInCents: 0,
    plannedOutCents: 0,
    vatToSetAsideCents: 0,
    vatOnSalesCents: 0,
    vatOnPurchasesCents: 0,
  };
  for (const e of entries) {
    if (e.status === "settled") {
      if (e.direction === "in") {
        t.inSettledCents += e.amountCents;
        t.vatOnSalesCents += vatPortionCents(e.amountCents, e.vatRateBps);
      } else {
        t.outSettledCents += e.amountCents;
        t.vatOnPurchasesCents += vatPortionCents(e.amountCents, e.vatRateBps);
      }
    } else if (e.status === "due") {
      if (e.direction === "in") t.inDueCents += e.amountCents;
      else t.outDueCents += e.amountCents;
    } else if (e.direction === "in") {
      t.plannedInCents += e.amountCents;
    } else {
      t.plannedOutCents += e.amountCents;
    }
  }
  t.balanceCents = t.inSettledCents - t.outSettledCents;
  t.vatToSetAsideCents = t.vatOnSalesCents - t.vatOnPurchasesCents;
  return t;
}

/** Euro (stringa dell'utente, anche "1.234,50") → centesimi. null se non valido. */
export function parseEuroToCents(input: string): number | null {
  const raw = input.trim().replace(/\s|€/g, "");
  if (!raw) return null;
  // "1.234,56" → "1234.56"; "1234.56" resta; "1234,5" → "1234.5"
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "") // "1.234" = milleduecentotrentaquattro
      : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
