import {
  monthBounds,
  occurrencesBetween,
  shiftMonth,
  totalsOf,
  vatPortionCents,
  lastDayOfMonth,
  ymdOf,
  type EntryTotals,
  type FinanceDirection,
  type FinanceStatus,
  type RecurringLike,
} from "@/lib/finance/finance-math";

/**
 * Panoramica della sezione Finanza (REG-413, fase 2). File puro: riceve i dati
 * già letti e restituisce tutto quello che la pagina disegna — si testa da solo
 * (`tests/unit/finance-overview.test.ts`).
 *
 * Regole di Tiziano: solo dati veri (dove manca il dato, `null` e la pagina
 * mostra uno stato vuoto); le entrate contano quando sono INCASSATE; importi
 * IVA inclusa; nessuno storico MRR (l'MRR è sempre quello di oggi).
 */

export type OverviewEntry = {
  id: string;
  date: string;
  description: string;
  categoryName: string;
  direction: FinanceDirection;
  amountCents: number;
  vatRateBps: number | null;
  status: FinanceStatus;
  settledOn: string | null;
  companyId: string | null;
  companyName: string | null;
  invoiceNumber: string | null;
  recurringExpenseId: string | null;
};

export type OverviewRecurring = RecurringLike & {
  id: string;
  name: string;
  categoryName: string;
  categoryGroup: string | null;
  archived: boolean;
  active: boolean;
  monthlyCents: number;
};

export type OverviewPlan = {
  companyId: string;
  companyName: string;
  billingPeriod: string;
  /** Data del prossimo rinnovo registrata sul piano, o null («da completare»). */
  renewsAt: string | null;
  /** Quanto si incassa a ogni rinnovo: il canone del mese o dell'anno. */
  periodCents: number;
  monthlyCents: number;
};

export type OverviewInput = {
  today: string;
  /** Mese scelto in alto (margine e IVA seguono questo). */
  month: string;
  entries: OverviewEntry[];
  recurring: OverviewRecurring[];
  plans: OverviewPlan[];
  /** Autoscuole clienti (già senza demo, test e consorziate). */
  companiesCount: number;
  openingBalanceCents: number | null;
  openingDate: string | null;
};

export type ForecastItem = {
  key: string;
  date: string;
  direction: FinanceDirection;
  amountCents: number;
  kind: "open" | "recurring" | "renewal";
  title: string;
  sub: string | null;
  status: FinanceStatus | null;
  overdue: boolean;
};

export type ChartMonth = {
  ym: string;
  isCurrent: boolean;
  isFuture: boolean;
  /** Mese prima della data di partenza dei conti: niente barre, non è uno zero. */
  beforeStart: boolean;
  actualInCents: number;
  actualOutCents: number;
  forecastInCents: number;
  forecastOutCents: number;
  renewalsInCents: number;
  /** Cassa a fine mese (oggi, per il mese in corso). null senza saldo iniziale. */
  cashCents: number | null;
};

const PAST_MONTHS = 5;
const FUTURE_MONTHS = 6;
export const UPCOMING_DAYS = 90;
const AVG_SPEND_MONTHS = 3;

export const addDaysYmd = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const ymOf = (ymd: string) => ymd.slice(0, 7);

/** Primo e ultimo giorno del trimestre solare che contiene `ym`. */
export const quarterBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const first = Math.floor((m - 1) / 3) * 3;
  return {
    from: ymdOf(y, first, 1),
    to: ymdOf(y, first + 2, lastDayOfMonth(y, first + 2)),
    firstYm: `${y}-${String(first + 1).padStart(2, "0")}`,
    lastYm: `${y}-${String(first + 3).padStart(2, "0")}`,
  };
};

/**
 * Le date di rinnovo di un piano tra `from` e `to`: dalla data registrata in
 * poi, ogni mese (piani mensili) o ogni anno. Un `renewsAt` già passato e non
 * aggiornato vale come anniversario: si proietta il successivo.
 */
export function planRenewalsBetween(
  plan: Pick<OverviewPlan, "renewsAt" | "billingPeriod">,
  from: string,
  to: string,
): string[] {
  if (!plan.renewsAt) return [];
  const step = plan.billingPeriod === "monthly" ? 1 : 12;
  const [ay, am, ad] = plan.renewsAt.split("-").map(Number);
  const [fy, fm] = from.split("-").map(Number);
  const monthsToFrom = (fy - ay) * 12 + (fm - am);
  const kStart = Math.max(0, Math.floor(monthsToFrom / step) - 1);
  const out: string[] = [];
  for (let k = kStart; k < kStart + 600; k++) {
    const d = new Date(Date.UTC(ay, am - 1 + k * step, 1));
    const y = d.getUTCFullYear();
    const mi = d.getUTCMonth();
    const ymd = ymdOf(y, mi, Math.min(ad, lastDayOfMonth(y, mi)));
    if (ymd > to) break;
    if (ymd >= from) out.push(ymd);
  }
  return out;
}

/**
 * Tutto ciò che si aspetta tra `from` e `to`: movimenti non ancora saldati,
 * scadenze delle spese fisse non registrate, rinnovi dei piani. Un rinnovo
 * non si conta se nello stesso mese c'è già un'entrata di quell'autoscuola
 * (registrata a mano: vale quella, non la stima).
 */
export function forecastBetween(input: OverviewInput, from: string, to: string): ForecastItem[] {
  const items: ForecastItem[] = [];

  for (const e of input.entries) {
    if (e.status === "settled" || e.date < from || e.date > to) continue;
    items.push(openItem(e, input.today));
  }

  const paid = new Set(
    input.entries
      .filter((e) => e.recurringExpenseId)
      .map((e) => `${e.recurringExpenseId}|${e.date}`),
  );
  for (const r of input.recurring) {
    if (r.archived) continue;
    for (const date of occurrencesBetween(r, from, to)) {
      if (paid.has(`${r.id}|${date}`)) continue;
      items.push({
        key: `rec-${r.id}-${date}`,
        date,
        direction: "out",
        amountCents: r.amountCents,
        kind: "recurring",
        title: r.name,
        sub: r.categoryName,
        status: null,
        overdue: false,
      });
    }
  }

  const incomeMonths = new Set(
    input.entries
      .filter((e) => e.direction === "in" && e.companyId)
      .map((e) => `${e.companyId}|${ymOf(e.date)}`),
  );
  for (const p of input.plans) {
    if (p.periodCents <= 0) continue;
    for (const date of planRenewalsBetween(p, from, to)) {
      if (incomeMonths.has(`${p.companyId}|${ymOf(date)}`)) continue;
      items.push({
        key: `ren-${p.companyId}-${date}`,
        date,
        direction: "in",
        amountCents: p.periodCents,
        kind: "renewal",
        title: p.companyName,
        sub: p.billingPeriod === "monthly" ? "rinnovo mensile" : "rinnovo annuale",
        status: null,
        overdue: false,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

function openItem(e: OverviewEntry, today: string): ForecastItem {
  const sub = e.direction === "in" ? (e.companyName ?? e.categoryName) : e.categoryName;
  return {
    key: `entry-${e.id}`,
    date: e.date,
    direction: e.direction,
    amountCents: e.amountCents,
    kind: "open",
    title: e.invoiceNumber ? `Fattura ${e.invoiceNumber} · ${e.description}` : e.description,
    sub,
    status: e.status,
    overdue: e.date < today,
  };
}

/** Movimenti non saldati con la data già passata: soldi che si aspettano ancora. */
export const overdueItems = (input: OverviewInput) =>
  input.entries
    .filter((e) => e.status !== "settled" && e.date < input.today)
    .map((e) => openItem(e, input.today))
    .sort((a, b) => a.date.localeCompare(b.date));

const sum = (items: Array<{ amountCents: number }>) =>
  items.reduce((total, i) => total + i.amountCents, 0);

const settledIn = (entries: OverviewEntry[], from: string, to: string) =>
  entries.filter((e) => e.status === "settled" && e.date >= from && e.date <= to);

// ── Pezzi della Panoramica ──────────────────────────────────────────────────

export type MonthSummary = {
  ym: string;
  hasEntries: boolean;
  totals: EntryTotals;
  marginCents: number;
  /** Margine del mese prima, solo se quel mese ha movimenti. */
  prevMarginCents: number | null;
};

export function monthSummary(input: OverviewInput): MonthSummary {
  const { from, to } = monthBounds(input.month);
  const inMonth = input.entries.filter((e) => e.date >= from && e.date <= to);
  const totals = totalsOf(inMonth);
  const prev = monthBounds(shiftMonth(input.month, -1));
  const inPrev = input.entries.filter((e) => e.date >= prev.from && e.date <= prev.to);
  const prevTotals = totalsOf(inPrev);
  return {
    ym: input.month,
    hasEntries: inMonth.length > 0,
    totals,
    marginCents: totals.inSettledCents - totals.outSettledCents,
    prevMarginCents:
      inPrev.length > 0 ? prevTotals.inSettledCents - prevTotals.outSettledCents : null,
  };
}

export type MrrSummary = {
  mrrCents: number;
  arrCents: number;
  payingCount: number;
  companiesCount: number;
  arpaCents: number | null;
  annualCount: number;
  monthlyCount: number;
  /** Piani a pagamento senza data di rinnovo: fuori dalla previsione. */
  missingRenewalCount: number;
};

/** Stessa formula dei KPI (`planMonthlyCents`), sulle sole autoscuole clienti. */
export function mrrSummary(input: OverviewInput): MrrSummary {
  const paying = input.plans.filter((p) => p.monthlyCents > 0);
  const mrrCents = sum(paying.map((p) => ({ amountCents: p.monthlyCents })));
  return {
    mrrCents,
    arrCents: mrrCents * 12,
    payingCount: paying.length,
    companiesCount: input.companiesCount,
    arpaCents: paying.length > 0 ? Math.round(mrrCents / paying.length) : null,
    annualCount: paying.filter((p) => p.billingPeriod !== "monthly").length,
    monthlyCount: paying.filter((p) => p.billingPeriod === "monthly").length,
    missingRenewalCount: paying.filter((p) => !p.renewsAt).length,
  };
}

/** Cassa a una data: saldo di partenza + tutto ciò che è stato incassato/pagato da allora. */
export function cashAt(input: OverviewInput, at: string): number | null {
  if (input.openingBalanceCents === null || !input.openingDate) return null;
  let cash = input.openingBalanceCents;
  for (const e of input.entries) {
    if (e.status !== "settled") continue;
    const on = e.settledOn ?? e.date;
    if (on < input.openingDate || on > at) continue;
    cash += e.direction === "in" ? e.amountCents : -e.amountCents;
  }
  return cash;
}

export type CashSummary = {
  balanceCents: number;
  /** Spesa media al mese e da dove viene; null se non c'è niente su cui calcolarla. */
  avgMonthlyOutCents: number | null;
  avgBasis: { kind: "history"; months: number } | { kind: "fixed" } | null;
  runwayMonths: number | null;
};

export function cashSummary(input: OverviewInput): CashSummary | null {
  const balance = cashAt(input, input.today);
  if (balance === null) return null;

  const current = ymOf(input.today);
  const startYm = input.openingDate ? ymOf(input.openingDate) : current;
  const closed: number[] = [];
  for (let i = 1; i <= AVG_SPEND_MONTHS; i++) {
    const ym = shiftMonth(current, -i);
    if (ym < startYm) break;
    const { from, to } = monthBounds(ym);
    closed.push(sum(settledIn(input.entries, from, to).filter((e) => e.direction === "out")));
  }

  let avg: number | null = null;
  let basis: CashSummary["avgBasis"] = null;
  if (closed.length > 0 && closed.some((v) => v > 0)) {
    avg = Math.round(closed.reduce((a, b) => a + b, 0) / closed.length);
    basis = { kind: "history", months: closed.length };
  } else {
    const fixed = input.recurring
      .filter((r) => r.active)
      .reduce((total, r) => total + r.monthlyCents, 0);
    if (fixed > 0) {
      avg = fixed;
      basis = { kind: "fixed" };
    }
  }

  return {
    balanceCents: balance,
    avgMonthlyOutCents: avg,
    avgBasis: basis,
    runwayMonths: avg && balance > 0 ? Math.floor(balance / avg) : null,
  };
}

export type VatSummary = {
  month: { onSalesCents: number; onPurchasesCents: number; toSetAsideCents: number };
  quarter: { firstYm: string; lastYm: string; toSetAsideCents: number };
  /** Spese pagate nel mese senza aliquota registrata: la loro IVA non si scala. */
  outWithoutVatCount: number;
  hasData: boolean;
};

export function vatSummary(input: OverviewInput): VatSummary {
  const { from, to } = monthBounds(input.month);
  const month = settledIn(input.entries, from, to);
  const vatOf = (list: OverviewEntry[], direction: FinanceDirection) =>
    list
      .filter((e) => e.direction === direction)
      .reduce((total, e) => total + vatPortionCents(e.amountCents, e.vatRateBps), 0);
  const q = quarterBounds(input.month);
  const quarter = settledIn(input.entries, q.from, q.to);
  const onSales = vatOf(month, "in");
  const onPurchases = vatOf(month, "out");
  return {
    month: { onSalesCents: onSales, onPurchasesCents: onPurchases, toSetAsideCents: onSales - onPurchases },
    quarter: {
      firstYm: q.firstYm,
      lastYm: q.lastYm,
      toSetAsideCents: vatOf(quarter, "in") - vatOf(quarter, "out"),
    },
    outWithoutVatCount: month.filter((e) => e.direction === "out" && e.vatRateBps === null).length,
    hasData: month.length > 0,
  };
}

/**
 * Il grafico: sei mesi chiusi (il mese in corso è il sesto) e sei di
 * previsione. Nel mese in corso, sopra quanto già incassato/pagato si somma
 * ciò che manca da oggi a fine mese, scadute comprese.
 */
export function chartMonths(input: OverviewInput): ChartMonth[] {
  const current = ymOf(input.today);
  const first = shiftMonth(current, -PAST_MONTHS);
  const last = shiftMonth(current, FUTURE_MONTHS);
  const forecast = [
    ...overdueItems(input).map((i) => ({ ...i, date: input.today })),
    ...forecastBetween(input, input.today, monthBounds(last).to),
  ];
  const todayCash = cashAt(input, input.today);

  const months: ChartMonth[] = [];
  let runningCash = todayCash;
  for (let i = 0; i <= PAST_MONTHS + FUTURE_MONTHS; i++) {
    const ym = shiftMonth(first, i);
    const { from, to } = monthBounds(ym);
    const actual = settledIn(input.entries, from, to);
    const isFuture = ym > current;
    const fc = forecast.filter((f) => f.date >= from && f.date <= to);
    const fcIn = sum(fc.filter((f) => f.direction === "in"));
    const fcOut = sum(fc.filter((f) => f.direction === "out"));

    let cash: number | null = null;
    if (todayCash !== null && input.openingDate && to >= input.openingDate) {
      if (ym < current) cash = cashAt(input, to);
      else if (ym === current) cash = todayCash;
      else {
        runningCash = (runningCash ?? 0) + fcIn - fcOut;
        cash = runningCash;
      }
    }
    // Il mese in corso porta la sua previsione nella cassa del mese dopo.
    if (ym === current && runningCash !== null) runningCash += fcIn - fcOut;

    months.push({
      ym,
      isCurrent: ym === current,
      isFuture,
      beforeStart: Boolean(input.openingDate && to < input.openingDate),
      actualInCents: sum(actual.filter((e) => e.direction === "in")),
      actualOutCents: sum(actual.filter((e) => e.direction === "out")),
      forecastInCents: ym < current ? 0 : fcIn,
      forecastOutCents: ym < current ? 0 : fcOut,
      renewalsInCents: ym < current ? 0 : sum(fc.filter((f) => f.kind === "renewal")),
      cashCents: cash,
    });
  }
  return months;
}

/** Prossimi 90 giorni: prima le scadute, poi in ordine di data. */
export function upcomingItems(input: OverviewInput): ForecastItem[] {
  return [
    ...overdueItems(input),
    ...forecastBetween(input, input.today, addDaysYmd(input.today, UPCOMING_DAYS)),
  ];
}

/** Gli estremi delle date da leggere dal DB per costruire la Panoramica. */
export function overviewWindow(today: string, month: string, openingDate: string | null) {
  const current = ymOf(today);
  const candidates = [
    monthBounds(shiftMonth(current, -PAST_MONTHS)).from,
    monthBounds(shiftMonth(month, -1)).from,
    quarterBounds(month).from,
    ...(openingDate ? [openingDate] : []),
  ];
  const ends = [monthBounds(shiftMonth(current, FUTURE_MONTHS)).to, monthBounds(month).to];
  return {
    from: candidates.sort()[0],
    to: ends.sort()[ends.length - 1],
  };
}
