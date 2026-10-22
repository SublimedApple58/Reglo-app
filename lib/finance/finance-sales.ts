import { lastDayOfMonth, monthBounds, shiftMonth, ymdOf } from "@/lib/finance/finance-math";

/**
 * Vendite e commissioni (REG-413, fase 4). File puro, testato in
 * `tests/unit/finance-sales.test.ts`.
 *
 * Regole di Tiziano:
 * - la commissione matura alla firma (`closedOn`) e si paga il mese dopo
 *   (scadenza: l'ultimo giorno del mese successivo alla firma);
 * - il fisso dei sales è un'uscita di ogni mese, il giorno 1;
 * - compenso del mese = fisso + commissioni dei contratti firmati nel mese.
 * Un pagamento vero è sempre un movimento (`FinanceEntry` legato al sales o
 * al contratto): finché non c'è, fisso e commissioni sono uscite previste.
 */

export type SalesAgentLite = {
  id: string;
  name: string;
  monthlyFixedCents: number;
  defaultCommissionBps: number;
  archived: boolean;
};

export type SalesDealLite = {
  id: string;
  agentId: string;
  agentName: string;
  companyId: string | null;
  companyName: string;
  closedOn: string;
  contractValueCents: number;
  commissionBps: number;
  commissionCents: number;
  paidOn: string | null;
};

/** Un fisso pagato: `month` è il mese a cui si riferisce. */
export type FixedPayment = {
  entryId: string;
  agentId: string;
  month: string;
  amountCents: number;
  paidOn: string;
};

export const commissionCentsOf = (valueCents: number, bps: number) =>
  Math.round((valueCents * bps) / 10000);

/** Scadenza della commissione: fine del mese dopo la firma. */
export function commissionDueOn(closedOn: string) {
  const [y, m] = shiftMonth(closedOn.slice(0, 7), 1).split("-").map(Number);
  return ymdOf(y, m - 1, lastDayOfMonth(y, m - 1));
}

/** «12,5%» da punti base. */
export const percentLabel = (bps: number) =>
  `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(bps / 100)}%`;

export type SalesMonthRow = {
  agent: SalesAgentLite;
  dealsCount: number;
  valueCents: number;
  commissionCents: number;
  /** Fisso del mese: quello pagato se c'è, altrimenti quello atteso; null nei mesi chiusi senza pagamento. */
  fixedCents: number | null;
  fixedPaid: FixedPayment | null;
  compensationCents: number;
};

export type SalesMonthSummary = {
  month: string;
  rows: SalesMonthRow[];
  deals: SalesDealLite[];
  totals: {
    dealsCount: number;
    valueCents: number;
    commissionCents: number;
    fixedCents: number;
    compensationCents: number;
  };
};

/**
 * Riepilogo per sales di un mese. Nelle righe: i sales attivi, più quelli
 * archiviati che nel mese hanno firmato o sono stati pagati. Nei mesi già
 * chiusi il fisso conta solo se è stato pagato davvero (solo dati veri);
 * nel mese in corso e nei futuri vale quello atteso.
 */
export function salesMonthSummary({
  month,
  today,
  agents,
  deals,
  fixedPayments,
}: {
  month: string;
  today: string;
  agents: SalesAgentLite[];
  deals: SalesDealLite[];
  fixedPayments: FixedPayment[];
}): SalesMonthSummary {
  const { from, to } = monthBounds(month);
  const inMonth = deals
    .filter((d) => d.closedOn >= from && d.closedOn <= to)
    .sort((a, b) => a.closedOn.localeCompare(b.closedOn) || a.companyName.localeCompare(b.companyName, "it"));
  const closedMonth = month < today.slice(0, 7);

  const rows: SalesMonthRow[] = [];
  for (const agent of agents) {
    const own = inMonth.filter((d) => d.agentId === agent.id);
    const paid = fixedPayments.find((p) => p.agentId === agent.id && p.month === month) ?? null;
    if (agent.archived && own.length === 0 && !paid) continue;
    const expected = agent.archived || closedMonth ? null : agent.monthlyFixedCents || null;
    const fixedCents = paid ? paid.amountCents : expected;
    const commissionCents = own.reduce((t, d) => t + d.commissionCents, 0);
    rows.push({
      agent,
      dealsCount: own.length,
      valueCents: own.reduce((t, d) => t + d.contractValueCents, 0),
      commissionCents,
      fixedCents,
      fixedPaid: paid,
      compensationCents: (fixedCents ?? 0) + commissionCents,
    });
  }
  rows.sort(
    (a, b) =>
      b.compensationCents - a.compensationCents || a.agent.name.localeCompare(b.agent.name, "it"),
  );

  const sum = (pick: (r: SalesMonthRow) => number) => rows.reduce((t, r) => t + pick(r), 0);
  return {
    month,
    rows,
    deals: inMonth,
    totals: {
      dealsCount: sum((r) => r.dealsCount),
      valueCents: sum((r) => r.valueCents),
      commissionCents: sum((r) => r.commissionCents),
      fixedCents: sum((r) => r.fixedCents ?? 0),
      compensationCents: sum((r) => r.compensationCents),
    },
  };
}

export type SalesForecastItem = {
  key: string;
  date: string;
  amountCents: number;
  kind: "commission" | "salary";
  title: string;
  sub: string;
  overdue: boolean;
};

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];
const monthWord = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

const namesList = (names: string[]) =>
  names.length <= 3 ? names.join(" · ") : `${names.slice(0, 2).join(" · ")} e altri ${names.length - 2}`;

/**
 * Commissioni non ancora pagate, una voce per mese di firma, alla scadenza
 * (fine del mese dopo). Comprese le scadute, ovunque cadano: chi le chiede
 * filtra per data.
 */
export function commissionItems(deals: SalesDealLite[], today: string): SalesForecastItem[] {
  const byMonth = new Map<string, SalesDealLite[]>();
  for (const d of deals) {
    if (d.paidOn || d.commissionCents <= 0) continue;
    const ym = d.closedOn.slice(0, 7);
    byMonth.set(ym, [...(byMonth.get(ym) ?? []), d]);
  }
  return [...byMonth.entries()].map(([ym, list]) => {
    const due = commissionDueOn(`${ym}-01`);
    const agents = [...new Set(list.map((d) => d.agentName))];
    return {
      key: `com-${ym}`,
      date: due,
      amountCents: list.reduce((t, d) => t + d.commissionCents, 0),
      kind: "commission" as const,
      title: `Commissioni di ${monthWord(ym)}`,
      sub: `${list.length} ${list.length === 1 ? "contratto" : "contratti"} · ${namesList(agents)}`,
      overdue: due < today,
    };
  });
}

/**
 * Fissi dei sales attivi tra `from` e `to`, il giorno 1 di ogni mese, una
 * voce per mese con chi non è ancora stato pagato. Come le spese fisse, la
 * previsione guarda avanti: un fisso passato non pagato non diventa «scaduto».
 */
export function salaryItems(
  agents: SalesAgentLite[],
  fixedPayments: FixedPayment[],
  from: string,
  to: string,
): SalesForecastItem[] {
  const active = agents.filter((a) => !a.archived && a.monthlyFixedCents > 0);
  if (active.length === 0) return [];
  const paid = new Set(fixedPayments.map((p) => `${p.agentId}|${p.month}`));
  const items: SalesForecastItem[] = [];
  for (let ym = from.slice(0, 7); `${ym}-01` <= to; ym = shiftMonth(ym, 1)) {
    const date = `${ym}-01`;
    if (date < from) continue;
    const due = active.filter((a) => !paid.has(`${a.id}|${ym}`));
    if (due.length === 0) continue;
    items.push({
      key: `sal-${ym}`,
      date,
      amountCents: due.reduce((t, a) => t + a.monthlyFixedCents, 0),
      kind: "salary",
      title: due.length === 1 ? `Fisso di ${due[0].name}` : "Fissi dei sales",
      sub: due.length === 1 ? `sales · ${monthWord(ym)}` : namesList(due.map((a) => a.name)),
      overdue: false,
    });
  }
  return items;
}
