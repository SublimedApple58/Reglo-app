import { forecastBetween, overdueItems, cashSummary, type OverviewInput } from "@/lib/finance/finance-overview";
import {
  commissionCentsOf,
  commissionDueOn,
  commissionItems,
  salaryItems,
  salesMonthSummary,
  type SalesAgentLite,
  type SalesDealLite,
} from "@/lib/finance/finance-sales";

const agent = (over: Partial<SalesAgentLite>): SalesAgentLite => ({
  id: "a1",
  name: "Gabriele",
  monthlyFixedCents: 70000,
  defaultCommissionBps: 1250,
  archived: false,
  ...over,
});

const deal = (over: Partial<SalesDealLite>): SalesDealLite => ({
  id: Math.random().toString(36).slice(2),
  agentId: "a1",
  agentName: "Gabriele",
  companyId: "c1",
  companyName: "Autoscuola Uno",
  closedOn: "2026-10-12",
  contractValueCents: 156000,
  commissionBps: 1250,
  commissionCents: 19500,
  paidOn: null,
  ...over,
});

describe("vendite e commissioni (REG-413)", () => {
  it("commissione: percentuale sul valore, scadenza a fine del mese dopo la firma", () => {
    expect(commissionCentsOf(156000, 1250)).toBe(19500);
    expect(commissionCentsOf(99999, 333)).toBe(3330);
    expect(commissionDueOn("2026-10-12")).toBe("2026-11-30");
    expect(commissionDueOn("2026-12-31")).toBe("2027-01-31");
    expect(commissionDueOn("2027-01-05")).toBe("2027-02-28");
  });

  it("commissioni da pagare: una voce per mese di firma, le pagate fuori, le vecchie scadute", () => {
    const items = commissionItems(
      [
        deal({ closedOn: "2026-10-03" }),
        deal({ closedOn: "2026-10-20", agentId: "a2", agentName: "Daniel", commissionCents: 10000 }),
        deal({ closedOn: "2026-10-21", paidOn: "2026-11-10" }),
        deal({ closedOn: "2026-08-30" }),
      ],
      "2026-10-22",
    );
    expect(items).toHaveLength(2);
    const oct = items.find((i) => i.key === "com-2026-10")!;
    expect(oct).toMatchObject({ date: "2026-11-30", amountCents: 29500, overdue: false });
    expect(oct.sub).toBe("2 contratti · Gabriele · Daniel");
    expect(items.find((i) => i.key === "com-2026-08")).toMatchObject({ date: "2026-09-30", overdue: true });
  });

  it("fissi: il giorno 1 di ogni mese, senza chi è già pagato o archiviato", () => {
    const agents = [agent({}), agent({ id: "a2", name: "Daniel" }), agent({ id: "a3", name: "Aurora", archived: true })];
    const items = salaryItems(
      agents,
      [{ entryId: "e1", agentId: "a1", month: "2026-11", amountCents: 70000, paidOn: "2026-11-01" }],
      "2026-10-22",
      "2026-12-31",
    );
    expect(items.map((i) => [i.date, i.amountCents, i.title])).toEqual([
      ["2026-11-01", 70000, "Fisso di Daniel"],
      ["2026-12-01", 140000, "Fissi dei sales"],
    ]);
  });

  it("riepilogo del mese: compenso = fisso + commissioni; nei mesi chiusi solo il fisso pagato", () => {
    const agents = [agent({}), agent({ id: "a2", name: "Daniel" }), agent({ id: "a3", name: "Aurora", archived: true })];
    const deals = [
      deal({}),
      deal({ closedOn: "2026-10-15", contractValueCents: 156000, commissionCents: 19500 }),
      deal({ agentId: "a2", agentName: "Daniel", closedOn: "2026-09-02" }),
    ];
    const oct = salesMonthSummary({ month: "2026-10", today: "2026-10-22", agents, deals, fixedPayments: [] });
    expect(oct.rows.map((r) => [r.agent.name, r.dealsCount, r.commissionCents, r.fixedCents, r.compensationCents])).toEqual([
      ["Gabriele", 2, 39000, 70000, 109000],
      ["Daniel", 0, 0, 70000, 70000],
    ]);
    expect(oct.totals).toEqual({
      dealsCount: 2,
      valueCents: 312000,
      commissionCents: 39000,
      fixedCents: 140000,
      compensationCents: 179000,
    });

    const sep = salesMonthSummary({
      month: "2026-09",
      today: "2026-10-22",
      agents,
      deals,
      fixedPayments: [{ entryId: "e", agentId: "a3", month: "2026-09", amountCents: 50000, paidOn: "2026-09-01" }],
    });
    expect(sep.rows.map((r) => [r.agent.name, r.fixedCents, r.compensationCents])).toEqual([
      ["Aurora", 50000, 50000],
      ["Daniel", null, 19500],
      ["Gabriele", null, 0],
    ]);
  });

  it("Panoramica: fissi e commissioni tra le uscite previste, le commissioni scadute in testa", () => {
    const input: OverviewInput = {
      today: "2026-10-22",
      month: "2026-10",
      entries: [],
      recurring: [],
      plans: [],
      companiesCount: 1,
      openingBalanceCents: 1000000,
      openingDate: "2026-10-01",
      agents: [agent({})],
      deals: [deal({ closedOn: "2026-10-05" }), deal({ closedOn: "2026-08-05", commissionCents: 5000 })],
      fixedPayments: [],
    };
    const fc = forecastBetween(input, "2026-10-22", "2026-12-31");
    expect(fc.map((i) => [i.kind, i.date, i.amountCents])).toEqual([
      ["salary", "2026-11-01", 70000],
      ["commission", "2026-11-30", 19500],
      ["salary", "2026-12-01", 70000],
    ]);
    expect(overdueItems(input).map((i) => [i.kind, i.date, i.overdue])).toEqual([["commission", "2026-09-30", true]]);
    // Nessun mese chiuso: l'autonomia si stima sui fissi, sales compresi.
    expect(cashSummary(input)?.avgMonthlyOutCents).toBe(70000);
  });
});
