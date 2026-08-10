import type * as React from "react";

/**
 * Criterio colore dei blocchi guida in agenda (setting company, pannello
 * "Aspetto"). Vale SOLO per le guide individuali normali: esami (viola),
 * gruppi (teal/arancio), blocchi istruttore e stati no-show/annullata
 * mantengono sempre il loro colore per tipo/stato.
 *
 * - "durata": bucket per durata della guida (comportamento storico, default)
 * - "patente": colore per patente della guida (la B automatica — e ogni
 *   percorso a cambio automatico — è distinta col ciano dedicato)
 *
 * Modulo client-safe separato dall'action ("use server" non può esportare
 * costanti). Estendibile: aggiungere qui un nuovo criterio e gestirlo nei
 * siti di rendering di AutoscuoleAgendaPage.
 */
export const AGENDA_COLOR_CRITERIA = ["durata", "patente"] as const;

export type AgendaColorCriterion = (typeof AGENDA_COLOR_CRITERIA)[number];

export const DEFAULT_AGENDA_COLOR_CRITERION: AgendaColorCriterion = "durata";

export function asAgendaColorCriterion(value: unknown): AgendaColorCriterion {
  return AGENDA_COLOR_CRITERIA.includes(value as AgendaColorCriterion)
    ? (value as AgendaColorCriterion)
    : DEFAULT_AGENDA_COLOR_CRITERION;
}

// ─── Palette criterio "patente" ───────────────────────────────────────────────
// Stesso stile dei bucket durata (sfondo pastello vivo + ombra in tinta, niente
// bordo). Il ciano "cambio automatico" riusa l'hex del criterio durata così
// l'automatico resta riconoscibile in entrambe le modalità.

export type LicenseColorEntry = {
  key: string;
  /** Etichetta per legenda agenda. */
  label: string;
  /** Etichetta corta per i chip di anteprima nel pannello Aspetto. */
  short: string;
  bgHex: string;
  shadowRgba: string;
};

const ENTRY = (
  key: string,
  label: string,
  short: string,
  bgHex: string,
  shadowRgba: string,
): LicenseColorEntry => ({ key, label, short, bgHex, shadowRgba });

export const LICENSE_COLOR_ENTRIES: LicenseColorEntry[] = [
  ENTRY("b", "Patente B", "B", "#E3EEFF", "rgba(59,130,246,0.22)"),
  ENTRY("autom", "Cambio automatico (B autom., …)", "B autom.", "#CFFAFE", "rgba(6,182,212,0.22)"),
  ENTRY("be", "Patente BE", "BE", "#E6E9FF", "rgba(99,102,241,0.22)"),
  ENTRY("am", "Patente AM", "AM", "#EAF7CE", "rgba(132,204,22,0.22)"),
  ENTRY("a1", "Patente A1", "A1", "#D6F5E3", "rgba(16,185,129,0.22)"),
  ENTRY("a2", "Patente A2", "A2", "#FFE8D1", "rgba(249,115,22,0.22)"),
  ENTRY("a", "Patente A", "A", "#FBD9DD", "rgba(244,63,94,0.22)"),
  ENTRY("c", "Patente C / CE", "C", "#FCEFC7", "rgba(245,158,11,0.22)"),
  ENTRY("d", "Patente D / DE", "D", "#F9DDF3", "rgba(217,70,239,0.22)"),
  ENTRY("none", "Patente non impostata", "—", "#F3F4F8", "rgba(100,116,139,0.16)"),
];

const entryByKey = new Map(LICENSE_COLOR_ENTRIES.map((e) => [e.key, e]));

/**
 * Risolve il tag patente mostrato sui blocchi agenda ("B", "B autom.", "AM", …
 * da studentLicenseById) nella voce colore. Il suffisso " autom." vince sulla
 * categoria: è la distinzione chiave chiesta dal criterio (B vs B automatica).
 */
export function licenseColorEntryForTag(
  tag: string | null | undefined,
): LicenseColorEntry {
  const none = entryByKey.get("none")!;
  if (!tag) return none;
  const t = tag.trim().toUpperCase();
  if (!t) return none;
  if (t.includes("AUTOM")) return entryByKey.get("autom")!;
  if (t.startsWith("AM")) return entryByKey.get("am")!;
  if (t.startsWith("A1")) return entryByKey.get("a1")!;
  if (t.startsWith("A2")) return entryByKey.get("a2")!;
  if (t.startsWith("A")) return entryByKey.get("a")!;
  if (t.startsWith("BE")) return entryByKey.get("be")!;
  if (t.startsWith("B")) return entryByKey.get("b")!;
  if (t.startsWith("C")) return entryByKey.get("c")!;
  if (t.startsWith("D")) return entryByKey.get("d")!;
  return none;
}

/** Stile inline del blocco agenda per una voce patente. */
export function licenseBlockStyle(entry: LicenseColorEntry): React.CSSProperties {
  return {
    backgroundColor: entry.bgHex,
    boxShadow: `0 5px 14px ${entry.shadowRgba}`,
  };
}
