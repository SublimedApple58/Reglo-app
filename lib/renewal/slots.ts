/**
 * Rinnovo Patenti — bookable slot generation.
 *
 * Turns a medico's recurring weekly windows into concrete bookable slots for the
 * coming days, excluding slots already taken and slots too close to "now".
 * Pure logic (no DB) so it stays unit-testable.
 */

import {
  addDays,
  getZonedDateParts,
  getZonedWeekday,
  toZonedInstant,
  type CalendarDateParts,
} from "@/lib/renewal/time";

export type WeeklyWindow = {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
};

export type GeneratedSlot = {
  startAt: Date;
  endAt: Date;
};

export type GenerateSlotsInput = {
  windows: WeeklyWindow[];
  durationMinutes: number;
  /** Epoch-ms of already-booked slot starts to exclude. */
  bookedStartMs?: Set<number>;
  /** Reference "now". */
  from: Date;
  /** How many days ahead to generate (inclusive of today). Default 30. */
  horizonDays?: number;
  /** Minimum lead time before a slot can be booked, in minutes. Default 120. */
  minLeadMinutes?: number;
};

/**
 * Weekday index (0=Sun..6=Sat) for a local calendar date, computed via a noon
 * instant so DST transitions near midnight never shift the day.
 */
const weekdayOf = (parts: CalendarDateParts): number =>
  getZonedWeekday(toZonedInstant(parts, 12 * 60));

export const generateMedicoSlots = ({
  windows,
  durationMinutes,
  bookedStartMs,
  from,
  horizonDays = 30,
  minLeadMinutes = 120,
}: GenerateSlotsInput): GeneratedSlot[] => {
  if (durationMinutes <= 0 || windows.length === 0) return [];

  const earliestMs = from.getTime() + minLeadMinutes * 60_000;
  const booked = bookedStartMs ?? new Set<number>();
  const seen = new Set<number>();
  const slots: GeneratedSlot[] = [];
  const startParts = getZonedDateParts(from);

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    const parts = addDays(startParts, dayOffset);
    const weekday = weekdayOf(parts);

    for (const window of windows) {
      if (!window.daysOfWeek.includes(weekday)) continue;

      for (
        let m = window.startMinutes;
        m + durationMinutes <= window.endMinutes;
        m += durationMinutes
      ) {
        const startAt = toZonedInstant(parts, m);
        const ms = startAt.getTime();
        if (ms < earliestMs) continue;
        if (booked.has(ms)) continue;
        if (seen.has(ms)) continue;
        seen.add(ms);
        slots.push({ startAt, endAt: new Date(ms + durationMinutes * 60_000) });
      }
    }
  }

  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return slots;
};
