import type * as React from "react";

import { instructorColorAlpha } from "@/lib/autoscuole/instructor-colors";

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
 * Ogni voce di entrambi i criteri può essere personalizzata dal titolare
 * (overrides in `CompanyService.limits.agendaColorOverrides`, pannello
 * Aspetto): l'hex scelto viene declinato in tinta soft + ombra così i blocchi
 * restano leggibili con qualunque swatch della palette.
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

// ─── Voci colore ──────────────────────────────────────────────────────────────
// Stesso stile per tutti (sfondo pastello vivo + ombra in tinta, niente bordo).
// Il ciano "cambio automatico" è lo stesso hex nei due criteri così
// l'automatico resta riconoscibile in entrambe le modalità.

export type AgendaColorEntry = {
  key: string;
  /** Etichetta per legenda agenda e righe del pannello Aspetto. */
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
): AgendaColorEntry => ({ key, label, short, bgHex, shadowRgba });

/** Bucket del criterio "durata" (default storici dei blocchi). */
export const DURATION_COLOR_ENTRIES: AgendaColorEntry[] = [
  ENTRY("d30", "Fino a 30 minuti", "30 min", "#E3EEFF", "rgba(59,130,246,0.22)"),
  ENTRY("d45", "31–45 minuti", "45 min", "#EAF7CE", "rgba(132,204,22,0.22)"),
  ENTRY("d60", "46–60 minuti", "60 min", "#FCEFC7", "rgba(245,158,11,0.22)"),
  ENTRY("d90", "61–90 minuti", "90 min", "#F9DDF3", "rgba(217,70,239,0.22)"),
  ENTRY("d90plus", "Oltre 90 minuti", "> 90", "#FBD9DD", "rgba(244,63,94,0.22)"),
  ENTRY("autom", "Cambio automatico", "Autom.", "#CFFAFE", "rgba(6,182,212,0.22)"),
];

export const LICENSE_COLOR_ENTRIES: AgendaColorEntry[] = [
  ENTRY("b", "Patente B", "B", "#E3EEFF", "rgba(59,130,246,0.22)"),
  ENTRY("autom", "Cambio automatico (B autom., …)", "B autom.", "#CFFAFE", "rgba(6,182,212,0.22)"),
  ENTRY("be", "Patente BE", "BE", "#E6E9FF", "rgba(99,102,241,0.22)"),
  ENTRY("am", "Patente AM", "AM", "#EAF7CE", "rgba(132,204,22,0.22)"),
  ENTRY("a1", "Patente A1", "A1", "#D6F5E3", "rgba(16,185,129,0.22)"),
  ENTRY("a2", "Patente A2", "A2", "#FFE8D1", "rgba(249,115,22,0.22)"),
  ENTRY("a", "Patente A", "A", "#FBD9DD", "rgba(244,63,94,0.22)"),
  ENTRY("c", "Patente C / CE", "C", "#FCEFC7", "rgba(245,158,11,0.22)"),
  ENTRY("d", "Patente D / DE", "D", "#F9DDF3", "rgba(217,70,239,0.22)"),
  ENTRY("none", "Patente non impostata", "Nessuna", "#F3F4F8", "rgba(100,116,139,0.16)"),
];

const licenseEntryByKey = new Map(LICENSE_COLOR_ENTRIES.map((e) => [e.key, e]));

/** Bucket durata per minuti + flag cambio automatico (stesse soglie storiche). */
export function durationColorEntry(
  minutes: number,
  automatic: boolean,
): AgendaColorEntry {
  if (automatic) return DURATION_COLOR_ENTRIES[5];
  if (minutes <= 30) return DURATION_COLOR_ENTRIES[0];
  if (minutes <= 45) return DURATION_COLOR_ENTRIES[1];
  if (minutes <= 60) return DURATION_COLOR_ENTRIES[2];
  if (minutes <= 90) return DURATION_COLOR_ENTRIES[3];
  return DURATION_COLOR_ENTRIES[4];
}

/**
 * Risolve il tag patente mostrato sui blocchi agenda ("B", "B autom.", "AM", …
 * da studentLicenseById) nella voce colore. Il suffisso " autom." vince sulla
 * categoria: è la distinzione chiave chiesta dal criterio (B vs B automatica).
 */
export function licenseColorEntryForTag(
  tag: string | null | undefined,
): AgendaColorEntry {
  const none = licenseEntryByKey.get("none")!;
  if (!tag) return none;
  const t = tag.trim().toUpperCase();
  if (!t) return none;
  if (t.includes("AUTOM")) return licenseEntryByKey.get("autom")!;
  if (t.startsWith("AM")) return licenseEntryByKey.get("am")!;
  if (t.startsWith("A1")) return licenseEntryByKey.get("a1")!;
  if (t.startsWith("A2")) return licenseEntryByKey.get("a2")!;
  if (t.startsWith("A")) return licenseEntryByKey.get("a")!;
  if (t.startsWith("BE")) return licenseEntryByKey.get("be")!;
  if (t.startsWith("B")) return licenseEntryByKey.get("b")!;
  if (t.startsWith("C")) return licenseEntryByKey.get("c")!;
  if (t.startsWith("D")) return licenseEntryByKey.get("d")!;
  return none;
}

// ─── Overrides del titolare ───────────────────────────────────────────────────

/** Colori personalizzati per voce, namespace separato per criterio. */
export type AgendaColorOverrides = {
  durata?: Record<string, string>;
  patente?: Record<string, string>;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const VALID_OVERRIDE_KEYS: Record<keyof AgendaColorOverrides, Set<string>> = {
  durata: new Set(DURATION_COLOR_ENTRIES.map((e) => e.key)),
  patente: new Set(LICENSE_COLOR_ENTRIES.map((e) => e.key)),
};

/** Normalizza il JSON grezzo dai limits: solo chiavi note + hex validi. */
export function asAgendaColorOverrides(value: unknown): AgendaColorOverrides {
  const out: AgendaColorOverrides = {};
  if (!value || typeof value !== "object") return out;
  for (const criterion of AGENDA_COLOR_CRITERIA) {
    const raw = (value as Record<string, unknown>)[criterion];
    if (!raw || typeof raw !== "object") continue;
    const rec: Record<string, string> = {};
    for (const [key, hex] of Object.entries(raw)) {
      if (
        VALID_OVERRIDE_KEYS[criterion].has(key) &&
        typeof hex === "string" &&
        HEX_RE.test(hex)
      ) {
        rec[key] = hex.toUpperCase();
      }
    }
    if (Object.keys(rec).length) out[criterion] = rec;
  }
  return out;
}

/**
 * Stile inline del blocco agenda per una voce. Senza override usa i pastelli
 * di default; con override l'hex (palette satura del picker) viene declinato
 * in tinta soft + ombra in tinta, così testo e badge restano leggibili.
 */
export function agendaBlockStyle(
  entry: AgendaColorEntry,
  overrideHex?: string | null,
): React.CSSProperties {
  if (!overrideHex) {
    return {
      backgroundColor: entry.bgHex,
      boxShadow: `0 5px 14px ${entry.shadowRgba}`,
    };
  }
  return {
    backgroundColor: instructorColorAlpha(overrideHex, 0.2),
    boxShadow: `0 5px 14px ${instructorColorAlpha(overrideHex, 0.22)}`,
  };
}
