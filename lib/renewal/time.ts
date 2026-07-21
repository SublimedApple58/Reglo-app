/**
 * Rinnovo Patenti — timezone helpers.
 *
 * Weekly availability windows are stored as wall-clock minutes past midnight in
 * the company's local time (Europe/Rome). To turn a (local date, minutes) pair
 * into a real UTC instant we mirror the DST-safe two-pass conversion used by the
 * autoscuole availability engine (lib/actions/autoscuole-availability.actions.ts).
 */

export const RENEWAL_TIMEZONE = "Europe/Rome";

export type CalendarDateParts = { year: number; month: number; day: number };

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RENEWAL_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const getZonedParts = (date: Date) => {
  const parts = zonedFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: read("weekday"),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
};

const getTimeZoneOffsetMinutes = (date: Date) => {
  const parts = getZonedParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (asUtc - date.getTime()) / 60000;
};

/** Weekday index (0 = Sunday … 6 = Saturday) of a UTC instant, in Europe/Rome. */
export const getZonedWeekday = (date: Date): number =>
  WEEKDAY_TO_INDEX[getZonedParts(date).weekday] ?? 0;

/** Calendar (Y/M/D) of a UTC instant as seen in Europe/Rome. */
export const getZonedDateParts = (date: Date): CalendarDateParts => {
  const parts = getZonedParts(date);
  return { year: parts.year, month: parts.month, day: parts.day };
};

/**
 * Convert a local wall-clock (date + minutes past midnight, Europe/Rome) into a
 * real UTC `Date`. Two-pass to settle DST boundaries.
 */
export const toZonedInstant = (
  parts: CalendarDateParts,
  minutesPastMidnight: number,
): Date => {
  const hours = Math.floor(minutesPastMidnight / 60);
  const minutes = minutesPastMidnight % 60;
  const baseUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0);
  const firstOffset = getTimeZoneOffsetMinutes(new Date(baseUtc));
  let timestamp = baseUtc - firstOffset * 60000;
  const secondOffset = getTimeZoneOffsetMinutes(new Date(timestamp));
  if (secondOffset !== firstOffset) {
    timestamp = baseUtc - secondOffset * 60000;
  }
  return new Date(timestamp);
};

/** Add `days` calendar days to a CalendarDateParts (via UTC arithmetic). */
export const addDays = (parts: CalendarDateParts, days: number): CalendarDateParts => {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
