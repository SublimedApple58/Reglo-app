/**
 * Matematica dei KPI del backoffice: bucket temporali, classificazione dei
 * canali di prenotazione, normalizzazione dei piani. Modulo puro e senza
 * Prisma, così l'action resta un orchestratore e queste regole si testano.
 */

export type KpiBucketUnit = "hour" | "day" | "week" | "month";
export type KpiCompanyKind = "autoscuola" | "segretaria" | "consorzio";

/** Stati in cui una guida "è avvenuta" ai fini dei conteggi. */
export const DONE_STATUSES = new Set(["completed", "checked_in", "pending_review"]);

export const isDoneStatus = (status: string | null | undefined) =>
  DONE_STATUSES.has((status ?? "").toLowerCase());

export const isCancelledStatus = (status: string | null | undefined) =>
  (status ?? "").toLowerCase() === "cancelled";

/**
 * Granularità del grafico in base al respiro del periodo: un punto all'ora per
 * un giorno o due, poi giorni, settimane, mesi. Serve a non disegnare 365
 * colonne né un solo punto solitario.
 */
export const pickBucketUnit = (days: number): KpiBucketUnit =>
  days <= 2 ? "hour" : days <= 45 ? "day" : days <= 190 ? "week" : "month";

export const bucketStart = (date: Date, unit: KpiBucketUnit) => {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  if (unit === "hour") return d;
  d.setHours(0, 0, 0, 0);
  if (unit === "day") return d;
  if (unit === "week") {
    // Settimana che parte di lunedì, come l'agenda.
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d;
  }
  d.setDate(1);
  return d;
};

export const advanceBucket = (date: Date, unit: KpiBucketUnit) => {
  const d = new Date(date);
  if (unit === "hour") d.setHours(d.getHours() + 1);
  else if (unit === "day") d.setDate(d.getDate() + 1);
  else if (unit === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

export const bucketLabel = (date: Date, unit: KpiBucketUnit) => {
  if (unit === "hour") return `${String(date.getHours()).padStart(2, "0")}:00`;
  if (unit === "month")
    return date.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

/** Scheletro di bucket: un grafico non deve avere buchi dove non è successo niente. */
export const buildBuckets = (from: Date, toExclusive: Date, unit: KpiBucketUnit) => {
  const out: Array<{ key: string; label: string; start: Date }> = [];
  let cursor = bucketStart(from, unit);
  let guard = 0;
  while (cursor < toExclusive && guard++ < 1000) {
    out.push({ key: cursor.toISOString(), label: bucketLabel(cursor, unit), start: new Date(cursor) });
    cursor = advanceBucket(cursor, unit);
  }
  return out;
};

export const bucketKeyFor = (date: Date, unit: KpiBucketUnit) =>
  bucketStart(date, unit).toISOString();

// ── Canali di prenotazione ──────────────────────────────────────────────────

export type KpiSourceKey =
  | "app"
  | "staff"
  | "gruppo"
  | "esame"
  | "scambio"
  | "voce"
  | "altro";

/** L'ordine conta: vince il primo che matcha, e `altro` chiude sempre. */
export const SOURCE_BUCKETS: Array<{
  key: KpiSourceKey;
  label: string;
  match: (source: string | null) => boolean;
}> = [
  { key: "app", label: "App allievo", match: (s) => s === "student_self" },
  { key: "staff", label: "Staff (agenda)", match: (s) => s === "staff_owner" || s === "staff_instructor" },
  { key: "gruppo", label: "Guide di gruppo", match: (s) => s === "group_lesson" },
  { key: "esame", label: "Esami", match: (s) => s === "exam" },
  { key: "scambio", label: "Scambi e slot liberati", match: (s) => s === "swap" || s === "slot_fill" },
  { key: "voce", label: "Segretaria AI", match: (s) => s === "voice" },
  { key: "altro", label: "Storico senza canale", match: () => true },
];

export const sourceBucketOf = (source: string | null): KpiSourceKey =>
  SOURCE_BUCKETS.find((b) => b.match(source))!.key;

// ── Piani ───────────────────────────────────────────────────────────────────

export type KpiPlanShape = {
  billingPeriod: string;
  instructorSeats: number;
  instructorSeatPriceCents: number;
  voiceEnabled: boolean;
  voicePriceCents: number;
};

/** Tutto normalizzato a MENSILE: un piano annuale vale un dodicesimo al mese. */
export const planMonthlyCents = (plan: KpiPlanShape) => {
  const total =
    plan.instructorSeats * plan.instructorSeatPriceCents +
    (plan.voiceEnabled ? plan.voicePriceCents : 0);
  return plan.billingPeriod === "monthly" ? total : Math.round(total / 12);
};

/**
 * Tipo di account, dai `limits` del servizio AUTOSCUOLE. Gli account diversi
 * dall'autoscuola classica restano nei conteggi (decisione di prodotto,
 * 2026-09-13) ma vengono etichettati: per natura fanno pochissime guide.
 */
export const companyKindOf = (limits: unknown): KpiCompanyKind => {
  const l = (limits ?? {}) as Record<string, unknown>;
  if (l.accountKind === "consorzio") return "consorzio";
  if (l.secretaryOnly === true) return "segretaria";
  return "autoscuola";
};

/**
 * Autoscuole interne di prova, tenute fuori dai KPI: hanno dati finti che
 * falsano le medie (la nostra "Autoscuola Maltese" ha 11 istruttori che
 * dichiarano disponibilità e quasi nessuna guida vera).
 *
 * Si attiva con `excludeFromKpis: true` nei `limits` del servizio AUTOSCUOLE —
 * stesso posto di `secretaryOnly` e `accountKind`, nessuna migrazione.
 *
 * ⚠️ Oggi è applicato SOLO alla **saturazione agenda** (decisione di prodotto
 * 2026-09-13): le altre card contano ancora tutte le autoscuole. Estenderlo è
 * una riga, ma va deciso, non fatto di nascosto.
 */
export const isExcludedFromKpis = (limits: unknown): boolean => {
  const l = (limits ?? {}) as Record<string, unknown>;
  return l.excludeFromKpis === true;
};
