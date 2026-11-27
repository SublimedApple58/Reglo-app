/**
 * Disponibilità dell'allievo a fasce (REG-802) — regole PURE.
 *
 * L'allievo sceglie, giorno per giorno (lunedì–domenica), tra tre fasce fisse:
 * Mattina 8–13, Pomeriggio 13–18, Sera 18–21. Si salvano in minuti nella
 * settimana tipo dell'allievo (`AutoscuolaWeeklyAvailability.rangesByDay`,
 * `ownerType: "student"`), lo stesso modello per giorno degli istruttori: il
 * motore, la lista d'attesa e gli scambi le leggono senza sapere delle fasce.
 * Le fasce sono fisse in V1 ma viaggiano nella risposta dell'API, così l'app
 * non le conosce a memoria e domani possono diventare configurabili.
 *
 * Non sono vincoli per l'allievo: prenotando dall'app sceglie qualunque orario
 * libero. Decidono però chi riceve gli avvisi dei posti liberi, le offerte
 * della lista d'attesa e gli scambi.
 */

import { z } from "zod";
import {
  defaultToAvailabilityRecord,
  rangesForDay,
  type TimeRange,
  type WeeklyAvailabilityRow,
} from "@/lib/autoscuole/availability-record";

export const STUDENT_AVAILABILITY_BANDS = [
  { key: "morning", label: "Mattina", startMinutes: 8 * 60, endMinutes: 13 * 60 },
  { key: "afternoon", label: "Pomeriggio", startMinutes: 13 * 60, endMinutes: 18 * 60 },
  { key: "evening", label: "Sera", startMinutes: 18 * 60, endMinutes: 21 * 60 },
] as const;

export type StudentBandKey = (typeof STUDENT_AVAILABILITY_BANDS)[number]["key"];
export const STUDENT_BAND_KEYS = STUDENT_AVAILABILITY_BANDS.map((b) => b.key) as StudentBandKey[];

/** Giorno della settimana come stringa ("0"=Dom … "6"=Sab) → fasce scelte. */
export type StudentBandsByDay = Record<string, StudentBandKey[]>;

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Fasce ordinate e senza doppioni; ignora chiavi sconosciute. */
const normalizeBands = (bands: readonly string[]): StudentBandKey[] =>
  STUDENT_BAND_KEYS.filter((k) => bands.includes(k));

/** Toglie giorni non validi, fasce sconosciute e giorni vuoti. */
export const normalizeBandsByDay = (days: Record<string, readonly string[]>): StudentBandsByDay => {
  const out: StudentBandsByDay = {};
  for (const [k, v] of Object.entries(days)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6 || String(day) !== k) continue;
    const bands = normalizeBands(v ?? []);
    if (bands.length) out[k] = bands;
  }
  return out;
};

export const hasAnyBand = (days: StudentBandsByDay): boolean =>
  Object.values(days).some((b) => b.length > 0);

/**
 * Fasce scelte → intervalli in minuti per giorno, come li vuole
 * `rangesByDay`. Le fasce adiacenti si fondono (mattina + pomeriggio = 8–18).
 */
export const bandsToRangesByDay = (days: StudentBandsByDay): Record<string, TimeRange[]> => {
  const out: Record<string, TimeRange[]> = {};
  for (const [day, keys] of Object.entries(normalizeBandsByDay(days))) {
    const ranges: TimeRange[] = [];
    for (const band of STUDENT_AVAILABILITY_BANDS) {
      if (!keys.includes(band.key)) continue;
      const last = ranges[ranges.length - 1];
      if (last && last.endMinutes === band.startMinutes) last.endMinutes = band.endMinutes;
      else ranges.push({ startMinutes: band.startMinutes, endMinutes: band.endMinutes });
    }
    if (ranges.length) out[day] = ranges;
  }
  return out;
};

const overlapMinutes = (ranges: TimeRange[], start: number, end: number) => {
  // Unione degli intervalli prima di misurare, così due fasce sovrapposte non
  // contano due volte.
  const sorted = ranges
    .filter((r) => r.endMinutes > r.startMinutes)
    .map((r) => [Math.max(r.startMinutes, start), Math.min(r.endMinutes, end)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of sorted) {
    if (s > curE) {
      if (curE > curS) total += curE - curS;
      curS = s;
      curE = e;
    } else {
      curE = Math.max(curE, e);
    }
  }
  if (curE > curS) total += curE - curS;
  return total;
};

/**
 * Settimana tipo salvata → fasce da mostrare nell'editor. Una fascia è «scelta»
 * se gli intervalli di quel giorno la coprono per almeno metà. Serve per le
 * righe vecchie (mattina/pomeriggio con orari liberi, uguali su tutti i giorni):
 * al primo salvataggio dall'app si normalizzano sulle fasce.
 */
export const rowToBandsByDay = (row: WeeklyAvailabilityRow | null | undefined): StudentBandsByDay => {
  if (!row) return {};
  const record = defaultToAvailabilityRecord(row);
  const out: StudentBandsByDay = {};
  for (const day of WEEKDAYS) {
    const ranges = rangesForDay(record, day);
    if (!ranges.length) continue;
    const bands = STUDENT_AVAILABILITY_BANDS.filter((band) => {
      const len = band.endMinutes - band.startMinutes;
      return overlapMinutes(ranges, band.startMinutes, band.endMinutes) * 2 >= len;
    }).map((b) => b.key);
    if (bands.length) out[String(day)] = bands;
  }
  return out;
};

// ── Orari precisi (REG-813) ───────────────────────────────────────────────

/**
 * REG-813 — oltre alle tre fasce rapide l'allievo può indicare «un orario
 * preciso»: fino a due intervalli al giorno, a passi di 30 minuti, fra le 6 e
 * le 22. In `rangesByDay` finiscono comunque minuti: le fasce sono solo una
 * scorciatoia dell'interfaccia (Pomeriggio = 13–18).
 */
export const STUDENT_RANGE_RULES = {
  minMinutes: 6 * 60,
  maxMinutes: 22 * 60,
  stepMinutes: 30,
  maxPerDay: 2,
} as const;

/** Giorno ("0"=Dom … "6"=Sab) → intervalli in minuti, ordinati e non sovrapposti. */
export type StudentRangesByDay = Record<string, Array<{ startMinutes: number; endMinutes: number }>>;

/** Quello che l'app manda: le fasce (app fino al REG-802) oppure gli intervalli. */
export type StudentAvailabilityInput = {
  days?: Record<string, readonly string[]>;
  ranges?: Record<string, ReadonlyArray<{ startMinutes: number; endMinutes: number }>>;
};

const dayKeySchema = z.string().regex(/^[0-6]$/);
export const studentAvailabilityInputSchema = z.object({
  days: z
    .record(dayKeySchema, z.array(z.enum(STUDENT_BAND_KEYS as [StudentBandKey, ...StudentBandKey[]])).max(STUDENT_BAND_KEYS.length))
    .optional(),
  ranges: z
    .record(
      dayKeySchema,
      z.array(z.object({ startMinutes: z.number().int(), endMinutes: z.number().int() })).max(8),
    )
    .optional(),
});

const mergeRanges = (ranges: ReadonlyArray<{ startMinutes: number; endMinutes: number }>) => {
  const sorted = ranges
    .filter((r) => r.endMinutes > r.startMinutes)
    .map((r) => ({ startMinutes: r.startMinutes, endMinutes: r.endMinutes }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const out: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startMinutes <= last.endMinutes) last.endMinutes = Math.max(last.endMinutes, r.endMinutes);
    else out.push(r);
  }
  return out;
};

/**
 * Intervalli mandati dall'app → forma canonica: arrotondati al passo, tagliati
 * ai limiti, fusi se si toccano o si sovrappongono; via quelli più corti della
 * guida più breve (`minDurationMinutes`). Indulgente apposta: le righe vecchie
 * con orari fuori passo che l'app rimanda senza toccarle non devono bloccare
 * il salvataggio. L'unico errore è avere più di due intervalli in un giorno.
 */
export const normalizeRangesByDay = (
  input: StudentAvailabilityInput["ranges"],
  minDurationMinutes: number = STUDENT_RANGE_RULES.stepMinutes,
): { ok: true; ranges: StudentRangesByDay } | { ok: false; message: string } => {
  const { minMinutes, maxMinutes, stepMinutes, maxPerDay } = STUDENT_RANGE_RULES;
  const snap = (m: number) => Math.min(maxMinutes, Math.max(minMinutes, Math.round(m / stepMinutes) * stepMinutes));
  const out: StudentRangesByDay = {};
  for (const [k, list] of Object.entries(input ?? {})) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6 || String(day) !== k) continue;
    const merged = mergeRanges(
      (list ?? []).map((r) => ({ startMinutes: snap(r.startMinutes), endMinutes: snap(r.endMinutes) })),
    ).filter((r) => r.endMinutes - r.startMinutes >= minDurationMinutes);
    if (merged.length > maxPerDay) {
      return { ok: false, message: "Puoi indicare al massimo due orari al giorno." };
    }
    if (merged.length) out[k] = merged;
  }
  return { ok: true, ranges: out };
};

/** Fasce o intervalli mandati dall'app → intervalli canonici (o il motivo del no). */
export const availabilityInputToRanges = (
  input: StudentAvailabilityInput,
  minDurationMinutes?: number,
): { ok: true; ranges: StudentRangesByDay } | { ok: false; message: string } => {
  const result = input.ranges
    ? normalizeRangesByDay(input.ranges, minDurationMinutes)
    : { ok: true as const, ranges: bandsToRangesByDay(normalizeBandsByDay(input.days ?? {})) as StudentRangesByDay };
  if (result.ok && !Object.keys(result.ranges).length) {
    return { ok: false, message: "Scegli almeno una fascia." };
  }
  return result;
};

/** Settimana tipo salvata → intervalli veri per giorno (fusi e ordinati), senza arrotondare alle fasce. */
export const rowToRangesByDay = (row: WeeklyAvailabilityRow | null | undefined): StudentRangesByDay => {
  if (!row) return {};
  const record = defaultToAvailabilityRecord(row);
  const out: StudentRangesByDay = {};
  for (const day of WEEKDAYS) {
    const ranges = mergeRanges(rangesForDay(record, day));
    if (ranges.length) out[String(day)] = ranges;
  }
  return out;
};

/**
 * Campi da scrivere sulla riga `AutoscuolaWeeklyAvailability` dell'allievo.
 * `rangesByDay` è la fonte; i campi piatti prendono il primo giorno attivo
 * (come `createAvailabilitySlots` con `scheduleByDay`) e `daysOfWeek` tutti i
 * giorni attivi, così anche i lettori che guardano solo il giorno (il job dei
 * posti liberi di domani) restano giusti.
 */
export const weeklyRowFromRanges = (rangesByDay: StudentRangesByDay) => {
  const activeDays = Object.keys(rangesByDay)
    .filter((k) => rangesByDay[k]?.length)
    .map(Number)
    .sort((a, b) => a - b);
  if (!activeDays.length) return null;
  const rep = rangesByDay[String(activeDays[0])];
  return {
    daysOfWeek: activeDays,
    startMinutes: rep[0].startMinutes,
    endMinutes: rep[0].endMinutes,
    startMinutes2: rep[1]?.startMinutes ?? null,
    endMinutes2: rep[1]?.endMinutes ?? null,
    ranges: rep,
    rangesByDay,
  };
};

export const weeklyRowFromBands = (days: StudentBandsByDay) =>
  weeklyRowFromRanges(bandsToRangesByDay(days) as StudentRangesByDay);

// ── Quando chiedere le disponibilità (onboarding) ─────────────────────────

export type StudentAvailabilityStepMode = "required" | "optional" | "none";

/**
 * Criterio «fase guide» (REG-802, piano §10). Allineato a chi può prenotare
 * guide dall'app (`ensureStudentCanBookFromApp`: AWAITING e TEORIA no):
 *  - PRATICA con un percorso patente aperto, oppure senza percorsi registrati
 *    (allievi storici prima del REG-458) → in fase guide: step BLOCCANTE;
 *  - AWAITING / TEORIA → non ancora: step RIMANDABILE;
 *  - PATENTATO, o PRATICA con tutti i percorsi chiusi → non fa più guide:
 *    lo step non si chiede.
 */
export const isInDrivingPhase = (m: {
  studentPhase: string | null | undefined;
  activeLicensePathId: string | null | undefined;
  licensePathCount: number;
}): boolean | null => {
  const phase = m.studentPhase ?? "PRATICA";
  if (phase === "AWAITING" || phase === "TEORIA") return false;
  if (phase === "PATENTATO") return null;
  // PRATICA
  if (m.activeLicensePathId) return true;
  return m.licensePathCount === 0 ? true : null;
};

/**
 * Lo step Disponibilità va mostrato? `required` = bloccante, `optional` =
 * rimandabile (X + «Configura in seguito»), `none` = no.
 *
 * Chi ha già una riga di disponibilità (anche legacy) non viene fermato: le ha
 * già date. Chi ha rimandato non lo rivede fino a `snoozedUntil`, a meno che
 * nel frattempo non sia entrato in fase guide (lì il rinvio non vale).
 */
export const studentAvailabilityStepMode = (input: {
  hasAvailability: boolean;
  studentPhase: string | null | undefined;
  activeLicensePathId: string | null | undefined;
  licensePathCount: number;
  snoozedUntil: Date | null | undefined;
  now: Date;
}): StudentAvailabilityStepMode => {
  if (input.hasAvailability) return "none";
  const driving = isInDrivingPhase(input);
  if (driving === null) return "none";
  if (driving) return "required";
  if (input.snoozedUntil && input.snoozedUntil.getTime() > input.now.getTime()) return "none";
  return "optional";
};

/** Quanto dura «Configura in seguito»: lo step ricompare alla prima apertura dopo. */
export const STUDENT_AVAILABILITY_SNOOZE_DAYS = 3;

export const snoozeUntilFrom = (now: Date): Date =>
  new Date(now.getTime() + STUDENT_AVAILABILITY_SNOOZE_DAYS * 24 * 60 * 60 * 1000);
