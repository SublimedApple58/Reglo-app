import { asInvestorPeriod, projectInvestorKpis } from "@/lib/investor/investor-shape";
import type { BackofficeKpis } from "@/lib/backoffice/kpi-compute";

// KPI interni finti, con dentro tutto ciò che NON deve uscire.
const INTERNI = {
  range: {
    from: "2026-08-15",
    to: "2026-09-13",
    days: 30,
    previousFrom: "2026-07-16",
    previousTo: "2026-08-14",
    unit: "day",
  },
  headline: {
    mrrCents: 115_600,
    arrCents: 1_387_200,
    plansCovered: 12,
    companiesTotal: 14,
    activeCompanies: 13,
    newCompanies: 2,
    lessonsDone: { current: 1335, previous: 1673 },
    lessonsPerDay: { current: 44.5, previous: 55.8 },
    appShare: { current: 0.408, previous: 0.279 },
    activeInstructors: { current: 23, previous: 24 },
  },
  activity: {
    booked: { current: 2108, previous: 1900 },
    cancelled: 653,
    noShow: 18,
    cancelRate: 0.328,
    activeStudents: 464,
    newStudents: 125,
    series: [
      { bucket: "b1", label: "17 ago", done: 40, cancelled: 12, booked: 55 },
      { bucket: "b2", label: "18 ago", done: 52, cancelled: 9, booked: 61 },
    ],
    sources: [],
    sourceTotals: [{ key: "app", label: "App allievo", count: 860 }],
  },
  revenue: {
    oneOffCents: 50_000,
    oneOffCount: 2,
    arpaCents: 9_600,
    seatsSold: 43,
    seatsUsed: 23,
    growth: [{ month: "2026-09-01T00:00:00.000Z", label: "set 26", newCompanies: 2, mrrCents: 115_600 }],
  },
  companies: [
    {
      id: "c1",
      name: "Autoscuola Solferino",
      kind: "autoscuola",
      active: true,
      lessons: 120,
      cancelled: 8,
      activeStudents: 40,
      appShare: 0.5,
      lastActivityAt: "2026-09-12T10:00:00.000Z",
    },
    {
      id: "c2",
      name: "Autoscuola Bracca",
      kind: "autoscuola",
      active: false,
      lessons: 0,
      cancelled: 0,
      activeStudents: 0,
      appShare: null,
      lastActivityAt: null,
    },
  ],
  features: [
    { key: "group", label: "Guide di gruppo", description: "…", companies: 9, events: 400 },
    { key: "aula", label: "Reglo Aula", description: "…", companies: 0, events: 0 },
  ],
  app: {
    devices: 985,
    ios: 600,
    android: 385,
    versions: [{ version: "2.2.0", count: 900 }],
  },
} as unknown as BackofficeKpis;

const TOTALI = { lessons: 10_226, students: 1_161 };

describe("pagina investor — cosa NON esce da Reglo", () => {
  const out = projectInvestorKpis(INTERNI, TOTALI, "30g");
  const serialized = JSON.stringify(out);

  it("non contiene nessun nome di autoscuola", () => {
    expect(serialized).not.toContain("Solferino");
    expect(serialized).not.toContain("Bracca");
    expect(serialized).not.toContain("companies\":[{\"id");
  });

  it("non espone metriche operative (annullamenti, no show, versioni app)", () => {
    expect(serialized).not.toContain("cancelRate");
    expect(serialized).not.toContain("noShow");
    expect(serialized).not.toContain("cancelled");
    expect(serialized).not.toContain("2.2.0");
    expect(serialized).not.toContain("oneOff");
  });

  it("non elenca le funzionalità che nessuno usa", () => {
    expect(out.features.map((f) => f.label)).toEqual(["Guide di gruppo"]);
  });
});

describe("pagina investor — cosa esce, e giusto", () => {
  const out = projectInvestorKpis(INTERNI, TOTALI, "30g");

  it("porta ricavi, clienti e volumi con i numeri interni", () => {
    expect(out.revenue).toMatchObject({ mrrCents: 115_600, arrCents: 1_387_200, arpaCents: 9_600 });
    expect(out.customers).toEqual({ active: 13, total: 14, newInPeriod: 2 });
    expect(out.usage.lessonsDone).toBe(1335);
    expect(out.usage.lessonsPrevious).toBe(1673);
    expect(out.usage.appShare).toBeCloseTo(0.408);
  });

  it("aggiunge i totali dall'inizio, che il cruscotto interno non ha", () => {
    expect(out.usage.lessonsAllTime).toBe(10_226);
    expect(out.usage.studentsAllTime).toBe(1_161);
  });

  it("riduce la serie alle sole guide svolte", () => {
    expect(out.series).toEqual([
      { label: "17 ago", value: 40 },
      { label: "18 ago", value: 52 },
    ]);
  });
});

describe("pagina investor — periodo", () => {
  it("accetta solo i tre periodi previsti e ripiega su 30 giorni", () => {
    expect(asInvestorPeriod("90g")).toBe("90g");
    expect(asInvestorPeriod("12m")).toBe("12m");
    expect(asInvestorPeriod("tutto")).toBe("30g");
    expect(asInvestorPeriod(undefined)).toBe("30g");
  });
});
