import {
  cashSummary,
  chartMonths,
  forecastBetween,
  monthSummary,
  mrrSummary,
  overviewWindow,
  planRenewalsBetween,
  upcomingItems,
  vatSummary,
  type OverviewEntry,
  type OverviewInput,
} from "@/lib/finance/finance-overview";

const entry = (over: Partial<OverviewEntry>): OverviewEntry => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-10-10",
  description: "x",
  categoryName: "Cat",
  direction: "in",
  amountCents: 12200,
  vatRateBps: 2200,
  status: "settled",
  settledOn: null,
  companyId: null,
  companyName: null,
  invoiceNumber: null,
  recurringExpenseId: null,
  ...over,
});

const base = (over: Partial<OverviewInput> = {}): OverviewInput => ({
  today: "2026-10-22",
  month: "2026-10",
  entries: [],
  recurring: [],
  plans: [],
  companiesCount: 5,
  openingBalanceCents: null,
  openingDate: null,
  ...over,
});

describe("finance overview (REG-413)", () => {
  it("rinnovi: annuale dall'anniversario, mensile ogni mese, mai prima della data registrata", () => {
    expect(planRenewalsBetween({ renewsAt: "2025-11-15", billingPeriod: "annual" }, "2026-10-22", "2027-04-30")).toEqual([
      "2026-11-15",
    ]);
    expect(planRenewalsBetween({ renewsAt: "2026-12-31", billingPeriod: "monthly" }, "2026-10-01", "2027-03-31")).toEqual([
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    expect(planRenewalsBetween({ renewsAt: null, billingPeriod: "annual" }, "2026-01-01", "2030-01-01")).toEqual([]);
  });

  it("un rinnovo non si conta se nel mese c'è già un'entrata di quell'autoscuola", () => {
    const plan = {
      companyId: "c1",
      companyName: "Autoscuola Uno",
      billingPeriod: "annual",
      renewsAt: "2026-11-15",
      periodCents: 120000,
      monthlyCents: 10000,
    };
    const without = forecastBetween(base({ plans: [plan] }), "2026-10-22", "2027-04-30");
    expect(without.filter((i) => i.kind === "renewal")).toHaveLength(1);
    const withEntry = forecastBetween(
      base({ plans: [plan], entries: [entry({ companyId: "c1", date: "2026-11-03", status: "due" })] }),
      "2026-10-22",
      "2027-04-30",
    );
    expect(withEntry.filter((i) => i.kind === "renewal")).toHaveLength(0);
  });

  it("le scadenze già pagate delle spese fisse non tornano in previsione", () => {
    const recurring = [
      {
        id: "r1",
        name: "Vercel",
        categoryName: "Software",
        categoryGroup: "software",
        archived: false,
        active: true,
        monthlyCents: 2000,
        amountCents: 2000,
        cadence: "monthly" as const,
        startsOn: "2026-10-05",
        endsOn: null,
        dayOfMonth: 5,
      },
    ];
    const items = forecastBetween(
      base({
        recurring,
        entries: [entry({ direction: "out", date: "2026-11-05", recurringExpenseId: "r1" })],
      }),
      "2026-10-22",
      "2026-12-31",
    );
    expect(items.map((i) => i.date)).toEqual(["2026-12-05"]);
  });

  it("margine = incassato − pagato; il da incassare resta fuori", () => {
    const s = monthSummary(
      base({
        entries: [
          entry({ amountCents: 100000 }),
          entry({ amountCents: 50000, status: "due" }),
          entry({ direction: "out", amountCents: 30000 }),
          entry({ date: "2026-09-10", amountCents: 10000 }),
        ],
      }),
    );
    expect(s.marginCents).toBe(70000);
    expect(s.totals.inDueCents).toBe(50000);
    expect(s.prevMarginCents).toBe(10000);
    expect(monthSummary(base()).hasEntries).toBe(false);
    expect(monthSummary(base()).prevMarginCents).toBeNull();
  });

  it("MRR, ARR e ARPA con la formula dei KPI", () => {
    const m = mrrSummary(
      base({
        plans: [
          { companyId: "a", companyName: "A", billingPeriod: "annual", renewsAt: null, periodCents: 120000, monthlyCents: 10000 },
          { companyId: "b", companyName: "B", billingPeriod: "monthly", renewsAt: "2026-11-01", periodCents: 5000, monthlyCents: 5000 },
          { companyId: "c", companyName: "C", billingPeriod: "annual", renewsAt: null, periodCents: 0, monthlyCents: 0 },
        ],
      }),
    );
    expect(m).toMatchObject({
      mrrCents: 15000,
      arrCents: 180000,
      payingCount: 2,
      arpaCents: 7500,
      annualCount: 1,
      monthlyCount: 1,
      missingRenewalCount: 1,
    });
  });

  it("cassa: nulla senza saldo; dal saldo conta solo ciò che è saldato dopo la partenza", () => {
    expect(cashSummary(base())).toBeNull();
    const input = base({
      openingBalanceCents: 1_000_000,
      openingDate: "2026-10-01",
      entries: [
        entry({ amountCents: 200000, settledOn: "2026-10-05" }),
        entry({ direction: "out", amountCents: 50000, settledOn: "2026-10-06" }),
        entry({ amountCents: 999999, date: "2026-09-20", settledOn: "2026-09-20" }),
        entry({ amountCents: 777, status: "due" }),
      ],
    });
    const cash = cashSummary(input)!;
    expect(cash.balanceCents).toBe(1_150_000);
    // Nessun mese chiuso dopo la partenza e nessuna spesa fissa: autonomia ignota.
    expect(cash.avgBasis).toBeNull();
    expect(cash.runwayMonths).toBeNull();
  });

  it("autonomia sulla spesa media dei mesi chiusi", () => {
    const cash = cashSummary(
      base({
        today: "2027-01-15",
        month: "2027-01",
        openingBalanceCents: 900000,
        openingDate: "2026-10-01",
        entries: [
          entry({ direction: "out", date: "2026-12-05", amountCents: 300000, settledOn: "2026-12-05" }),
          entry({ direction: "out", date: "2026-11-05", amountCents: 300000, settledOn: "2026-11-05" }),
        ],
      }),
    )!;
    expect(cash.balanceCents).toBe(300000);
    expect(cash.avgBasis).toEqual({ kind: "history", months: 3 });
    expect(cash.avgMonthlyOutCents).toBe(200000);
    expect(cash.runwayMonths).toBe(1);
  });

  it("IVA: scorporo dagli incassi meno quella sulle spese, nel mese e nel trimestre", () => {
    const v = vatSummary(
      base({
        entries: [
          entry({ amountCents: 122000 }),
          entry({ direction: "out", amountCents: 12200 }),
          entry({ direction: "out", amountCents: 5000, vatRateBps: null }),
          entry({ amountCents: 999999, status: "due" }),
          entry({ date: "2026-11-02", amountCents: 12200 }),
        ],
      }),
    );
    expect(v.month).toEqual({ onSalesCents: 22000, onPurchasesCents: 2200, toSetAsideCents: 19800 });
    expect(v.quarter.toSetAsideCents).toBe(19800 + 2200);
    expect(v.outWithoutVatCount).toBe(1);
  });

  it("grafico: 12 mesi, mese in corso col previsto sopra e scadute dentro", () => {
    const months = chartMonths(
      base({
        openingBalanceCents: 100000,
        openingDate: "2026-10-01",
        entries: [
          entry({ amountCents: 50000, settledOn: "2026-10-10" }),
          entry({ amountCents: 20000, status: "due", date: "2026-10-01" }),
        ],
        plans: [
          { companyId: "a", companyName: "A", billingPeriod: "annual", renewsAt: "2027-02-10", periodCents: 120000, monthlyCents: 10000 },
        ],
      }),
    );
    expect(months).toHaveLength(12);
    expect(months[0].ym).toBe("2026-05");
    expect(months[0].beforeStart).toBe(true);
    expect(months[0].cashCents).toBeNull();
    const oct = months[5];
    expect(oct.isCurrent).toBe(true);
    expect(oct.actualInCents).toBe(50000);
    expect(oct.forecastInCents).toBe(20000);
    expect(oct.cashCents).toBe(150000);
    const feb = months.find((m) => m.ym === "2027-02")!;
    expect(feb.renewalsInCents).toBe(120000);
    expect(feb.cashCents).toBe(150000 + 20000 + 120000);
    expect(months[11].ym).toBe("2027-04");
  });

  it("in arrivo: prima le scadute, poi per data", () => {
    const items = upcomingItems(
      base({
        entries: [
          entry({ status: "due", date: "2026-11-02", description: "dopo" }),
          entry({ status: "due", date: "2026-10-01", description: "scaduta" }),
        ],
      }),
    );
    expect(items.map((i) => [i.title, i.overdue])).toEqual([
      ["scaduta", true],
      ["dopo", false],
    ]);
  });

  it("finestra di lettura copre grafico, mese scelto, trimestre e partenza", () => {
    expect(overviewWindow("2026-10-22", "2026-10", "2026-10-01")).toEqual({ from: "2026-05-01", to: "2027-04-30" });
    expect(overviewWindow("2026-10-22", "2025-02", null)).toEqual({ from: "2025-01-01", to: "2027-04-30" });
  });
});
