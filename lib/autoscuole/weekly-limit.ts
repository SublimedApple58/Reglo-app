/**
 * REG-782 — il limite settimanale a guide o a ore, senza dipendenze dal DB:
 * lo usano sia il backend (via `weekly-lessons.ts`) sia la pagina Impostazioni.
 */

/** Durata assunta per le guide senza fine registrata. */
export const DEFAULT_LESSON_MINUTES = 60;

export type WeeklyLimitUnit = "lessons" | "minutes";

/** Il limite effettivo: l'unità scelta e i due valori (si tengono entrambi, cambiare unità non perde l'altro). */
export type WeeklyLimit = { unit: WeeklyLimitUnit; lessons: number; minutes: number };

export const DEFAULT_WEEKLY_LIMIT_MINUTES = 240;
export const WEEKLY_LIMIT_MINUTES_MIN = 30;
export const WEEKLY_LIMIT_MINUTES_MAX = 3000;

export function parseWeeklyLimitUnit(value: unknown): WeeklyLimitUnit {
  return value === "minutes" ? "minutes" : "lessons";
}

export function parseWeeklyLimitMinutes(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= WEEKLY_LIMIT_MINUTES_MIN &&
    value <= WEEKLY_LIMIT_MINUTES_MAX
    ? value
    : null;
}

export function weeklyLimitFrom(settings: {
  weeklyBookingLimit: number;
  weeklyBookingLimitUnit?: WeeklyLimitUnit;
  weeklyBookingLimitMinutes?: number;
}): WeeklyLimit {
  return {
    unit: settings.weeklyBookingLimitUnit ?? "lessons",
    lessons: settings.weeklyBookingLimit,
    minutes: settings.weeklyBookingLimitMinutes ?? DEFAULT_WEEKLY_LIMIT_MINUTES,
  };
}

/** Durata in minuti di una guida (60 se manca la fine). */
export function lessonMinutes(startsAt: Date, endsAt: Date | null | undefined): number {
  const span = endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60000) : 0;
  return span > 0 ? span : DEFAULT_LESSON_MINUTES;
}

/** Vero se aggiungere `adding` a quanto già prenotato supera il limite. */
export function exceedsWeeklyLimit(
  limit: WeeklyLimit,
  usage: { lessons: number; minutes: number },
  adding: { lessons: number; minutes: number },
): boolean {
  return limit.unit === "minutes"
    ? usage.minutes + adding.minutes > limit.minutes
    : usage.lessons + adding.lessons > limit.lessons;
}

/** «4 ore», «4 ore e 30», «45 minuti». */
export function formatDrivingMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minuti`;
  const hours = h === 1 ? "1 ora" : `${h} ore`;
  return m ? `${hours} e ${m}` : hours;
}

/** Il limite a parole: «3 guide» oppure «4 ore e 30 di guida». */
export function formatWeeklyLimit(limit: WeeklyLimit): string {
  return limit.unit === "minutes"
    ? `${formatDrivingMinutes(limit.minutes)} di guida`
    : `${limit.lessons} ${limit.lessons === 1 ? "guida" : "guide"}`;
}

/** Quanto è già prenotato, nell'unità del limite: «2 guide» oppure «3 ore». */
export function formatWeeklyUsage(limit: WeeklyLimit, usage: { lessons: number; minutes: number }): string {
  return limit.unit === "minutes"
    ? formatDrivingMinutes(usage.minutes)
    : `${usage.lessons} ${usage.lessons === 1 ? "guida" : "guide"}`;
}

/**
 * Ore scritte dal titolare → minuti: «4», «4,5», «4.5», «4:30».
 * `null` se non è un numero di ore valido.
 */
export function parseHoursInput(raw: string): number | null {
  const value = raw.trim();
  const clock = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hours = Number(value.replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(hours * 60);
}

/** Minuti → testo per il campo ore: 270 → «4,5», 250 → «4:10». */
export function minutesToHoursInput(minutes: number): string {
  if (minutes % 30 === 0) return String(minutes / 60).replace(".", ",");
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
