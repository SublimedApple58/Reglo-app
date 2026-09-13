/**
 * Forma dei dati della pagina investor: tipi, periodi ammessi e la PROIEZIONE
 * dai KPI interni a quelli pubblici. Modulo puro — niente Prisma, niente
 * Next — così la regola su "cosa esce da Reglo" si può testare da sola.
 */
import type { BackofficeKpis } from "@/lib/backoffice/kpi-compute";

export type InvestorPeriodKey = "30g" | "90g" | "12m";

export const INVESTOR_PERIODS: Array<{ key: InvestorPeriodKey; label: string; days: number }> = [
  { key: "30g", label: "30 giorni", days: 30 },
  { key: "90g", label: "90 giorni", days: 90 },
  { key: "12m", label: "12 mesi", days: 365 },
];

export const asInvestorPeriod = (value: unknown): InvestorPeriodKey =>
  INVESTOR_PERIODS.some((p) => p.key === value) ? (value as InvestorPeriodKey) : "30g";

export type InvestorKpis = {
  period: { key: InvestorPeriodKey; label: string; days: number };
  updatedAt: string;
  revenue: {
    mrrCents: number;
    arrCents: number;
    arpaCents: number;
    plansCovered: number;
  };
  customers: {
    active: number;
    total: number;
    newInPeriod: number;
  };
  usage: {
    lessonsDone: number;
    lessonsPrevious: number;
    lessonsPerDay: number;
    lessonsAllTime: number;
    activeStudents: number;
    studentsAllTime: number;
    activeInstructors: number;
    appShare: number;
    appSharePrevious: number;
  };
  /** Serie del periodo: solo le guide svolte, il resto è rumore per chi legge da fuori. */
  series: Array<{ label: string; value: number }>;
  /** Ultimi 12 mesi: nuove autoscuole e MRR cumulato (stima). */
  growth: Array<{ label: string; newCompanies: number; mrrCents: number }>;
  /** Adozione AGGREGATA: "N clienti su M", mai chi. */
  features: Array<{ label: string; companies: number }>;
};


/**
 * Proiezione dei KPI interni verso l'esterno. È di proposito una funzione PURA
 * e testata: è l'unico punto in cui si decide cosa esce da Reglo, e non deve
 * mai lasciar passare né i nomi dei clienti né le metriche operative.
 */
export function projectInvestorKpis(
  kpis: BackofficeKpis,
  totals: { lessons: number; students: number },
  periodKey: InvestorPeriodKey,
  now = new Date(),
): InvestorKpis {
  const period = INVESTOR_PERIODS.find((p) => p.key === periodKey) ?? INVESTOR_PERIODS[0];
  return {
    period: { key: period.key, label: period.label, days: kpis.range.days },
    updatedAt: now.toISOString(),
    revenue: {
      mrrCents: kpis.headline.mrrCents,
      arrCents: kpis.headline.arrCents,
      arpaCents: kpis.revenue.arpaCents,
      plansCovered: kpis.headline.plansCovered,
    },
    customers: {
      active: kpis.headline.activeCompanies,
      total: kpis.headline.companiesTotal,
      newInPeriod: kpis.headline.newCompanies,
    },
    usage: {
      lessonsDone: kpis.headline.lessonsDone?.current ?? 0,
      lessonsPrevious: kpis.headline.lessonsDone?.previous ?? 0,
      lessonsPerDay: kpis.headline.lessonsPerDay?.current ?? 0,
      lessonsAllTime: totals.lessons,
      activeStudents: kpis.activity.activeStudents,
      studentsAllTime: totals.students,
      activeInstructors: kpis.headline.activeInstructors?.current ?? 0,
      appShare: kpis.headline.appShare?.current ?? 0,
      appSharePrevious: kpis.headline.appShare?.previous ?? 0,
    },
    series: kpis.activity.series.map((point) => ({ label: point.label, value: point.done })),
    growth: kpis.revenue.growth.map((point) => ({
      label: point.label,
      newCompanies: point.newCompanies,
      mrrCents: point.mrrCents,
    })),
    // Solo le funzionalità usate da almeno un cliente: una lista di zeri
    // racconterebbe il contrario di quello che è vero.
    features: kpis.features
      .filter((feature) => feature.companies > 0)
      .map((feature) => ({ label: feature.label, companies: feature.companies })),
  };
}
