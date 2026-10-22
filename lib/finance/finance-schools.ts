/**
 * Regole pure della tab Autoscuole di Finanza (REG-413, fase 3). Testate in
 * `tests/unit/finance-schools.test.ts`.
 */

export const ITALIAN_REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
] as const;

/** «IT 01234567890» → «01234567890»; null se vuota; Error se non è una P.IVA. */
export function normalizeVatNumber(input: string | null | undefined): string | null {
  const raw = (input ?? "").replace(/[\s.-]/g, "").toUpperCase().replace(/^IT/, "");
  if (!raw) return null;
  if (!/^\d{11}$/.test(raw)) throw new Error("La partita IVA ha 11 cifre.");
  return raw;
}

export type SchoolState = "active" | "paused" | "churned" | "incomplete";

type SchoolLike = {
  commercial: { status: "active" | "paused" | "churned" } | null;
  plan: { annualCents: number; renewsAt: string | null } | null;
  instructors: number;
  students: number;
  activeStudentsMonth: number;
  lessonsMonth: number;
  lessonsTotal: number;
};

/** Stato mostrato: senza anagrafica compilata è «da completare», mai un'ipotesi. */
export const schoolState = (row: SchoolLike): SchoolState => row.commercial?.status ?? "incomplete";

/** Piano a pagamento senza data di rinnovo: va completato (decisione di Tiziano). */
export const planNeedsRenewal = (row: SchoolLike) =>
  Boolean(row.plan && row.plan.annualCents > 0 && !row.plan.renewsAt);

export function schoolsTotals(rows: SchoolLike[]) {
  const t = {
    count: rows.length,
    active: 0,
    paused: 0,
    churned: 0,
    incomplete: 0,
    /** Valore annuo dei piani delle autoscuole non disdette. */
    planAnnualCents: 0,
    plansToComplete: 0,
    instructors: 0,
    students: 0,
    activeStudentsMonth: 0,
    lessonsMonth: 0,
    lessonsTotal: 0,
  };
  for (const r of rows) {
    const state = schoolState(r);
    t[state] += 1;
    if (state !== "churned") t.planAnnualCents += r.plan?.annualCents ?? 0;
    if (planNeedsRenewal(r)) t.plansToComplete += 1;
    t.instructors += r.instructors;
    t.students += r.students;
    t.activeStudentsMonth += r.activeStudentsMonth;
    t.lessonsMonth += r.lessonsMonth;
    t.lessonsTotal += r.lessonsTotal;
  }
  return t;
}
