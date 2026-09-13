import type { BackofficeKpis } from "@/lib/backoffice/kpi-compute";

// Formattatori condivisi della sezione KPI. Numeri sempre it-IT, sempre
// tabular-nums nel markup: una colonna di cifre che balla di mezzo pixel è la
// prima cosa che fa sembrare "interno" un cruscotto.

export const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatInt = (value: number) => nf0.format(Math.round(value));
export const formatDecimal = (value: number) => nf1.format(value);
export const formatPercent = (value: number, decimals = 0) =>
  `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value * 100)}%`;

/** Euro senza centesimi: in un cruscotto i centesimi sono rumore. */
export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export const formatEuroPrecise = (cents: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);

export const formatDateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** "1 – 30 settembre 2026", con l'anno una volta sola quando coincide. */
export const formatRangeLabel = (from: string, to: string) => {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (from === to) return formatDateLabel(from);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("it-IT", {
    day: "numeric",
    ...(sameMonth ? {} : { month: "long" }),
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${startLabel} – ${formatDateLabel(to)}`;
};

export const formatRelativeDay = (iso: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 30) return `${days} giorni fa`;
  if (days < 60) return "un mese fa";
  return `${Math.floor(days / 30)} mesi fa`;
};

export const COMPANY_KIND_LABEL: Record<string, string> = {
  autoscuola: "Autoscuola",
  segretaria: "Solo Segretaria",
  consorzio: "Consorzio",
};

// ── Export CSV ──────────────────────────────────────────────────────────────

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Un CSV solo, a blocchi, come lo si vorrebbe aprire in un foglio: intestazione
 * col periodo, i numeri di sintesi, poi le tabelle. Separatore `;` perché è
 * quello che Excel in italiano si aspetta.
 */
export const buildKpiCsv = (kpis: BackofficeKpis) => {
  const rows: Array<Array<string | number | null>> = [];
  const push = (...cells: Array<string | number | null>) => rows.push(cells);

  push("Reglo — KPI");
  push("Periodo", `${kpis.range.from} → ${kpis.range.to}`);
  push("Periodo di confronto", `${kpis.range.previousFrom} → ${kpis.range.previousTo}`);
  push("Generato il", new Date().toLocaleString("it-IT"));
  push();

  push("Sintesi", "Valore", "Periodo precedente");
  push("MRR (€)", (kpis.headline.mrrCents / 100).toFixed(2), null);
  push("ARR (€)", (kpis.headline.arrCents / 100).toFixed(2), null);
  push("Autoscuole attive", kpis.headline.activeCompanies, null);
  push("Autoscuole totali", kpis.headline.companiesTotal, null);
  push("Nuove autoscuole nel periodo", kpis.headline.newCompanies, null);
  push("Guide svolte", kpis.headline.lessonsDone?.current ?? 0, kpis.headline.lessonsDone?.previous ?? 0);
  push("Media guide al giorno", (kpis.headline.lessonsPerDay?.current ?? 0).toFixed(1), (kpis.headline.lessonsPerDay?.previous ?? 0).toFixed(1));
  push("Quota prenotata dall'app (%)", ((kpis.headline.appShare?.current ?? 0) * 100).toFixed(1), ((kpis.headline.appShare?.previous ?? 0) * 100).toFixed(1));
  push("Istruttori attivi", kpis.headline.activeInstructors?.current ?? 0, kpis.headline.activeInstructors?.previous ?? 0);
  push("Guide prenotate", kpis.activity.booked?.current ?? 0, kpis.activity.booked?.previous ?? 0);
  push("Guide annullate", kpis.activity.cancelled, null);
  push("Tasso di annullamento (%)", (kpis.activity.cancelRate * 100).toFixed(1), null);
  push("No show", kpis.activity.noShow, null);
  push("Allievi attivi", kpis.activity.activeStudents, null);
  push("Nuovi allievi", kpis.activity.newStudents, null);
  push("Ricavi una tantum (€)", (kpis.revenue.oneOffCents / 100).toFixed(2), null);
  push("ARPA (€/mese)", (kpis.revenue.arpaCents / 100).toFixed(2), null);
  push("Posti istruttore venduti", kpis.revenue.seatsSold, null);
  push("Posti istruttore usati", kpis.revenue.seatsUsed, null);
  push();

  push("Andamento", "Guide svolte", "Guide annullate", "Guide prenotate");
  for (const point of kpis.activity.series) {
    push(point.label, point.done, point.cancelled, point.booked);
  }
  push();

  push("Canale di prenotazione", "Prenotazioni");
  for (const source of kpis.activity.sourceTotals) push(source.label, source.count);
  push();

  push("Autoscuola", "Tipo", "Stato", "Guide svolte", "Annullate", "Allievi attivi", "Quota app (%)", "Ultima attività");
  for (const company of kpis.companies) {
    push(
      company.name,
      COMPANY_KIND_LABEL[company.kind] ?? company.kind,
      company.active ? "Attivo" : "Disattivato",
      company.lessons,
      company.cancelled,
      company.activeStudents,
      company.appShare === null ? "" : (company.appShare * 100).toFixed(1),
      company.lastActivityAt ? company.lastActivityAt.slice(0, 10) : "",
    );
  }
  push();

  push("Feature", "Autoscuole che la usano", "Eventi nel periodo");
  for (const feature of kpis.features) push(feature.label, feature.companies, feature.events);
  push();

  push("Versione app", "Dispositivi");
  for (const version of kpis.app.versions) push(version.version, version.count);

  return rows.map((row) => row.map(csvCell).join(";")).join("\n");
};

export const downloadCsv = (filename: string, content: string) => {
  // BOM: senza, Excel sbaglia gli accenti.
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
