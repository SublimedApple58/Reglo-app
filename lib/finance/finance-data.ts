import { prisma } from "@/db/prisma";
import {
  companyKindOf,
  isDoneStatus,
  isExcludedFromKpis,
  isSeedDemo,
  planMonthlyCents,
} from "@/lib/backoffice/kpi-math";
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
import type { FixedPayment, SalesAgentLite, SalesDealLite } from "@/lib/finance/finance-sales";

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
  /** Pagamento di un fisso o di una commissione (si gestisce da Vendite). */
  salesAgentId: string | null;
  salesDealId: string | null;
  notes: string | null;
};

export async function listFinanceEntries({
  from,
  to,
  openOnly = false,
}: {
  from: string;
  to: string;
  openOnly?: boolean;
}) {
  const rows = await prisma.financeEntry.findMany({
    where: {
      date: { gte: ymdToDbDate(from), lte: ymdToDbDate(to) },
      ...(openOnly ? { status: { not: "settled" } } : {}),
    },
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
      salesAgentId: e.salesAgentId,
      salesDealId: e.salesDealId,
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

export async function getFinanceSettings() {
  const row = await prisma.financeSettings.findUnique({ where: { id: "default" } });
  return {
    openingBalanceCents: row?.openingBalanceCents ?? null,
    openingDate: row?.openingDate ? dbDateToYmd(row.openingDate) : null,
  };
}

/**
 * Piani delle autoscuole clienti (stessa formula dei KPI, `planMonthlyCents`,
 * ma senza demo, test e consorziate). Il canone di ogni rinnovo è il mese o
 * l'anno intero, IVA inclusa (decisione di Tiziano: i prezzi sono IVA inclusa).
 */
export async function listFinancePlans(companyIds: string[]) {
  if (companyIds.length === 0) return [];
  const plans = await prisma.companyPlan.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      companyId: true,
      billingPeriod: true,
      renewsAt: true,
      instructorSeats: true,
      instructorSeatPriceCents: true,
      voiceEnabled: true,
      voicePriceCents: true,
      company: { select: { name: true } },
    },
  });
  return plans.map((p) => ({
    companyId: p.companyId,
    companyName: p.company.name,
    billingPeriod: p.billingPeriod,
    renewsAt: p.renewsAt ? ymdRomeOf(p.renewsAt) : null,
    periodCents:
      p.instructorSeats * p.instructorSeatPriceCents + (p.voiceEnabled ? p.voicePriceCents : 0),
    monthlyCents: planMonthlyCents(p),
  }));
}

/** `renewsAt` è un timestamp: il giorno è quello di Roma. */
const ymdRomeOf = (date: Date) => todayYmdRome(date);

/**
 * Movimenti per la Panoramica: tutti quelli della finestra, più quelli ancora
 * da saldare con la data già passata (scaduti, anche se vecchi).
 */
export async function listOverviewEntries({ from, to }: { from: string; to: string }) {
  const [inWindow, olderOpen] = await Promise.all([
    listFinanceEntries({ from, to }),
    listFinanceEntries({ from: "2000-01-01", to: addDays(from, -1), openOnly: true }),
  ]);
  return [...inWindow, ...olderOpen];
}

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// ── Autoscuole (fase 3) ─────────────────────────────────────────────────────

export type CommercialStatus = "active" | "paused" | "churned";

export type FinanceSchoolRow = {
  id: string;
  name: string;
  registeredOn: string;
  serviceActive: boolean;
  /** null = anagrafica commerciale mai compilata («da completare»). */
  commercial: {
    status: CommercialStatus;
    vatNumber: string | null;
    region: string | null;
    acquiredOn: string | null;
    churnedOn: string | null;
    agentId: string | null;
    agentName: string | null;
    notes: string | null;
  } | null;
  plan: {
    billingPeriod: "monthly" | "annual";
    annualCents: number;
    renewsAt: string | null;
  } | null;
  instructors: number;
  students: number;
  activeStudentsMonth: number;
  lessonsMonth: number;
  lessonsTotal: number;
};

/** Mezzanotte di Roma del giorno `ymd`, come istante UTC. */
function romeMidnight(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT+2"
  const hours = Number(offset?.replace("GMT", "") || 0);
  return new Date(guess.getTime() - hours * 3_600_000);
}

/**
 * L'anagrafica commerciale delle autoscuole clienti (fuori demo, test e
 * consorziate), con i numeri d'uso contati con le regole dei KPI:
 * - istruttori: quelli che possono stare in agenda (attivi, con utente e ruolo
 *   istruttore), come la saturazione dei KPI;
 * - allievi: iscritti con ruolo allievo; «attivi» = con almeno una guida fatta
 *   nel mese;
 * - guide: svolte (`isDoneStatus`), per data della guida.
 */
export async function listFinanceSchools({ from, to }: { from: string; to: string }) {
  const companies = await listFinanceCompanies();
  const ids = companies.map((c) => c.id);
  if (ids.length === 0) return [];
  const monthRange = { gte: romeMidnight(from), lt: romeMidnight(addDays(to, 1)) };

  const [rows, instructors, students, lessonsAll, lessonsMonth] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        createdAt: true,
        services: { where: { serviceKey: "AUTOSCUOLE" }, select: { status: true } },
        commercial: { include: { agent: { select: { name: true } } } },
        plan: true,
      },
    }),
    prisma.autoscuolaInstructor.findMany({
      where: {
        companyId: { in: ids },
        status: { not: "inactive" },
        userId: { not: null },
        user: {
          companyMembers: {
            some: { autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
          },
        },
      },
      select: { companyId: true },
    }),
    prisma.companyMember.groupBy({
      by: ["companyId"],
      where: { companyId: { in: ids }, autoscuolaRole: "STUDENT" },
      _count: { _all: true },
    }),
    prisma.autoscuolaAppointment.groupBy({
      by: ["companyId", "status"],
      where: { companyId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.autoscuolaAppointment.groupBy({
      by: ["companyId", "status", "studentId"],
      where: { companyId: { in: ids }, startsAt: monthRange },
      _count: { _all: true },
    }),
  ]);

  const tally = <K extends string>(list: Array<K>) => {
    const map = new Map<K, number>();
    for (const key of list) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  };
  const instructorsBy = tally(instructors.map((i) => i.companyId));
  const studentsBy = new Map(students.map((s) => [s.companyId, s._count._all]));
  const totalBy = new Map<string, number>();
  for (const g of lessonsAll) {
    if (!isDoneStatus((g.status ?? "").toLowerCase())) continue;
    totalBy.set(g.companyId, (totalBy.get(g.companyId) ?? 0) + g._count._all);
  }
  const monthBy = new Map<string, number>();
  const activeBy = new Map<string, Set<string>>();
  for (const g of lessonsMonth) {
    if (!isDoneStatus((g.status ?? "").toLowerCase())) continue;
    monthBy.set(g.companyId, (monthBy.get(g.companyId) ?? 0) + g._count._all);
    if (g.studentId) {
      const set = activeBy.get(g.companyId) ?? new Set<string>();
      set.add(g.studentId);
      activeBy.set(g.companyId, set);
    }
  }

  return rows
    .map((c): FinanceSchoolRow => {
      const plan = c.plan;
      const periodCents = plan
        ? plan.instructorSeats * plan.instructorSeatPriceCents + (plan.voiceEnabled ? plan.voicePriceCents : 0)
        : 0;
      return {
        id: c.id,
        name: c.name,
        registeredOn: todayYmdRome(c.createdAt),
        serviceActive: c.services[0]?.status === "ACTIVE",
        commercial: c.commercial
          ? {
              status: c.commercial.status as CommercialStatus,
              vatNumber: c.commercial.vatNumber,
              region: c.commercial.region,
              acquiredOn: c.commercial.acquiredOn ? dbDateToYmd(c.commercial.acquiredOn) : null,
              churnedOn: c.commercial.churnedOn ? dbDateToYmd(c.commercial.churnedOn) : null,
              agentId: c.commercial.agentId,
              agentName: c.commercial.agent?.name ?? null,
              notes: c.commercial.notes,
            }
          : null,
        plan: plan
          ? {
              billingPeriod: plan.billingPeriod === "monthly" ? "monthly" : "annual",
              annualCents: plan.billingPeriod === "monthly" ? periodCents * 12 : periodCents,
              renewsAt: plan.renewsAt ? todayYmdRome(plan.renewsAt) : null,
            }
          : null,
        instructors: instructorsBy.get(c.id) ?? 0,
        students: studentsBy.get(c.id) ?? 0,
        activeStudentsMonth: activeBy.get(c.id)?.size ?? 0,
        lessonsMonth: monthBy.get(c.id) ?? 0,
        lessonsTotal: totalBy.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

// ── Vendite (fase 4) ────────────────────────────────────────────────────────

export type SalesAgentRow = SalesAgentLite & {
  email: string | null;
  dealsCount: number;
};

export async function listSalesAgents(): Promise<SalesAgentRow[]> {
  const rows = await prisma.salesAgent.findMany({
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    include: { _count: { select: { deals: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    monthlyFixedCents: a.monthlyFixedCents,
    defaultCommissionBps: a.defaultCommissionBps,
    archived: a.archivedAt !== null,
    dealsCount: a._count.deals,
  }));
}

export type SalesDealRow = SalesDealLite & { notes: string | null };

/** Tutti i contratti (pochi: uno per autoscuola acquisita), dal più recente. */
export async function listSalesDeals(): Promise<SalesDealRow[]> {
  const rows = await prisma.salesDeal.findMany({
    orderBy: [{ closedOn: "desc" }, { createdAt: "desc" }],
    include: { agent: { select: { name: true } } },
  });
  return rows.map((d) => ({
    id: d.id,
    agentId: d.agentId,
    agentName: d.agent.name,
    companyId: d.companyId,
    companyName: d.companyName,
    closedOn: dbDateToYmd(d.closedOn),
    contractValueCents: d.contractValueCents,
    commissionBps: d.commissionBps,
    commissionCents: d.commissionCents,
    paidOn: d.paidOn ? dbDateToYmd(d.paidOn) : null,
    notes: d.notes,
  }));
}

/** I fissi pagati: movimenti legati a un sales, `date` = 1° del mese di riferimento. */
export async function listFixedPayments(): Promise<FixedPayment[]> {
  const rows = await prisma.financeEntry.findMany({
    where: { salesAgentId: { not: null } },
    select: { id: true, salesAgentId: true, date: true, settledOn: true, amountCents: true },
  });
  return rows.map((e) => ({
    entryId: e.id,
    agentId: e.salesAgentId as string,
    month: dbDateToYmd(e.date).slice(0, 7),
    amountCents: e.amountCents,
    paidOn: dbDateToYmd(e.settledOn ?? e.date),
  }));
}
