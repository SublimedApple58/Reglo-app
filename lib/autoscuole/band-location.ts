/**
 * REG-717 — cambio rapido del luogo di una fascia dall'agenda web: helper puri
 * condivisi da server (azione) e client (conferma delle guide).
 *
 * Una fascia si riconosce dagli orari (inizio e fine): il cambio tocca solo il
 * suo `locationId` e lascia orari e altre fasce come sono.
 */

import {
  scheduleFromWeekly,
  weeklyPayloadFromSchedule,
  type TimeRange,
  type WeeklyAvailabilityLike,
} from "@/lib/autoscuole/weekly-schedule";

export type BandKey = { startMinutes: number; endMinutes: number };

export const findBandIndex = (ranges: readonly TimeRange[], band: BandKey): number =>
  ranges.findIndex((r) => r.startMinutes === band.startMinutes && r.endMinutes === band.endMinutes);

/** Copia di una fascia con il luogo nuovo; `null` = tutti i luoghi (chiave omessa). */
export const rangeWithLocation = (range: TimeRange, locationId: string | null): TimeRange => {
  const { locationId: _old, ...rest } = range;
  void _old;
  return locationId ? { ...rest, locationId } : rest;
};

/** Le fasce di un giorno con il luogo cambiato su quella fascia, o `null` se non c'è. */
export function rangesWithBandLocation(
  ranges: readonly TimeRange[],
  band: BandKey,
  locationId: string | null,
): TimeRange[] | null {
  const i = findBandIndex(ranges, band);
  if (i < 0) return null;
  return ranges.map((r, j) => (j === i ? rangeWithLocation(r, locationId) : { ...r }));
}

export type WeeklyFields = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  startMinutes2: number | null;
  endMinutes2: number | null;
  ranges: TimeRange[];
  rangesByDay: Record<string, TimeRange[]>;
};

/**
 * Settimana tipo con il luogo cambiato su quella fascia di quel giorno della
 * settimana (0=Dom..6=Sab). Passa sempre al modello per giorno, così cambia
 * solo quel giorno anche se prima gli orari erano condivisi. `null` se la
 * fascia non c'è nella settimana tipo di quel giorno.
 */
export function weeklyWithBandLocation(
  weekly: WeeklyAvailabilityLike,
  dayOfWeek: number,
  band: BandKey,
  locationId: string | null,
): WeeklyFields | null {
  const schedule = scheduleFromWeekly(weekly);
  const day = schedule[dayOfWeek];
  if (!day) return null;
  const next = rangesWithBandLocation(day, band, locationId);
  if (!next) return null;
  schedule[dayOfWeek] = next;
  const payload = weeklyPayloadFromSchedule(schedule, true);
  if (!payload?.scheduleByDay) return null;
  return {
    daysOfWeek: payload.daysOfWeek,
    startMinutes: payload.startMinutes,
    endMinutes: payload.endMinutes,
    startMinutes2: payload.ranges[1]?.startMinutes ?? null,
    endMinutes2: payload.ranges[1]?.endMinutes ?? null,
    ranges: payload.ranges,
    rangesByDay: payload.scheduleByDay,
  };
}

export type BandAppointment = {
  id: string;
  startMinutes: number;
  endMinutes: number;
  /** Luogo della guida; `null` = sede (come nel motore). */
  locationId: string | null;
};

/**
 * Guide dentro la fascia che restano in un luogo diverso dal nuovo. Verso
 * «Tutti i luoghi» non c'è conflitto: la fascia vale per ogni luogo.
 */
export function bandLocationConflicts<T extends BandAppointment>(
  appointments: readonly T[],
  band: BandKey,
  locationId: string | null,
  defaultLocationId: string | null,
): T[] {
  if (!locationId) return [];
  return appointments.filter(
    (a) =>
      a.endMinutes > band.startMinutes &&
      a.startMinutes < band.endMinutes &&
      (a.locationId ?? defaultLocationId) !== locationId,
  );
}

const parseJsonRanges = (raw: unknown): TimeRange[] =>
  Array.isArray(raw)
    ? raw.filter(
        (r): r is TimeRange =>
          !!r && typeof r === "object" && typeof r.startMinutes === "number" && typeof r.endMinutes === "number",
      )
    : [];

/**
 * Riga `AutoscuolaWeeklyAvailability` letta come fa il motore
 * (`defaultToAvailabilityRecord`): senza `ranges` valgono i campi piatti,
 * compresa la seconda fascia (`startMinutes2`/`endMinutes2`) dei record vecchi.
 */
export function weeklyLikeFromRecord(w: {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  startMinutes2: number | null;
  endMinutes2: number | null;
  ranges: unknown;
  rangesByDay: unknown;
}): WeeklyAvailabilityLike & { ranges: TimeRange[]; rangesByDay: Record<string, TimeRange[]> | null } {
  const parsed = parseJsonRanges(w.ranges);
  const ranges: TimeRange[] = parsed.length ? parsed : [{ startMinutes: w.startMinutes, endMinutes: w.endMinutes }];
  if (!parsed.length && w.startMinutes2 != null && w.endMinutes2 != null && w.endMinutes2 > w.startMinutes2) {
    ranges.push({ startMinutes: w.startMinutes2, endMinutes: w.endMinutes2 });
  }
  const byDay =
    w.rangesByDay && typeof w.rangesByDay === "object" && !Array.isArray(w.rangesByDay)
      ? Object.fromEntries(
          Object.entries(w.rangesByDay as Record<string, unknown>).map(([k, v]) => [k, parseJsonRanges(v)]),
        )
      : null;
  return {
    daysOfWeek: w.daysOfWeek,
    startMinutes: w.startMinutes,
    endMinutes: w.endMinutes,
    ranges,
    rangesByDay: byDay && Object.values(byDay).some((d) => d.length) ? byDay : null,
  };
}
