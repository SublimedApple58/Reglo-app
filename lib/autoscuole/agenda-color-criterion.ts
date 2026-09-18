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
  /**
   * Voce "madre" (solo patenti): finché il titolare non personalizza questa
   * voce, prende il colore — standard o personalizzato — della madre. Così CE,
   * C1… restano del colore della C come prima di REG-461, ma si possono
   * distinguere quando serve.
   */
  parent?: string;
};

const ENTRY = (
  key: string,
  label: string,
  short: string,
  bgHex: string,
  shadowRgba: string,
  parent?: string,
): AgendaColorEntry => ({ key, label, short, bgHex, shadowRgba, ...(parent ? { parent } : {}) });

/** Bucket del criterio "durata" (default storici dei blocchi). */
export const DURATION_COLOR_ENTRIES: AgendaColorEntry[] = [
  ENTRY("d30", "Fino a 30 minuti", "30 min", "#E3EEFF", "rgba(59,130,246,0.22)"),
  ENTRY("d45", "31–45 minuti", "45 min", "#EAF7CE", "rgba(132,204,22,0.22)"),
  ENTRY("d60", "46–60 minuti", "60 min", "#FCEFC7", "rgba(245,158,11,0.22)"),
  ENTRY("d90", "61–90 minuti", "90 min", "#F9DDF3", "rgba(217,70,239,0.22)"),
  ENTRY("d90plus", "Oltre 90 minuti", "> 90", "#FBD9DD", "rgba(244,63,94,0.22)"),
];

const C_BG = "#FCEFC7";
const C_SHADOW = "rgba(245,158,11,0.22)";
const D_BG = "#F9DDF3";
const D_SHADOW = "rgba(217,70,239,0.22)";

/**
 * Una voce per OGNI patente gestita da Reglo (REG-461), speciali comprese
 * (C1/C1E/D1/D1E, qualificazioni CQC e ADR). Le sotto-categorie ereditano il
 * colore della madre finché non vengono personalizzate (`parent`), la CQC
 * pure (prima finiva nella C); l'ADR, che prima non aveva colore, ha il suo.
 */
export const LICENSE_COLOR_ENTRIES: AgendaColorEntry[] = [
  ENTRY("b", "Patente B", "B", "#E3EEFF", "rgba(59,130,246,0.22)"),
  ENTRY("autom", "Cambio automatico (B autom., …)", "B autom.", "#CFFAFE", "rgba(6,182,212,0.22)"),
  ENTRY("be", "Patente BE", "BE", "#E6E9FF", "rgba(99,102,241,0.22)"),
  ENTRY("am", "Patente AM", "AM", "#EAF7CE", "rgba(132,204,22,0.22)"),
  ENTRY("a1", "Patente A1", "A1", "#D6F5E3", "rgba(16,185,129,0.22)"),
  ENTRY("a2", "Patente A2", "A2", "#FFE8D1", "rgba(249,115,22,0.22)"),
  ENTRY("a", "Patente A", "A", "#FBD9DD", "rgba(244,63,94,0.22)"),
  ENTRY("c", "Patente C", "C", C_BG, C_SHADOW),
  ENTRY("ce", "Patente CE", "CE", C_BG, C_SHADOW, "c"),
  ENTRY("c1", "Patente C1", "C1", C_BG, C_SHADOW, "c"),
  ENTRY("c1e", "Patente C1E", "C1E", C_BG, C_SHADOW, "c"),
  ENTRY("d", "Patente D", "D", D_BG, D_SHADOW),
  ENTRY("de", "Patente DE", "DE", D_BG, D_SHADOW, "d"),
  ENTRY("d1", "Patente D1", "D1", D_BG, D_SHADOW, "d"),
  ENTRY("d1e", "Patente D1E", "D1E", D_BG, D_SHADOW, "d"),
  ENTRY("cqc", "CQC (carta di qualificazione)", "CQC", C_BG, C_SHADOW, "c"),
  ENTRY("adr", "ADR (merci pericolose)", "ADR", "#E4E8EE", "rgba(71,85,105,0.2)"),
  ENTRY("none", "Patente non impostata", "Nessuna", "#F3F4F8", "rgba(100,116,139,0.16)"),
];

const licenseEntryByKey = new Map(LICENSE_COLOR_ENTRIES.map((e) => [e.key, e]));

/** Gruppi del pannello "Personalizza i colori" (criterio patente). */
export const LICENSE_COLOR_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: "Auto", keys: ["b", "autom", "be"] },
  { label: "Moto", keys: ["am", "a1", "a2", "a"] },
  { label: "Camion", keys: ["c", "ce", "c1", "c1e"] },
  { label: "Autobus", keys: ["d", "de", "d1", "d1e"] },
  { label: "Qualificazioni", keys: ["cqc", "adr"] },
  { label: "Altro", keys: ["none"] },
];

/**
 * Colore personalizzato effettivo di una voce: il suo override, altrimenti
 * quello della voce madre (patenti). `null` = colore standard.
 */
export function resolveColorOverride(
  entry: AgendaColorEntry,
  overrides: Record<string, string> | undefined,
): string | null {
  if (!overrides) return null;
  return overrides[entry.key] ?? (entry.parent ? overrides[entry.parent] ?? null : null);
}

/** Bucket durata per minuti (stesse soglie storiche). Il cambio automatico
 * non è più un bucket: è l'eccezione "automatic" (attiva di default). */
export function durationColorEntry(minutes: number): AgendaColorEntry {
  if (minutes <= 30) return DURATION_COLOR_ENTRIES[0];
  if (minutes <= 45) return DURATION_COLOR_ENTRIES[1];
  if (minutes <= 60) return DURATION_COLOR_ENTRIES[2];
  if (minutes <= 90) return DURATION_COLOR_ENTRIES[3];
  return DURATION_COLOR_ENTRIES[4];
}

/**
 * Risolve il tag patente mostrato sui blocchi agenda ("B", "B autom.", "AM",
 * "C1E", … da studentLicenseById) nella voce colore. Il suffisso " autom."
 * vince sulla categoria: distinguere B da B automatica è NATIVO di questo
 * criterio (per il criterio durata invece esiste l'eccezione "automatic").
 */
export function licenseColorEntryForTag(
  tag: string | null | undefined,
): AgendaColorEntry {
  const none = licenseEntryByKey.get("none")!;
  if (!tag) return none;
  const t = tag.trim().toUpperCase();
  if (!t) return none;
  if (t.includes("AUTOM")) return licenseEntryByKey.get("autom")!;
  const category = t.split(/\s+/)[0];
  const exact = licenseEntryByKey.get(category.toLowerCase());
  if (exact && exact.key !== "none" && exact.key !== "autom") return exact;
  // Tag non canonici: prefisso (come prima di REG-461).
  if (t.startsWith("AM")) return licenseEntryByKey.get("am")!;
  if (t.startsWith("A1")) return licenseEntryByKey.get("a1")!;
  if (t.startsWith("A2")) return licenseEntryByKey.get("a2")!;
  if (t.startsWith("AD")) return licenseEntryByKey.get("adr")!;
  if (t.startsWith("A")) return licenseEntryByKey.get("a")!;
  if (t.startsWith("BE")) return licenseEntryByKey.get("be")!;
  if (t.startsWith("B")) return licenseEntryByKey.get("b")!;
  if (t.startsWith("C")) return licenseEntryByKey.get("c")!;
  if (t.startsWith("D")) return licenseEntryByKey.get("d")!;
  return none;
}

/**
 * Voci per la legenda dell'agenda: le sotto-categorie che hanno lo stesso
 * colore effettivo della madre si fondono nella sua riga ("Patente C · CE ·
 * C1"), così la legenda resta corta finché nessuno le personalizza.
 */
export function licenseLegendEntries(
  overrides: Record<string, string> | undefined,
): Array<{ entry: AgendaColorEntry; label: string; overrideHex: string | null }> {
  const effective = (entry: AgendaColorEntry) =>
    resolveColorOverride(entry, overrides) ?? entry.bgHex;
  const rows: Array<{ entry: AgendaColorEntry; label: string; overrideHex: string | null }> = [];
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const entry of LICENSE_COLOR_ENTRIES) {
    const parentRow = entry.parent ? byKey.get(entry.parent) : undefined;
    if (parentRow && effective(entry) === effective(parentRow.entry)) {
      parentRow.label = `${parentRow.label} · ${entry.short}`;
      continue;
    }
    const row = { entry, label: entry.label, overrideHex: resolveColorOverride(entry, overrides) };
    rows.push(row);
    byKey.set(entry.key, row);
  }
  return rows;
}

// ─── Eccezioni pre-costruite ──────────────────────────────────────────────────
// Regole pronte che VINCONO sul criterio scelto (prima che matcha vince,
// nell'ordine del registry). Il titolare le attiva/disattiva dal pannello
// Aspetto; il match è implementato in AutoscuoleAgendaPage (serve la directory
// allievi). Estendibili: aggiungere qui la voce + il predicato in agenda.

export type AgendaColorException = {
  key: string;
  label: string;
  /** Spiegazione mostrata nel pannello Aspetto. */
  description: string;
  /** Stato iniziale (prima che il titolare tocchi il toggle). */
  defaultEnabled: boolean;
  /** Criteri in cui l'eccezione ha senso (viene mostrata + applicata solo lì). */
  criteria: AgendaColorCriterion[];
  entry: AgendaColorEntry;
};

export const AGENDA_COLOR_EXCEPTIONS: AgendaColorException[] = [
  {
    // Solo criterio durata: nel criterio patente la distinzione B/B autom.
    // è nativa (voce "autom" della palette patenti).
    key: "automatic",
    label: "Cambio automatico in evidenza",
    description:
      "Le guide con veicolo o percorso a cambio automatico sono sempre in ciano invece del colore per durata.",
    defaultEnabled: true,
    criteria: ["durata"],
    entry: ENTRY("automatic", "Cambio automatico", "Autom.", "#CFFAFE", "rgba(6,182,212,0.22)"),
  },
  {
    key: "exam_ready",
    label: "Pronti per l'esame in evidenza",
    description:
      "Le guide degli allievi segnati “Pronto per l'esame” si accendono di viola.",
    defaultEnabled: false,
    criteria: ["durata", "patente"],
    entry: ENTRY("exam_ready", "Pronto per l'esame", "Esame", "#F0E9FF", "rgba(139,92,246,0.22)"),
  },
  {
    key: "moto",
    label: "Guide moto in evidenza",
    description:
      "Tutte le guide degli allievi con patente moto (AM, A1, A2, A) hanno lo stesso colore arancio, come i gruppi moto.",
    defaultEnabled: false,
    criteria: ["durata", "patente"],
    entry: ENTRY("moto", "Guida moto", "Moto", "#FFEDD5", "rgba(249,115,22,0.22)"),
  },
];

/** Stato on/off delle eccezioni (chiave → attiva). */
export type AgendaColorExceptions = Record<string, boolean>;

/** Normalizza il JSON grezzo: solo chiavi note, default dal registry. */
export function asAgendaColorExceptions(value: unknown): AgendaColorExceptions {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: AgendaColorExceptions = {};
  for (const exc of AGENDA_COLOR_EXCEPTIONS) {
    out[exc.key] = typeof raw[exc.key] === "boolean" ? (raw[exc.key] as boolean) : exc.defaultEnabled;
  }
  return out;
}

// ─── Overrides del titolare ───────────────────────────────────────────────────

/** Colori personalizzati per voce: un namespace per criterio + le eccezioni. */
export type AgendaColorOverrides = {
  durata?: Record<string, string>;
  patente?: Record<string, string>;
  eccezioni?: Record<string, string>;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const OVERRIDE_NAMESPACES = ["durata", "patente", "eccezioni"] as const;

const VALID_OVERRIDE_KEYS: Record<(typeof OVERRIDE_NAMESPACES)[number], Set<string>> = {
  durata: new Set(DURATION_COLOR_ENTRIES.map((e) => e.key)),
  patente: new Set(LICENSE_COLOR_ENTRIES.map((e) => e.key)),
  eccezioni: new Set(AGENDA_COLOR_EXCEPTIONS.map((e) => e.key)),
};

/** Normalizza il JSON grezzo dai limits: solo chiavi note + hex validi. */
export function asAgendaColorOverrides(value: unknown): AgendaColorOverrides {
  const out: AgendaColorOverrides = {};
  if (!value || typeof value !== "object") return out;
  for (const namespace of OVERRIDE_NAMESPACES) {
    const raw = (value as Record<string, unknown>)[namespace];
    if (!raw || typeof raw !== "object") continue;
    const rec: Record<string, string> = {};
    for (const [key, hex] of Object.entries(raw)) {
      if (
        VALID_OVERRIDE_KEYS[namespace].has(key) &&
        typeof hex === "string" &&
        HEX_RE.test(hex)
      ) {
        rec[key] = hex.toUpperCase();
      }
    }
    if (Object.keys(rec).length) out[namespace] = rec;
  }
  return out;
}

/** [r,g,b] da "rgba(r, g, b, a)" — le ombre delle voci portano la tinta satura. */
const rgbFromRgba = (rgba: string): [number, number, number] | null => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgba);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const hexToRgbTriple = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Tinta appiattita su bianco: stesso colore a vista di rgba(hex, alpha) su
 * sfondo bianco, ma OPACO — sopra la banda della colonna istruttore un blocco
 * translucido lasciava passare il colore dell'istruttore (REG-468). */
const flattenOnWhite = (rgb: [number, number, number], alpha: number): string =>
  `rgb(${rgb.map((c) => Math.round(255 + (c - 255) * alpha)).join(", ")})`;

/**
 * Stile inline del blocco agenda per una voce. Senza override usa i pastelli
 * di default; con override l'hex (palette satura del picker) viene declinato
 * in tinta soft + ombra in tinta, così testo e badge restano leggibili.
 * In più porta le custom property lette da `.agenda-card` (globals.css):
 * bordo nella tinta della voce + ombra, così il blocco si stacca sempre dalla
 * banda colorata della colonna istruttore (REG-468).
 */
export function agendaBlockStyle(
  entry: AgendaColorEntry,
  overrideHex?: string | null,
): React.CSSProperties {
  const rgb = overrideHex ? hexToRgbTriple(overrideHex) : rgbFromRgba(entry.shadowRgba);
  const ring = rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)` : "rgba(15, 23, 42, 0.18)";
  const backgroundColor = overrideHex
    ? rgb
      ? flattenOnWhite(rgb, 0.2)
      : instructorColorAlpha(overrideHex, 0.2)
    : entry.bgHex;
  const shadow = overrideHex ? instructorColorAlpha(overrideHex, 0.22) : entry.shadowRgba;
  return {
    backgroundColor,
    "--agenda-card-ring": ring,
    "--agenda-card-shadow": shadow,
  } as React.CSSProperties;
}
