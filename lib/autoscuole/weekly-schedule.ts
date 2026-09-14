/**
 * Settimana tipo (disponibilità "predefinita") — helper puri condivisi.
 *
 * `AutoscuolaWeeklyAvailability` ha due modelli sovrapposti:
 *  - legacy/condiviso: `daysOfWeek` + `ranges` (le stesse fasce su ogni giorno attivo);
 *  - per-giorno: `rangesByDay` ({ "1": [...] }, 0=Dom..6=Sab), AUTORITATIVO quando c'è.
 *
 * Questi helper proiettano entrambi sullo stesso modello per-giorno e ricostruiscono
 * il payload di salvataggio, così web e app istruttore leggono/scrivono la stessa cosa.
 */

export type TimeRange = { startMinutes: number; endMinutes: number };

/** Giorno della settimana (0=Dom..6=Sab) → fasce attive. Un giorno assente = riposo. */
export type WeeklySchedule = Record<number, TimeRange[]>;

export type WeeklyAvailabilityLike = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  ranges?: TimeRange[] | null;
  rangesByDay?: Record<string, TimeRange[]> | null;
};

const clone = (ranges: TimeRange[]): TimeRange[] => ranges.map((r) => ({ ...r }));
const valid = (ranges: TimeRange[] | null | undefined): TimeRange[] =>
  (ranges ?? []).filter((r) => r.endMinutes > r.startMinutes).map((r) => ({ ...r }));

/** Fasce del modello condiviso (fallback sui campi piatti quando `ranges` è vuoto). */
export const sharedRangesOf = (w: WeeklyAvailabilityLike | null | undefined): TimeRange[] => {
  if (!w) return [];
  return w.ranges?.length ? clone(w.ranges) : [{ startMinutes: w.startMinutes, endMinutes: w.endMinutes }];
};

/** Proietta la settimana tipo sul modello per-giorno, da entrambi i modelli persistiti. */
export const scheduleFromWeekly = (w: WeeklyAvailabilityLike | null | undefined): WeeklySchedule => {
  const out: WeeklySchedule = {};
  if (!w) return out;
  if (w.rangesByDay) {
    for (const [day, ranges] of Object.entries(w.rangesByDay)) {
      const dayRanges = valid(ranges);
      if (dayRanges.length) out[Number(day)] = dayRanges;
    }
    return out;
  }
  const shared = sharedRangesOf(w);
  for (const d of w.daysOfWeek) out[d] = clone(shared);
  return out;
};

/** Fasce effettive in un giorno della settimana, per entrambi i modelli. */
export const rangesForWeekday = (
  w: WeeklyAvailabilityLike | null | undefined,
  dayOfWeek: number,
): TimeRange[] => scheduleFromWeekly(w)[dayOfWeek] ?? [];

/** True quando la settimana tipo ha orari indipendenti per giorno. */
export const hasPerDayHours = (w: WeeklyAvailabilityLike | null | undefined): boolean =>
  Boolean(w?.rangesByDay && Object.keys(w.rangesByDay).length > 0);

/** Giorni con almeno una fascia, in ordine numerico (0=Dom..6=Sab). */
export const activeDaysOf = (schedule: WeeklySchedule): number[] =>
  Object.keys(schedule)
    .map(Number)
    .filter((d) => (schedule[d]?.length ?? 0) > 0)
    .sort((a, b) => a - b);

/**
 * Raggruppa i giorni che condividono le stesse fasce, nell'ordine di visualizzazione
 * richiesto: un orario uniforme resta un gruppo solo.
 */
export const groupDaysByRanges = (
  schedule: WeeklySchedule,
  dayOrder: readonly number[],
): Array<{ days: number[]; ranges: TimeRange[] }> => {
  const groups: Array<{ key: string; days: number[]; ranges: TimeRange[] }> = [];
  for (const day of dayOrder) {
    const ranges = schedule[day];
    if (!ranges?.length) continue;
    const key = ranges.map((r) => `${r.startMinutes}-${r.endMinutes}`).join("|");
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.days.push(day);
    else groups.push({ key, days: [day], ranges: clone(ranges) });
  }
  return groups.map(({ days, ranges }) => ({ days, ranges }));
};

/**
 * Payload per `setAutoscuolaInstructorWeeklyAvailability` / `createAvailabilitySlots`.
 * `scheduleByDay` va incluso SOLO in modalità per-giorno: senza, il backend azzera
 * `rangesByDay` e la settimana torna al modello condiviso.
 */
export const weeklyPayloadFromSchedule = (
  schedule: WeeklySchedule,
  perDay: boolean,
): {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  ranges: TimeRange[];
  scheduleByDay?: Record<string, TimeRange[]>;
} | null => {
  const days = activeDaysOf(schedule);
  if (!days.length) return null;
  const representative = schedule[days[0]];
  return {
    daysOfWeek: days,
    startMinutes: representative[0].startMinutes,
    endMinutes: representative[0].endMinutes,
    ranges: clone(representative),
    ...(perDay
      ? { scheduleByDay: Object.fromEntries(days.map((d) => [String(d), clone(schedule[d])])) }
      : {}),
  };
};
