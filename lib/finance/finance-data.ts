import { prisma } from "@/db/prisma";
import { companyKindOf, isExcludedFromKpis, isSeedDemo } from "@/lib/backoffice/kpi-math";
import {
  dbDateToYmd,
  isRecurringActive,
  monthlyEquivalentCents,
  nextOccurrence,
  todayYmdRome,
  ymdToDbDate,
  type FinanceDirection,
  type FinanceStatus,
  type RecurringCadence,
} from "@/lib/finance/finance-math";

// ───────────────────────────────────────────────────────────────────────────
// Letture della sezione Finanza (REG-413). Modulo NON "use server": nessuna
// guardia qui dentro, la mette chi lo chiama (`lib/actions/finance.actions.ts`
// e le pagine sotto `/backoffice`, protette dal layout).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Le autoscuole che contano nei conti di Reglo: solo clienti veri.
 * Fuori le autoscuole interne di prova (`excludeFromKpis`), quelle seminate per
 * le demo (`seedDemo`, che nei KPI gonfiano l'MRR con piani finti) e le
 * consorziate (non hanno comprato Reglo: decisione di Tiziano).
 */
export async function listFinanceCompanies() {
  const services = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE" },
    select: { companyId: true, limits: true, company: { select: { id: true, name: true } } },
  });
  return services
    .filter(
      (s) =>
        !isExcludedFromKpis(s.limits) &&
        !isSeedDemo(s.limits) &&
        companyKindOf(s.limits) !== "consorziata",
    )
    .map((s) => ({ id: s.company.id, name: s.company.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export async function listFinanceCategories() {
  const rows = await prisma.financeCategory.findMany({
    orderBy: [{ direction: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    direction: c.direction as FinanceDirection,
    group: c.group,
    archived: c.archivedAt !== null,
  }));
}

export type FinanceEntryRow = {
  id: string;
  date: string;
  description: string;
  categoryId: string;
  categoryName: string;
  direction: FinanceDirection;
  nature: "recurring" | "one_off";
  amountCents: number;
  vatRateBps: number | null;
  status: FinanceStatus;
  settledOn: string | null;
  companyId: string | null;
  companyName: string | null;
  invoiceNumber: string | null;
  recurringExpenseId: string | null;
  recurringExpenseName: string | null;
  notes: string | null;
};

export async function listFinanceEntries({ from, to }: { from: string; to: string }) {
  const rows = await prisma.financeEntry.findMany({
    where: { date: { gte: ymdToDbDate(from), lte: ymdToDbDate(to) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      category: { select: { name: true } },
      company: { select: { name: true } },
      recurringExpense: { select: { name: true } },
    },
  });
  return rows.map(
    (e): FinanceEntryRow => ({
      id: e.id,
      date: dbDateToYmd(e.date),
      description: e.description,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      direction: e.direction as FinanceDirection,
      nature: e.nature as "recurring" | "one_off",
      amountCents: e.amountCents,
      vatRateBps: e.vatRateBps,
      status: e.status as FinanceStatus,
      settledOn: e.settledOn ? dbDateToYmd(e.settledOn) : null,
      companyId: e.companyId,
      companyName: e.company?.name ?? null,
      invoiceNumber: e.invoiceNumber,
      recurringExpenseId: e.recurringExpenseId,
      recurringExpenseName: e.recurringExpense?.name ?? null,
      notes: e.notes,
    }),
  );
}

export type RecurringExpenseRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryGroup: string | null;
  amountCents: number;
  vatRateBps: number | null;
  cadence: RecurringCadence;
  startsOn: string;
  endsOn: string | null;
  dayOfMonth: number;
  notes: string | null;
  archived: boolean;
  active: boolean;
  monthlyCents: number;
  nextOn: string | null;
  lastPaidOn: string | null;
  paymentsCount: number;
};

export async function listRecurringExpenses() {
  const today = todayYmdRome();
  const rows = await prisma.recurringExpense.findMany({
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    include: {
      category: { select: { name: true, group: true } },
      entries: {
        where: { status: "settled" },
        select: { date: true },
        orderBy: { date: "desc" },
      },
    },
  });
  return rows.map((r): RecurringExpenseRow => {
    const shape = {
      amountCents: r.amountCents,
      cadence: r.cadence as RecurringCadence,
      startsOn: dbDateToYmd(r.startsOn),
      endsOn: r.endsOn ? dbDateToYmd(r.endsOn) : null,
      dayOfMonth: r.dayOfMonth,
    };
    const archived = r.archivedAt !== null;
    const lastPaidOn = r.entries[0] ? dbDateToYmd(r.entries[0].date) : null;
    // La prossima scadenza è la prima non ancora pagata: se l'ultima registrata
    // è già quella di questo periodo, si guarda oltre.
    const nextFrom = lastPaidOn && lastPaidOn >= today ? lastPaidOn : today;
    let nextOn = archived ? null : nextOccurrence(shape, nextFrom);
    if (nextOn && lastPaidOn && nextOn === lastPaidOn) {
      const [y, m, d] = nextOn.split("-").map(Number);
      nextOn = nextOccurrence(shape, new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10));
    }
    return {
      id: r.id,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      categoryGroup: r.category.group,
      ...shape,
      vatRateBps: r.vatRateBps,
      notes: r.notes,
      archived,
      active: !archived && isRecurringActive(shape, today),
      monthlyCents: monthlyEquivalentCents(r.amountCents, shape.cadence),
      nextOn,
      lastPaidOn,
      paymentsCount: r.entries.length,
    };
  });
}
