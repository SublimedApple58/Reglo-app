"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { sendAutoscuolaWhatsApp } from "@/lib/autoscuole/whatsapp";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import { prepareAppointmentPaymentSnapshot } from "@/lib/autoscuole/payments";
import {
  getBookingGovernanceForCompany,
  isStudentAppBookingEnabled,
} from "@/lib/autoscuole/booking-governance";
import { findBestAutoscuolaSlot } from "@/lib/autoscuole/slot-matcher";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  LESSON_POLICY_TYPES,
  isLessonPolicyType,
  getCompatibleLessonTypesForInterval,
  getLessonPolicyTypeLabel,
  getStudentLessonPolicyCoverage,
  normalizeBookingSlotDurations,
  normalizeLessonType,
  parseLessonPolicyFromLimits,
} from "@/lib/autoscuole/lesson-policy";

const slotSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  startsAt2: z.string().optional(),
  endsAt2: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  weeks: z.number().int().min(1).max(12).optional(),
  ranges: z.array(z.object({
    startMinutes: z.number().int().min(0).max(1440),
    endMinutes: z.number().int().min(0).max(1440),
  })).optional(),
});

const deleteSlotsSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  weeks: z.number().int().min(1).max(12).optional(),
});

const getSlotsSchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]).optional(),
  ownerId: z.string().uuid().optional(),
  date: z.string().optional(),
});

const bookingRequestSchema = z.object({
  studentId: z.string().uuid(),
  preferredDate: z.string(),
  durationMinutes: z.number().int().min(30).max(120),
  preferredStartTime: z.string().optional(),
  preferredEndTime: z.string().optional(),
  lessonType: z.string().optional(),
  maxDays: z.number().int().min(0).max(7).optional(),
  selectedStartsAt: z.string().optional(),
  excludeStartsAt: z.string().optional(),
  requestId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
});

const bookingOptionsSchema = z.object({
  studentId: z.string().uuid(),
});

const instructorBookingSuggestSchema = z.object({
  studentId: z.string().uuid(),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const respondOfferSchema = z.object({
  offerId: z.string().uuid(),
  studentId: z.string().uuid(),
  response: z.enum(["accept", "decline"]),
});

const getWaitlistOffersSchema = z.object({
  studentId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional(),
});

const SLOT_MINUTES = 30;
const DEFAULT_MAX_DAYS = 4;
const DURATION_PRIORITY = [60, 30, 90, 120] as const;
const DEFAULT_SLOT_FILL_CHANNELS = ["push", "whatsapp", "email"] as const;
const AUTOSCUOLA_TIMEZONE = "Europe/Rome";
const OPERATIONAL_REPOSITIONABLE_STATUSES = [
  "scheduled",
  "confirmed",
  "proposal",
  "checked_in",
] as const;
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const invalidateAgendaAndPaymentsCache = async (companyId: string) => {
  await invalidateAutoscuoleCache({
    companyId,
    segments: [
      AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
      AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
    ],
  });
};

type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUTOSCUOLA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const getZonedParts = (date: Date) => {
  const parts = zonedFormatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(readPart("year")),
    month: Number(readPart("month")),
    day: Number(readPart("day")),
    weekday: readPart("weekday"),
    hour: Number(readPart("hour")),
    minute: Number(readPart("minute")),
    second: Number(readPart("second")),
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

const toTimeZoneDate = (
  parts: CalendarDateParts,
  hours: number,
  minutes: number,
) => {
  const baseUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0);
  const firstPass = new Date(baseUtc);
  const firstOffset = getTimeZoneOffsetMinutes(firstPass);
  let timestamp = baseUtc - firstOffset * 60000;
  const secondPass = new Date(timestamp);
  const secondOffset = getTimeZoneOffsetMinutes(secondPass);
  if (secondOffset !== firstOffset) {
    timestamp = baseUtc - secondOffset * 60000;
  }
  return new Date(timestamp);
};

const normalizeChannels = (
  value: unknown,
  fallback: readonly ("push" | "whatsapp" | "email")[],
) => {
  if (!Array.isArray(value)) return [...fallback];
  const channels = value.filter(
    (item): item is "push" | "whatsapp" | "email" =>
      item === "push" || item === "whatsapp" || item === "email",
  );
  const unique = Array.from(new Set(channels));
  return unique.length ? unique : [...fallback];
};

const pickSuggestedDuration = (durations: number[]) => {
  for (const preferred of DURATION_PRIORITY) {
    if (durations.includes(preferred)) return preferred;
  }
  return durations[0] ?? 60;
};

const minutesFromDate = (date: Date) => {
  const parts = getZonedParts(date);
  return parts.hour * 60 + parts.minute;
};

const dayOfWeekFromDate = (date: Date) => {
  const weekday = getZonedParts(date).weekday;
  return WEEKDAY_TO_INDEX[weekday] ?? date.getUTCDay();
};

const normalizeDays = (days: number[] | undefined) =>
  Array.from(new Set((days ?? []).filter((day) => day >= 0 && day <= 6))).sort();

const parseTime = (value?: string) => {
  if (!value) return null;
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return { hours, minutes };
};

const parseDateOnly = (value: string) => {
  const parts = value.split("-");
  if (parts.length === 3) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return {
        year,
        month,
        day,
      };
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const zoned = getZonedParts(parsed);
  return {
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
  };
};

const addDaysToDateParts = (parts: CalendarDateParts, days: number) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const getDayOfWeekFromDateParts = (parts: CalendarDateParts) =>
  new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

const getDayBoundsForDate = (date: Date) => {
  const zoned = getZonedParts(date);
  const start = toTimeZoneDate(
    { year: zoned.year, month: zoned.month, day: zoned.day },
    0,
    0,
  );
  const nextDay = addDaysToDateParts(
    { year: zoned.year, month: zoned.month, day: zoned.day },
    1,
  );
  const end = toTimeZoneDate(nextDay, 0, 0);
  return { start, end };
};


const getSlotEnd = (start: Date, durationMinutes: number) => {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end;
};

// ── Override resolution helpers ─────────────────────────

export type TimeRange = { startMinutes: number; endMinutes: number };

type AvailabilityRecord = {
  daysOfWeek: number[];
  ranges: TimeRange[];
};

const parseRanges = (raw: unknown): TimeRange[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is TimeRange =>
      typeof e === "object" && e !== null &&
      typeof e.startMinutes === "number" && typeof e.endMinutes === "number",
  );
};

const defaultToAvailabilityRecord = (record: { daysOfWeek: number[]; startMinutes: number; endMinutes: number; startMinutes2?: number | null; endMinutes2?: number | null; ranges?: unknown }): AvailabilityRecord => {
  const ranges = record.ranges ? parseRanges(record.ranges) : [];
  if (!ranges.length) {
    ranges.push({ startMinutes: record.startMinutes, endMinutes: record.endMinutes });
    if (record.startMinutes2 != null && record.endMinutes2 != null && record.endMinutes2 > record.startMinutes2) {
      ranges.push({ startMinutes: record.startMinutes2, endMinutes: record.endMinutes2 });
    }
  }
  return { daysOfWeek: record.daysOfWeek, ranges };
};

/**
 * Returns the Monday (ISO week start) for a given date in Europe/Rome timezone.
 */
const getWeekStart = (date: Date): Date => {
  const parts = getZonedParts(date);
  const weekday = WEEKDAY_TO_INDEX[parts.weekday] ?? 0; // 0=Sun..6=Sat
  const daysBack = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysBack));
  return monday;
};

/**
 * Resolves effective availability for a single owner on a given date.
 * If a daily override exists for that date, uses it. Otherwise falls back to the default.
 */
export const resolveEffectiveAvailability = async (
  companyId: string,
  ownerType: string,
  ownerId: string,
  date: Date,
): Promise<AvailabilityRecord | null> => {
  const zoned = getZonedParts(date);
  const dayOfWeek = WEEKDAY_TO_INDEX[zoned.weekday] ?? 0;
  const dateISO = `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`;

  const override = await prisma.autoscuolaDailyAvailabilityOverride.findUnique({
    where: {
      companyId_ownerType_ownerId_date: {
        companyId,
        ownerType,
        ownerId,
        date: new Date(dateISO + "T00:00:00Z"),
      },
    },
  });
  if (override) {
    return { daysOfWeek: [dayOfWeek], ranges: parseRanges(override.ranges) };
  }

  const base = await prisma.autoscuolaWeeklyAvailability.findFirst({
    where: { companyId, ownerType, ownerId },
  });
  if (!base) return null;
  return defaultToAvailabilityRecord(base);
};

type OverrideRaw = { ownerId: string; date: Date | string; ranges: unknown };

/**
 * Batch-fetches daily overrides for multiple owners across a date range.
 * Returns a function (ownerId, date) => AvailabilityRecord | null.
 *
 * For overrides, uses the ranges JSON from the daily override.
 * For defaults, converts the base record using defaultToAvailabilityRecord.
 */
export const buildAvailabilityResolver = async (
  companyId: string,
  ownerType: string,
  ownerIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
) => {
  const [overrides, defaults] = await Promise.all([
    ownerIds.length
      ? prisma.autoscuolaDailyAvailabilityOverride.findMany({
          where: {
            companyId,
            ownerType,
            ownerId: { in: ownerIds },
            date: { gte: rangeStart, lte: rangeEnd },
          },
        })
      : Promise.resolve([] as OverrideRaw[]),
    ownerIds.length
      ? prisma.autoscuolaWeeklyAvailability.findMany({
          where: { companyId, ownerType, ownerId: { in: ownerIds } },
        })
      : Promise.resolve([]),
  ]);

  // Build override map: key = `${ownerId}:${YYYY-MM-DD}`
  const overrideMap = new Map<string, TimeRange[]>();
  for (const o of overrides) {
    const d = new Date(o.date);
    const dateISO = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const key = `${o.ownerId}:${dateISO}`;
    overrideMap.set(key, parseRanges(o.ranges));
  }
  const defaultMap = new Map<string, AvailabilityRecord>();
  for (const d of defaults) {
    defaultMap.set(d.ownerId, defaultToAvailabilityRecord(d));
  }

  return {
    /**
     * Resolves availability for an owner on a specific date.
     * If a daily override exists, uses its ranges.
     * Otherwise falls back to the default.
     */
    resolve(ownerId: string, date: Date): AvailabilityRecord | null {
      const zoned = getZonedParts(date);
      const dayOfWeek = WEEKDAY_TO_INDEX[zoned.weekday] ?? 0;
      const dateISO = `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`;
      const key = `${ownerId}:${dateISO}`;
      const ranges = overrideMap.get(key);
      if (ranges !== undefined) {
        return { daysOfWeek: [dayOfWeek], ranges };
      }
      return defaultMap.get(ownerId) ?? null;
    },
    /** Check if an override exists for a given owner + date */
    hasOverride(ownerId: string, date: Date): boolean {
      const zoned = getZonedParts(date);
      const dateISO = `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`;
      const key = `${ownerId}:${dateISO}`;
      return overrideMap.has(key);
    },
    defaultMap,
  };
};

const isAvailabilityCovering = (
  availability: AvailabilityRecord | null | undefined,
  startsAt: Date,
  endsAt: Date,
) => {
  if (!availability) return false;
  const dayOfWeek = dayOfWeekFromDate(startsAt);
  if (!availability.daysOfWeek.includes(dayOfWeek)) return false;
  const startMin = minutesFromDate(startsAt);
  const endMin = minutesFromDate(endsAt);
  return availability.ranges.some(
    (r) => r.endMinutes > r.startMinutes && startMin >= r.startMinutes && endMin <= r.endMinutes,
  );
};

const hasAppointmentConflict = (
  appointments: Array<{ startsAt: Date; endsAt: Date | null }>,
  startsAt: Date,
  endsAt: Date,
) =>
  appointments.some((appointment) => {
    const appointmentEnd =
      appointment.endsAt ?? getSlotEnd(appointment.startsAt, SLOT_MINUTES);
    return appointment.startsAt < endsAt && appointmentEnd > startsAt;
  });

const ensureStudentMembership = async (companyId: string, studentId: string) =>
  prisma.companyMember.findFirst({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
      userId: studentId,
    },
    select: { userId: true },
  });

const ensureStudentCanBookFromApp = async ({
  companyId,
  membership,
  studentId,
}: {
  companyId: string;
  membership: { role: string; autoscuolaRole: string | null; userId: string };
  studentId: string;
}) => {
  if (membership.role === "admin" || membership.autoscuolaRole === "OWNER") {
    return { allowed: true as const };
  }
  if (membership.autoscuolaRole !== "STUDENT") {
    return {
      allowed: false as const,
      message: "Prenotazione da app non consentita per questo ruolo.",
    };
  }
  if (membership.userId !== studentId) {
    return {
      allowed: false as const,
      message: "Puoi prenotare solo per il tuo profilo allievo.",
    };
  }

  // Check if student has booking blocked
  const blocked = await getStudentBookingBlockStatus(companyId, studentId);
  if (blocked) {
    return {
      allowed: false as const,
      message:
        "Le tue prenotazioni sono temporaneamente sospese. Contatta la segreteria.",
    };
  }

  const governance = await getBookingGovernanceForCompany(companyId);
  if (!isStudentAppBookingEnabled(governance)) {
    return {
      allowed: false as const,
      message: "La prenotazione da app è abilitata solo per istruttori.",
    };
  }
  return { allowed: true as const };
};

export async function createAvailabilitySlots(input: z.infer<typeof slotSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = slotSchema.parse(input);
    const start = new Date(payload.startsAt);
    const end = new Date(payload.endsAt);
    const daysOfWeek = normalizeDays(payload.daysOfWeek);

    if (!daysOfWeek.length) {
      return { success: false, message: "Seleziona almeno un giorno." };
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { success: false, message: "Intervallo non valido." };
    }

    const startMinutes = minutesFromDate(start);
    const endMinutes = minutesFromDate(end);
    if (endMinutes <= startMinutes) {
      return { success: false, message: "Intervallo non valido." };
    }

    let startMinutes2: number | null = null;
    let endMinutes2: number | null = null;
    if (payload.startsAt2 && payload.endsAt2) {
      const start2 = new Date(payload.startsAt2);
      const end2 = new Date(payload.endsAt2);
      if (!Number.isNaN(start2.getTime()) && !Number.isNaN(end2.getTime())) {
        startMinutes2 = minutesFromDate(start2);
        endMinutes2 = minutesFromDate(end2);
        if (endMinutes2 <= startMinutes2) {
          startMinutes2 = null;
          endMinutes2 = null;
        }
      }
    }

    // Build ranges: if explicit ranges provided, use them; otherwise build from flat fields
    const ranges: TimeRange[] = payload.ranges?.length
      ? (payload.ranges as TimeRange[])
      : (() => {
          const r: TimeRange[] = [{ startMinutes, endMinutes }];
          if (startMinutes2 != null && endMinutes2 != null && endMinutes2 > startMinutes2) {
            r.push({ startMinutes: startMinutes2, endMinutes: endMinutes2 });
          }
          return r;
        })();

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId: membership.companyId,
          ownerType: payload.ownerType,
          ownerId: payload.ownerId,
        },
      },
      update: {
        daysOfWeek,
        startMinutes,
        endMinutes,
        startMinutes2,
        endMinutes2,
        ranges,
      },
      create: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        daysOfWeek,
        startMinutes,
        endMinutes,
        startMinutes2,
        endMinutes2,
        ranges,
      },
    });

    if (payload.ownerType === "instructor" || payload.ownerType === "vehicle") {
      const ownerField =
        payload.ownerType === "instructor"
          ? { instructorId: payload.ownerId }
          : { vehicleId: payload.ownerId };

      // Reset the override-approved flag so these appointments are re-checked
      await prisma.autoscuolaAppointment.updateMany({
        where: {
          companyId: membership.companyId,
          ...ownerField,
          startsAt: { gt: new Date() },
          status: { in: ["scheduled", "confirmed", "checked_in"] },
          availabilityOverrideApproved: true,
        },
        data: { availabilityOverrideApproved: false },
      });
    }

    return { success: true, data: { count: availability ? 1 : 0 } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteAvailabilitySlots(input: z.infer<typeof deleteSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = deleteSlotsSchema.parse(input);
    const deleted = await prisma.autoscuolaWeeklyAvailability.deleteMany({
      where: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
      },
    });

    // NOTE: We intentionally do NOT cancel future appointments here.
    // This function is called as a "reset" step before createAvailabilitySlots,
    // which will then check future appointments against the NEW availability
    // and only cancel those that no longer fit. Cancelling here would
    // destroy all appointments even when the user is just re-saving
    // the same or similar availability.

    return { success: true, data: { count: deleted.count } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAvailabilitySlots(input: z.infer<typeof getSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getSlotsSchema.parse(input);

    if (!payload.date) {
      return { success: true, data: [] };
    }

    const dayParts = parseDateOnly(payload.date);
    if (!dayParts) {
      return { success: false, message: "Data non valida." };
    }
    const dayOfWeek = getDayOfWeekFromDateParts(dayParts);

    const availabilityWhere: Record<string, unknown> = {
      companyId: membership.companyId,
    };
    if (payload.ownerType) availabilityWhere.ownerType = payload.ownerType;
    if (payload.ownerId) availabilityWhere.ownerId = payload.ownerId;

    // Fetch base availabilities
    const baseAvailabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
      where: availabilityWhere,
    });

    // Fetch daily overrides for the requested date
    const dateISO = `${dayParts.year}-${String(dayParts.month).padStart(2, "0")}-${String(dayParts.day).padStart(2, "0")}`;
    const overrideWhere: Record<string, unknown> = {
      companyId: membership.companyId,
      date: new Date(dateISO + "T00:00:00Z"),
    };
    if (payload.ownerType) overrideWhere.ownerType = payload.ownerType;
    if (payload.ownerId) overrideWhere.ownerId = payload.ownerId;

    const overrides = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
      where: overrideWhere,
    });

    // Build a map: ownerKey → AvailabilityRecord resolved for this specific day
    const overrideByOwner = new Map<string, AvailabilityRecord>();
    for (const o of overrides) {
      const key = `${o.ownerType}:${o.ownerId}`;
      overrideByOwner.set(key, { daysOfWeek: [dayOfWeek], ranges: parseRanges(o.ranges) });
    }

    // Merge: for owners with an override, use the override; otherwise use base converted
    type SlotAvailability = AvailabilityRecord & { ownerType: string; ownerId: string };
    const availabilities: SlotAvailability[] = [];
    const seenOwners = new Set<string>();

    for (const base of baseAvailabilities) {
      const key = `${base.ownerType}:${base.ownerId}`;
      seenOwners.add(key);
      const overrideEntry = overrideByOwner.get(key);
      if (overrideEntry) {
        availabilities.push({ ...overrideEntry, ownerType: base.ownerType, ownerId: base.ownerId });
      } else {
        availabilities.push({ ...defaultToAvailabilityRecord(base), ownerType: base.ownerType, ownerId: base.ownerId });
      }
    }
    // Add override-only owners (no base record)
    for (const o of overrides) {
      const key = `${o.ownerType}:${o.ownerId}`;
      if (!seenOwners.has(key)) {
        const entry = overrideByOwner.get(key);
        if (entry) {
          availabilities.push({ ...entry, ownerType: o.ownerType, ownerId: o.ownerId });
        }
      }
    }

    const slots = availabilities.flatMap((availability) => {
      if (!availability.daysOfWeek.includes(dayOfWeek)) return [];
      if (!availability.ranges.length) return [];

      const ownerSlots: Array<{
        id: string;
        companyId: string;
        ownerType: string;
        ownerId: string;
        startsAt: Date;
        endsAt: Date;
        status: string;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      for (const range of availability.ranges) {
        if (range.endMinutes <= range.startMinutes) continue;
        const startMinutes = Math.ceil(range.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
        const lastStart = range.endMinutes - SLOT_MINUTES;
        for (let minutes = startMinutes; minutes <= lastStart; minutes += SLOT_MINUTES) {
          const startsAt = toTimeZoneDate(
            dayParts,
            Math.floor(minutes / 60),
            minutes % 60,
          );
          const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
          ownerSlots.push({
            id: randomUUID(),
            companyId: membership.companyId,
            ownerType: availability.ownerType,
            ownerId: availability.ownerId,
            startsAt,
            endsAt,
            status: "open",
            createdAt: startsAt,
            updatedAt: startsAt,
          });
        }
      }
      return ownerSlots;
    });

    slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return { success: true, data: slots };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const getDefaultAvailabilitySchema = z.object({
  ownerType: z.enum(["student", "instructor", "vehicle"]),
  ownerId: z.string().uuid(),
});

export async function getDefaultAvailability(input: z.infer<typeof getDefaultAvailabilitySchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getDefaultAvailabilitySchema.parse(input);

    const record = await prisma.autoscuolaWeeklyAvailability.findFirst({
      where: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
      },
    });

    if (!record) {
      return { success: true, data: null };
    }

    const { daysOfWeek, ranges } = defaultToAvailabilityRecord(record);

    return { success: true, data: { daysOfWeek, ranges } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Weekly availability override CRUD ─────────────────────

const dayScheduleEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(1410),
  endMinutes: z.number().int().min(0).max(1440),
  startMinutes2: z.number().int().min(0).max(1410).optional().nullable(),
  endMinutes2: z.number().int().min(0).max(1440).optional().nullable(),
  ranges: z.array(z.object({
    startMinutes: z.number().int().min(0).max(1440),
    endMinutes: z.number().int().min(0).max(1440),
  })).optional(),
});

const setOverrideSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  weekStart: z.string(), // ISO date string for the Monday (YYYY-MM-DD)
  schedule: z.array(dayScheduleEntrySchema).min(1, "Almeno un giorno richiesto."),
});

export async function setWeeklyAvailabilityOverride(
  input: z.infer<typeof setOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = setOverrideSchema.parse(input);
    const companyId = membership.companyId;

    // Validate each entry
    for (const entry of payload.schedule) {
      const isDayOff = entry.startMinutes === 0 && entry.endMinutes === 0;
      if (!isDayOff && entry.endMinutes <= entry.startMinutes) {
        return { success: false as const, message: `Intervallo non valido per giorno ${entry.dayOfWeek}.` };
      }
      if (entry.startMinutes2 != null && entry.endMinutes2 != null && entry.endMinutes2 <= entry.startMinutes2) {
        return { success: false as const, message: `Secondo intervallo non valido per giorno ${entry.dayOfWeek}.` };
      }
    }

    // Deduplicate by dayOfWeek (last wins)
    const byDay = new Map<number, (typeof payload.schedule)[number]>();
    for (const e of payload.schedule) byDay.set(e.dayOfWeek, e);
    const schedule = Array.from(byDay.values());

    const weekStart = new Date(payload.weekStart + "T00:00:00Z");
    if (Number.isNaN(weekStart.getTime())) {
      return { success: false as const, message: "Data settimana non valida." };
    }

    const maxWeekStart = new Date();
    maxWeekStart.setDate(maxWeekStart.getDate() + 12 * 7);
    if (weekStart.getTime() > maxWeekStart.getTime()) {
      return { success: false as const, message: "Override massimo 12 settimane in avanti." };
    }

    // Upsert daily overrides for each day entry in the schedule
    const upsertedOverrides = await Promise.all(
      schedule.map((entry) => {
        // Compute the actual date for this dayOfWeek relative to weekStart (Monday=1)
        const dayOffset = entry.dayOfWeek === 0 ? 6 : entry.dayOfWeek - 1;
        const entryDate = new Date(weekStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const ranges: TimeRange[] = entry.ranges?.length
          ? (entry.ranges as TimeRange[])
          : (() => {
              const r: TimeRange[] = [{ startMinutes: entry.startMinutes, endMinutes: entry.endMinutes }];
              if (entry.startMinutes2 != null && entry.endMinutes2 != null && entry.endMinutes2 > entry.startMinutes2) {
                r.push({ startMinutes: entry.startMinutes2, endMinutes: entry.endMinutes2 });
              }
              return r;
            })();
        return prisma.autoscuolaDailyAvailabilityOverride.upsert({
          where: {
            companyId_ownerType_ownerId_date: {
              companyId,
              ownerType: payload.ownerType,
              ownerId: payload.ownerId,
              date: entryDate,
            },
          },
          update: { ranges },
          create: {
            companyId,
            ownerType: payload.ownerType,
            ownerId: payload.ownerId,
            date: entryDate,
            ranges,
          },
        });
      }),
    );

    // Reset override-approved flag for appointments in this week
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const ownerField =
      payload.ownerType === "instructor"
        ? { instructorId: payload.ownerId }
        : { vehicleId: payload.ownerId };

    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        ...ownerField,
        startsAt: { gte: weekStart, lt: weekEnd },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const, data: upsertedOverrides };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const deleteOverrideSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  weekStart: z.string(),
});

export async function deleteWeeklyAvailabilityOverride(
  input: z.infer<typeof deleteOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = deleteOverrideSchema.parse(input);
    const companyId = membership.companyId;

    const weekStart = new Date(payload.weekStart + "T00:00:00Z");
    if (Number.isNaN(weekStart.getTime())) {
      return { success: false as const, message: "Data settimana non valida." };
    }

    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.autoscuolaDailyAvailabilityOverride.deleteMany({
      where: {
        companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        date: { gte: weekStart, lt: weekEnd },
      },
    });

    // Reset override-approved flag for appointments in this week
    const ownerField =
      payload.ownerType === "instructor"
        ? { instructorId: payload.ownerId }
        : { vehicleId: payload.ownerId };

    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        ...ownerField,
        startsAt: { gte: weekStart, lt: weekEnd },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const recurringOverrideSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  ranges: z.array(z.object({
    startMinutes: z.number().int().min(0).max(1440),
    endMinutes: z.number().int().min(0).max(1440),
  })), // empty = absent for the day
  weeksAhead: z.number().int().min(1).max(52).optional(),
});

export async function setRecurringAvailabilityOverride(
  input: z.infer<typeof recurringOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = recurringOverrideSchema.parse(input);
    const companyId = membership.companyId;

    for (const r of payload.ranges) {
      if (r.endMinutes <= r.startMinutes) {
        return { success: false as const, message: "Intervallo non valido." };
      }
    }

    // Determine how many weeks ahead from company settings
    const service = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const availabilityWeeks = typeof limits.availabilityWeeks === "number"
      ? limits.availabilityWeeks
      : 4;
    const weeks = payload.weeksAhead ?? availabilityWeeks;

    // Generate dates for the target dayOfWeek for the next N weeks
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const currentDay = today.getUTCDay();
    let daysUntilTarget = payload.dayOfWeek - currentDay;
    if (daysUntilTarget < 0) daysUntilTarget += 7;
    const firstDate = new Date(today.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);

    const dates: Date[] = [];
    for (let w = 0; w < weeks; w++) {
      dates.push(new Date(firstDate.getTime() + w * 7 * 24 * 60 * 60 * 1000));
    }

    // Upsert override for each date
    await Promise.all(
      dates.map((date) =>
        prisma.autoscuolaDailyAvailabilityOverride.upsert({
          where: {
            companyId_ownerType_ownerId_date: {
              companyId,
              ownerType: payload.ownerType,
              ownerId: payload.ownerId,
              date,
            },
          },
          update: { ranges: payload.ranges },
          create: {
            companyId,
            ownerType: payload.ownerType,
            ownerId: payload.ownerId,
            date,
            ranges: payload.ranges,
          },
        }),
      ),
    );

    // Reset override-approved flag for appointments on affected dates
    const ownerField =
      payload.ownerType === "instructor"
        ? { instructorId: payload.ownerId }
        : { vehicleId: payload.ownerId };

    await Promise.all(
      dates.map((date) => {
        const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
        return prisma.autoscuolaAppointment.updateMany({
          where: {
            companyId,
            ...ownerField,
            startsAt: { gte: date, lt: nextDay },
            status: { in: ["scheduled", "confirmed", "checked_in"] },
            availabilityOverrideApproved: true,
          },
          data: { availabilityOverrideApproved: false },
        });
      }),
    );

    return { success: true as const, data: { count: dates.length } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const getOverridesSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function getWeeklyAvailabilityOverrides(
  input: z.infer<typeof getOverridesSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getOverridesSchema.parse(input);
    const companyId = membership.companyId;

    const where: Record<string, unknown> = {
      companyId,
      ownerType: payload.ownerType,
      ownerId: payload.ownerId,
    };

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const fromDate = payload.from ? new Date(payload.from + "T00:00:00Z") : twoWeeksAgo;
    const dateFilter: Record<string, Date> = { gte: fromDate };
    if (payload.to) {
      dateFilter.lte = new Date(payload.to + "T00:00:00Z");
    }
    where.date = dateFilter;

    const overrides = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
      where,
      orderBy: { date: "asc" },
    });

    return { success: true as const, data: overrides };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Per-day availability override CRUD (new API) ─────────────────────

const timeRangeSchema = z.object({
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
});

const setDailyOverrideSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  ranges: z.array(timeRangeSchema), // empty = absent for the day
});

export async function setDailyAvailabilityOverride(
  input: z.infer<typeof setDailyOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = setDailyOverrideSchema.parse(input);
    const companyId = membership.companyId;

    // Validate ranges
    for (const r of payload.ranges) {
      if (r.endMinutes <= r.startMinutes) {
        return { success: false as const, message: "Intervallo orario non valido." };
      }
    }

    const date = new Date(payload.date + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) {
      return { success: false as const, message: "Data non valida." };
    }

    // Max 52 weeks in the future
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 52 * 7);
    if (date.getTime() > maxDate.getTime()) {
      return { success: false as const, message: "Override massimo 52 settimane in avanti." };
    }

    const override = await prisma.autoscuolaDailyAvailabilityOverride.upsert({
      where: {
        companyId_ownerType_ownerId_date: {
          companyId,
          ownerType: payload.ownerType,
          ownerId: payload.ownerId,
          date,
        },
      },
      update: { ranges: payload.ranges },
      create: {
        companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        date,
        ranges: payload.ranges,
      },
    });

    // Reset override-approved flag for appointments on this date
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const ownerField =
      payload.ownerType === "instructor"
        ? { instructorId: payload.ownerId }
        : { vehicleId: payload.ownerId };

    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        ...ownerField,
        startsAt: { gte: date, lt: nextDay },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const, data: override };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const deleteDailyOverrideSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function deleteDailyAvailabilityOverride(
  input: z.infer<typeof deleteDailyOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = deleteDailyOverrideSchema.parse(input);
    const companyId = membership.companyId;

    const date = new Date(payload.date + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) {
      return { success: false as const, message: "Data non valida." };
    }

    await prisma.autoscuolaDailyAvailabilityOverride.deleteMany({
      where: {
        companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        date,
      },
    });

    // Reset override-approved flag for appointments on this date
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const ownerField =
      payload.ownerType === "instructor"
        ? { instructorId: payload.ownerId }
        : { vehicleId: payload.ownerId };

    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        ...ownerField,
        startsAt: { gte: date, lt: nextDay },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const getDailyOverridesSchema = z.object({
  ownerType: z.enum(["instructor", "vehicle"]),
  ownerId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function getDailyAvailabilityOverrides(
  input: z.infer<typeof getDailyOverridesSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getDailyOverridesSchema.parse(input);
    const companyId = membership.companyId;

    const where: Record<string, unknown> = {
      companyId,
      ownerType: payload.ownerType,
      ownerId: payload.ownerId,
    };

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const fromDate = payload.from ? new Date(payload.from + "T00:00:00Z") : twoWeeksAgo;
    const dateFilter: Record<string, Date> = { gte: fromDate };
    if (payload.to) {
      dateFilter.lte = new Date(payload.to + "T00:00:00Z");
    }
    where.date = dateFilter;

    const overrides = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
      where,
      orderBy: { date: "asc" },
    });

    return { success: true as const, data: overrides };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function createBookingRequest(input: z.infer<typeof bookingRequestSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = bookingRequestSchema.parse(input);
    const bookingAccess = await ensureStudentCanBookFromApp({
      companyId: membership.companyId,
      membership,
      studentId: payload.studentId,
    });
    if (!bookingAccess.allowed) {
      return { success: false, message: bookingAccess.message };
    }
    const now = new Date();
    const durationSlots = payload.durationMinutes / SLOT_MINUTES;
    if (!Number.isInteger(durationSlots) || durationSlots < 1 || durationSlots > 4) {
      return { success: false, message: "Durata non valida." };
    }
    const requestedLessonType = normalizeLessonType(payload.lessonType);
    if (requestedLessonType && !isLessonPolicyType(requestedLessonType)) {
      return { success: false, message: "Tipo guida non valido." };
    }
    const requestedPolicyType = isLessonPolicyType(requestedLessonType)
      ? requestedLessonType
      : null;

    const preferredDateParts = parseDateOnly(payload.preferredDate);
    if (!preferredDateParts) {
      return { success: false, message: "Data preferita non valida." };
    }
    const preferredDate = toTimeZoneDate(preferredDateParts, 0, 0);
    const nowParts = getZonedParts(now);
    const todayStart = toTimeZoneDate(
      {
        year: nowParts.year,
        month: nowParts.month,
        day: nowParts.day,
      },
      0,
      0,
    );
    if (preferredDate < todayStart) {
      return { success: false, message: "Non puoi prenotare una guida nel passato." };
    }

    // Check booking min start date
    const serviceForMinDate = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const serviceLimits = (serviceForMinDate?.limits ?? {}) as Record<string, unknown>;
    const bookingMinStartDate = typeof serviceLimits.bookingMinStartDate === "string"
      ? serviceLimits.bookingMinStartDate.trim()
      : null;
    const roundedHoursOnly = serviceLimits.roundedHoursOnly === true;
    if (bookingMinStartDate) {
      const minDate = new Date(bookingMinStartDate);
      minDate.setHours(0, 0, 0, 0);
      if (preferredDate < minDate) {
        const formatted = minDate.toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        return {
          success: false,
          message: `Le prenotazioni sono aperte a partire dal ${formatted}.`,
        };
      }
    }

    // Booking cutoff: block if past the deadline (day before at cutoff time)
    const cutoffEnabled = serviceLimits.bookingCutoffEnabled === true;
    if (cutoffEnabled) {
      const cutoffTime = typeof serviceLimits.bookingCutoffTime === "string"
        ? serviceLimits.bookingCutoffTime
        : "18:00";
      const [cutoffH, cutoffM] = cutoffTime.split(":").map(Number);
      const prevDate = new Date(Date.UTC(preferredDateParts.year, preferredDateParts.month - 1, preferredDateParts.day - 1));
      const prevParts = { year: prevDate.getUTCFullYear(), month: prevDate.getUTCMonth() + 1, day: prevDate.getUTCDate() };
      const cutoffDeadline = toTimeZoneDate(prevParts, cutoffH, cutoffM);
      if (now >= cutoffDeadline) {
        return {
          success: false,
          message: "Le prenotazioni per questa data sono chiuse dalle " + cutoffTime + " del giorno prima.",
        };
      }
    }

    const maxDays = payload.maxDays ?? DEFAULT_MAX_DAYS;
    const [activeInstructors, activeVehicles, studentAvailabilityRaw, autoscuolaService] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: {
          companyId: membership.companyId,
          status: { not: "inactive" },
          ...(payload.instructorId ? { id: payload.instructorId } : {}),
        },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "student",
          ownerId: payload.studentId,
        },
      }),
      prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);
    const studentAvailability = studentAvailabilityRaw ? defaultToAvailabilityRecord(studentAvailabilityRaw) : null;
    const lessonPolicy = parseLessonPolicyFromLimits(
      (autoscuolaService?.limits ?? {}) as Record<string, unknown>,
    );
    const allowedDurations = normalizeBookingSlotDurations(
      (autoscuolaService?.limits as Record<string, unknown> | null)?.bookingSlotDurations,
    );
    if (!allowedDurations.some((duration) => duration === payload.durationMinutes)) {
      return {
        success: false,
        message: "Durata non disponibile per questa autoscuola.",
      };
    }
    const enforceRequiredTypes =
      lessonPolicy.lessonPolicyEnabled &&
      lessonPolicy.lessonRequiredTypesEnabled &&
      lessonPolicy.lessonRequiredTypes.length > 0;
    const enforceLessonTypeTimeConstraints = lessonPolicy.lessonPolicyEnabled;
    const studentCoverage: {
      activeCaseId: string | null;
      completedTypes: Set<string>;
      missingRequiredTypes: string[];
    } = enforceRequiredTypes
      ? await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: payload.studentId,
          policy: lessonPolicy,
        })
      : {
          activeCaseId: null,
          completedTypes: new Set(),
          missingRequiredTypes: [],
        };
    const missingRequiredTypes = studentCoverage.missingRequiredTypes;
    if (
      enforceRequiredTypes &&
      missingRequiredTypes.length &&
      requestedPolicyType &&
      !missingRequiredTypes.includes(requestedPolicyType)
    ) {
      return {
        success: false,
        message: `Per ora puoi prenotare solo i tipi mancanti (${missingRequiredTypes
          .map((type) => getLessonPolicyTypeLabel(type))
          .join(", ")}).`,
      };
    }
    const activeInstructorIds = activeInstructors.map((item) => item.id);
    const activeVehicleIds = activeVehicles.map((item) => item.id);

    const resolverRangeStart = preferredDate;
    const resolverRangeEnd = toTimeZoneDate(
      addDaysToDateParts(preferredDateParts, (payload.maxDays ?? DEFAULT_MAX_DAYS) + 1),
      0,
      0,
    );
    const [instructorAvailabilityResolver, vehicleAvailabilityResolver] = await Promise.all([
      activeInstructorIds.length
        ? buildAvailabilityResolver(
            membership.companyId,
            "instructor",
            activeInstructorIds,
            resolverRangeStart,
            resolverRangeEnd,
          )
        : { resolve: () => null, defaultMap: new Map<string, AvailabilityRecord>() },
      activeVehicleIds.length
        ? buildAvailabilityResolver(
            membership.companyId,
            "vehicle",
            activeVehicleIds,
            resolverRangeStart,
            resolverRangeEnd,
          )
        : { resolve: () => null, defaultMap: new Map<string, AvailabilityRecord>() },
    ]);

    const buildAppointmentMaps = (
      appointments: Array<{
        instructorId: string | null;
        vehicleId: string | null;
        studentId: string;
        startsAt: Date;
        endsAt: Date | null;
      }>,
    ) => {
      const starts = new Map<string, Set<number>>();
      const ends = new Map<string, Set<number>>();
      const intervals = new Map<string, Array<{ start: number; end: number }>>();

      const add = (ownerId: string, start: number, end: number) => {
        const startSet = starts.get(ownerId) ?? new Set<number>();
        const endSet = ends.get(ownerId) ?? new Set<number>();
        const list = intervals.get(ownerId) ?? [];
        startSet.add(start);
        endSet.add(end);
        list.push({ start, end });
        starts.set(ownerId, startSet);
        ends.set(ownerId, endSet);
        intervals.set(ownerId, list);
      };

      for (const appointment of appointments) {
        const start = appointment.startsAt.getTime();
        const end =
          appointment.endsAt?.getTime() ?? start + SLOT_MINUTES * 60 * 1000;
        add(appointment.studentId, start, end);
        if (appointment.instructorId) {
          add(appointment.instructorId, start, end);
        }
        if (appointment.vehicleId) {
          add(appointment.vehicleId, start, end);
        }
      }

      return { starts, ends, intervals };
    };

    const overlaps = (
      intervals: Array<{ start: number; end: number }> | undefined,
      start: number,
      end: number,
    ) => {
      if (!intervals?.length) return false;
      return intervals.some((interval) => start < interval.end && end > interval.start);
    };

    // Build excluded set: accumulate all previously rejected slots
    const excludedStartsSet = new Set<number>();
    let existingRequest: { id: string; rejectedSlots: unknown } | null = null;
    if (payload.requestId) {
      existingRequest = await prisma.autoscuolaBookingRequest.findFirst({
        where: {
          id: payload.requestId,
          companyId: membership.companyId,
          studentId: payload.studentId,
        },
        select: { id: true, rejectedSlots: true },
      });
      if (existingRequest && Array.isArray(existingRequest.rejectedSlots)) {
        for (const ms of existingRequest.rejectedSlots) {
          if (typeof ms === "number") excludedStartsSet.add(ms);
        }
      }
    }
    if (payload.excludeStartsAt) {
      const ms = new Date(payload.excludeStartsAt).getTime();
      if (!Number.isNaN(ms)) excludedStartsSet.add(ms);
    }

    const upsertBookingRequest = async (status: "pending" | "matched", suggestedStartMs?: number) => {
      // When matched or no more slots, clear rejected list
      const nextRejected = status === "matched" ? [] : Array.from(excludedStartsSet);
      if (suggestedStartMs) nextRejected.push(suggestedStartMs);

      if (existingRequest) {
          return prisma.autoscuolaBookingRequest.update({
            where: { id: existingRequest.id },
            data: { status, desiredDate: preferredDate, rejectedSlots: nextRejected },
          });
      }

      return prisma.autoscuolaBookingRequest.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          desiredDate: preferredDate,
          status,
          rejectedSlots: status === "matched" ? [] : Array.from(excludedStartsSet),
        },
      });
    };

    const isOwnerAvailable = (
      availability: AvailabilityRecord | null | undefined,
      dayOfWeek: number,
      startMinutes: number,
      endMinutes: number,
    ) => {
      if (!availability) return false;
      if (!availability.daysOfWeek.includes(dayOfWeek)) return false;
      return availability.ranges.some(
        (r) => r.endMinutes > r.startMinutes && startMinutes >= r.startMinutes && endMinutes <= r.endMinutes,
      );
    };

    const buildCandidateStarts = (
      dayParts: CalendarDateParts,
      window: { startMinutes: number; endMinutes: number },
    ) => {
      const first = Math.ceil(window.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
      const lastStart = window.endMinutes - payload.durationMinutes;
      if (lastStart < first) return [];
      const candidates: Date[] = [];
      for (let minutes = first; minutes <= lastStart; minutes += SLOT_MINUTES) {
        candidates.push(
          toTimeZoneDate(dayParts, Math.floor(minutes / 60), minutes % 60),
        );
      }
      return candidates;
    };

    const findCandidateForDay = async (
      dayParts: CalendarDateParts,
      preferredWindow?: { startMinutes: number; endMinutes: number },
      forcedStart?: Date,
    ) => {
      if (!studentAvailability && !forcedStart) return null;
      if (!activeInstructorIds.length || !activeVehicleIds.length) return null;

      const dayOfWeek = getDayOfWeekFromDateParts(dayParts);

      // When roundedHoursOnly, collect half-hour starts justified by instructor ranges
      let allowedHalfHourStarts: Set<number> | null = null;
      if (roundedHoursOnly) {
        allowedHalfHourStarts = new Set<number>();
        const probe = toTimeZoneDate(dayParts, 0, 0);
        for (const instrId of activeInstructorIds) {
          const avail = instructorAvailabilityResolver.resolve(instrId, probe);
          if (!avail || !avail.daysOfWeek.includes(dayOfWeek)) continue;
          for (const r of avail.ranges) {
            if (r.startMinutes % 60 !== 0) {
              for (let s = r.startMinutes; s + payload.durationMinutes <= r.endMinutes; s += 60) {
                allowedHalfHourStarts.add(s);
              }
            }
          }
        }
      }

      // Build candidate starts from all student availability ranges
      let candidateStarts: Date[] = [];
      if (forcedStart) {
        // When a specific start is forced (free_choice or accepted suggestion),
        // skip student availability checks — the slot was already validated
        const forcedMinutes = minutesFromDate(forcedStart);
        if (forcedMinutes % SLOT_MINUTES !== 0) return null;
        candidateStarts = [forcedStart];
      } else {
        if (!studentAvailability || !studentAvailability.daysOfWeek.includes(dayOfWeek)) {
          return null;
        }
        for (const range of studentAvailability.ranges) {
          let start = range.startMinutes;
          let end = range.endMinutes;
          if (preferredWindow) {
            start = Math.max(start, preferredWindow.startMinutes);
            end = Math.min(end, preferredWindow.endMinutes);
          }
          if (end - start >= payload.durationMinutes) {
            candidateStarts.push(...buildCandidateStarts(dayParts, { startMinutes: start, endMinutes: end }));
          }
        }
      }
      if (!candidateStarts.length) return null;

      const rangeStart = toTimeZoneDate(dayParts, 0, 0);
      const rangeEnd = toTimeZoneDate(addDaysToDateParts(dayParts, 1), 0, 0);
      const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
      const appointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          status: { notIn: ["cancelled"] },
          startsAt: { gte: appointmentScanStart, lt: rangeEnd },
        },
      });

      const appointmentMaps = buildAppointmentMaps(appointments);
      const studentIntervals = appointmentMaps.intervals.get(payload.studentId);

      let best: {
        start: Date;
        end: Date;
        instructorId: string;
        vehicleId: string;
        score: number;
        compatibleRequiredTypes: string[];
        resolvedLessonType: string;
      } | null = null;

      for (const startDate of candidateStarts) {
        const endDate = getSlotEnd(startDate, payload.durationMinutes);
        const startMs = startDate.getTime();
        if (startMs < now.getTime()) continue;
        if (excludedStartsSet.size && excludedStartsSet.has(startMs)) continue;
        if (startDate < rangeStart || endDate > rangeEnd) continue;
        if (overlaps(studentIntervals, startMs, endDate.getTime())) continue;

        // When roundedHoursOnly, skip non-round minutes unless justified by instructor range
        if (roundedHoursOnly) {
          const candidateMin = minutesFromDate(startDate);
          if (candidateMin % 60 !== 0 && !allowedHalfHourStarts!.has(candidateMin)) continue;
        }

        if (
          enforceLessonTypeTimeConstraints &&
          requestedPolicyType &&
          !getCompatibleLessonTypesForInterval({
            policy: lessonPolicy,
            startsAt: startDate,
            endsAt: endDate,
            candidateTypes: [requestedPolicyType],
          }).length
        ) {
          continue;
        }

        const compatibleRequiredTypes =
          enforceRequiredTypes && missingRequiredTypes.length
            ? getCompatibleLessonTypesForInterval({
                policy: lessonPolicy,
                startsAt: startDate,
                endsAt: endDate,
                candidateTypes: missingRequiredTypes,
              })
            : [];
        if (enforceRequiredTypes && missingRequiredTypes.length && !compatibleRequiredTypes.length) {
          continue;
        }
        if (
          enforceRequiredTypes &&
          missingRequiredTypes.length &&
          requestedPolicyType &&
          !compatibleRequiredTypes.includes(requestedPolicyType)
        ) {
          continue;
        }

        const candidateStartMinutes = minutesFromDate(startDate);
        const candidateEndMinutes = candidateStartMinutes + payload.durationMinutes;

        const availableInstructors: Array<{
          id: string;
          score: number;
        }> = [];
        for (const ownerId of activeInstructorIds) {
          const availability = instructorAvailabilityResolver.resolve(ownerId, startDate);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
            continue;
          }
          const intervals = appointmentMaps.intervals.get(ownerId);
          if (overlaps(intervals, startMs, endDate.getTime())) continue;
          const score =
            (appointmentMaps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
            (appointmentMaps.starts.get(ownerId)?.has(endDate.getTime()) ? 1 : 0);
          availableInstructors.push({
            id: ownerId,
            score,
          });
        }

        const availableVehicles: Array<{
          id: string;
          score: number;
        }> = [];
        for (const ownerId of activeVehicleIds) {
          const availability = vehicleAvailabilityResolver.resolve(ownerId, startDate);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
            continue;
          }
          const intervals = appointmentMaps.intervals.get(ownerId);
          if (overlaps(intervals, startMs, endDate.getTime())) continue;
          const score =
            (appointmentMaps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
            (appointmentMaps.starts.get(ownerId)?.has(endDate.getTime()) ? 1 : 0);
          availableVehicles.push({
            id: ownerId,
            score,
          });
        }

        if (!availableInstructors.length || !availableVehicles.length) {
          continue;
        }

        availableInstructors.sort((a, b) => b.score - a.score);
        availableVehicles.sort((a, b) => b.score - a.score);

        const instructorChoice = availableInstructors[0];
        const vehicleChoice = availableVehicles[0];
        const score = instructorChoice.score + vehicleChoice.score;

        if (
          !best ||
          score > best.score ||
          (score === best.score && startMs < best.start.getTime())
        ) {
          best = {
            start: startDate,
            end: endDate,
            instructorId: instructorChoice.id,
            vehicleId: vehicleChoice.id,
            score,
            compatibleRequiredTypes,
            resolvedLessonType:
              (enforceLessonTypeTimeConstraints && requestedPolicyType) ||
              (enforceRequiredTypes && compatibleRequiredTypes.length === 1
                ? compatibleRequiredTypes[0]
                : "guida"),
          };
        }
      }

      return best;
    };

    if (payload.selectedStartsAt) {
      const selectedStart = new Date(payload.selectedStartsAt);
      if (Number.isNaN(selectedStart.getTime())) {
        return { success: false, message: "Slot selezionato non valido." };
      }
      if (selectedStart.getTime() < now.getTime()) {
        return { success: false, message: "Non puoi prenotare una guida nel passato." };
      }
      const selectedStartParts = getZonedParts(selectedStart);
      const candidate = await findCandidateForDay(
        {
          year: selectedStartParts.year,
          month: selectedStartParts.month,
          day: selectedStartParts.day,
        },
        undefined,
        selectedStart,
      );
      if (!candidate) {
        if (requestedPolicyType && enforceLessonTypeTimeConstraints) {
          return {
            success: false,
            message: `Nessuno slot disponibile per il tipo guida ${getLessonPolicyTypeLabel(
              requestedPolicyType,
            )} nel giorno selezionato.`,
          };
        }
        if (enforceRequiredTypes && missingRequiredTypes.length) {
          const label = missingRequiredTypes.map((type) => getLessonPolicyTypeLabel(type)).join(", ");
          return {
            success: false,
            message: `Slot non disponibile per i tipi guida obbligatori mancanti (${label}).`,
          };
        }
        return { success: false, message: "Slot non disponibile." };
      }

      const appointmentId = randomUUID();
      const appointment = await prisma.$transaction(async (tx) => {
        const paymentSnapshot = await prepareAppointmentPaymentSnapshot({
          prisma: tx as never,
          companyId: membership.companyId,
          studentId: payload.studentId,
          startsAt: candidate.start,
          endsAt: candidate.end,
          appointmentId,
          actorUserId: membership.userId,
        });

        const studentSlot = await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "student",
              ownerId: payload.studentId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "student",
            ownerId: payload.studentId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "instructor",
              ownerId: candidate.instructorId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "instructor",
            ownerId: candidate.instructorId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              ownerId: candidate.vehicleId,
              startsAt: candidate.start,
            },
          },
          update: {
            endsAt: candidate.end,
            status: "booked",
          },
          create: {
            companyId: membership.companyId,
            ownerType: "vehicle",
            ownerId: candidate.vehicleId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "booked",
          },
        });

        const existingOnSlot = await tx.autoscuolaAppointment.findFirst({
          where: {
            companyId: membership.companyId,
            slotId: studentSlot.id,
            status: { notIn: ["cancelled"] },
          },
          select: { id: true },
        });
        if (existingOnSlot) {
          throw new Error("Slot non disponibile.");
        }

        return tx.autoscuolaAppointment.create({
          data: {
            id: appointmentId,
            companyId: membership.companyId,
            studentId: payload.studentId,
            type: candidate.resolvedLessonType,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "scheduled",
            instructorId: candidate.instructorId,
            vehicleId: candidate.vehicleId,
            slotId: studentSlot.id,
            paymentRequired: paymentSnapshot.paymentRequired,
            paymentStatus: paymentSnapshot.paymentStatus,
            priceAmount: paymentSnapshot.priceAmount,
            penaltyAmount: paymentSnapshot.penaltyAmount,
            penaltyCutoffAt: paymentSnapshot.penaltyCutoffAt,
            paidAmount: paymentSnapshot.paidAmount,
            invoiceStatus: paymentSnapshot.invoiceStatus,
            creditApplied: paymentSnapshot.creditApplied,
          },
        });
      });

      const request = await upsertBookingRequest("matched");
      await invalidateAgendaAndPaymentsCache(membership.companyId);

      return { success: true, data: { matched: true, appointment, request } };
    }

    let candidate = null as Awaited<ReturnType<typeof findCandidateForDay>> | null;
    if (payload.preferredStartTime && payload.preferredEndTime) {
      const parsedStart = parseTime(payload.preferredStartTime);
      const parsedEnd = parseTime(payload.preferredEndTime);
      if (parsedStart && parsedEnd) {
        candidate = await findCandidateForDay(preferredDateParts, {
          startMinutes: parsedStart.hours * 60 + parsedStart.minutes,
          endMinutes: parsedEnd.hours * 60 + parsedEnd.minutes,
        });
      }
    }

    if (!candidate) {
      candidate = await findCandidateForDay(preferredDateParts);
    }

    if (candidate) {
      const request = await upsertBookingRequest("pending", candidate.start.getTime());

      return {
        success: true,
        data: {
          matched: false,
          request,
          suggestion: { startsAt: candidate.start, endsAt: candidate.end },
        },
      };
    }

    let suggestion: { startsAt: Date; endsAt: Date } | null = null;
    for (let offset = 1; offset <= maxDays; offset += 1) {
      const altDateParts = addDaysToDateParts(preferredDateParts, offset);
      const altCandidate = await findCandidateForDay(altDateParts);
      if (altCandidate) {
        suggestion = { startsAt: altCandidate.start, endsAt: altCandidate.end };
        break;
      }
    }

    const request = await upsertBookingRequest("pending", suggestion?.startsAt.getTime());

    return {
      success: true,
      data: {
        matched: false,
        request,
        suggestion,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getBookingOptions(input: z.infer<typeof bookingOptionsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = bookingOptionsSchema.parse(input);
    const bookingAccess = await ensureStudentCanBookFromApp({
      companyId: membership.companyId,
      membership,
      studentId: payload.studentId,
    });
    if (!bookingAccess.allowed) {
      return { success: false, message: bookingAccess.message };
    }

    const [student, service] = await Promise.all([
      ensureStudentMembership(membership.companyId, payload.studentId),
      prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const policy = parseLessonPolicyFromLimits(limits);
    const bookingSlotDurations = normalizeBookingSlotDurations(
      limits.bookingSlotDurations,
    );
    const governance = await getBookingGovernanceForCompany(membership.companyId);

    const lessonTypeSelectionEnabled = policy.lessonPolicyEnabled;
    let availableLessonTypes: string[] = lessonTypeSelectionEnabled
      ? [...LESSON_POLICY_TYPES]
      : [];

    if (
      lessonTypeSelectionEnabled &&
      policy.lessonRequiredTypesEnabled &&
      policy.lessonRequiredTypes.length
    ) {
      const coverage = await getStudentLessonPolicyCoverage({
        companyId: membership.companyId,
        studentId: payload.studentId,
        policy,
      });
      if (coverage.missingRequiredTypes.length) {
        availableLessonTypes = coverage.missingRequiredTypes;
      }
    }

    const instructorPreferenceEnabled =
      typeof limits.instructorPreferenceEnabled === "boolean"
        ? limits.instructorPreferenceEnabled
        : false;

    // Weekly booking limit info
    const weeklyBookingLimitEnabled = limits.weeklyBookingLimitEnabled === true;
    const weeklyBookingLimit = typeof limits.weeklyBookingLimit === "number" && limits.weeklyBookingLimit >= 1
      ? limits.weeklyBookingLimit
      : 3;
    const examPriorityEnabled = limits.examPriorityEnabled === true;
    const examPriorityLimit =
      typeof limits.examPriorityLimit === "number" && limits.examPriorityLimit >= 1
        ? limits.examPriorityLimit
        : 5;

    let weeklyLimitReached = false;
    let weeklyBookingCount = 0;
    let examPriorityInfo: { active: boolean; examDate: string | null } | null = null;
    let effectiveLimit = weeklyBookingLimit;

    if (weeklyBookingLimitEnabled) {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { companyId: membership.companyId, userId: payload.studentId },
        select: { weeklyBookingLimitExempt: true },
      });
      if (!memberRecord?.weeklyBookingLimitExempt) {
        // Check exam priority
        if (examPriorityEnabled) {
          const { getExamPriorityInfo } = await import("@/lib/autoscuole/exam-priority");
          const info = await getExamPriorityInfo(membership.companyId, payload.studentId);
          examPriorityInfo = { active: info.active, examDate: info.examDate };
          if (info.active) {
            effectiveLimit = examPriorityLimit;
          }
        }

        // Count bookings for current week (Mon-Sun)
        const now = new Date();
        const dayOfWeek = now.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(now);
        weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
        weekStart.setUTCHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

        weeklyBookingCount = await prisma.autoscuolaAppointment.count({
          where: {
            companyId: membership.companyId,
            studentId: payload.studentId,
            status: { notIn: ["cancelled"] },
            startsAt: { gte: weekStart, lt: weekEnd },
          },
        });
        weeklyLimitReached = weeklyBookingCount >= effectiveLimit;
      }
    }

    return {
      success: true,
      data: {
        bookingSlotDurations,
        lessonTypeSelectionEnabled,
        availableLessonTypes,
        studentBookingMode: governance.studentBookingMode,
        instructorPreferenceEnabled,
        weeklyBookingLimit: weeklyBookingLimitEnabled ? {
          enabled: true,
          limit: effectiveLimit,
          current: weeklyBookingCount,
          reached: weeklyLimitReached,
          examPriority: examPriorityInfo,
        } : { enabled: false },
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const availableSlotsSchema = z.object({
  studentId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(30).max(120),
  instructorId: z.string().uuid().optional(),
  lessonType: z.string().optional(),
});

export async function getAllAvailableSlots(input: z.infer<typeof availableSlotsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = availableSlotsSchema.parse(input);
    const bookingAccess = await ensureStudentCanBookFromApp({
      companyId: membership.companyId,
      membership,
      studentId: payload.studentId,
    });
    if (!bookingAccess.allowed) {
      return { success: false, message: bookingAccess.message };
    }

    const now = new Date();
    const durationSlots = payload.durationMinutes / SLOT_MINUTES;
    if (!Number.isInteger(durationSlots) || durationSlots < 1 || durationSlots > 4) {
      return { success: false, message: "Durata non valida." };
    }

    const requestedLessonType = normalizeLessonType(payload.lessonType);
    const requestedPolicyType = isLessonPolicyType(requestedLessonType)
      ? requestedLessonType
      : null;

    const dateParts = parseDateOnly(payload.date);
    if (!dateParts) {
      return { success: false, message: "Data non valida." };
    }
    const dateStart = toTimeZoneDate(dateParts, 0, 0);
    const nowParts = getZonedParts(now);
    const todayStart = toTimeZoneDate(
      { year: nowParts.year, month: nowParts.month, day: nowParts.day },
      0,
      0,
    );
    if (dateStart < todayStart) {
      return { success: false, message: "Non puoi prenotare una guida nel passato." };
    }

    // Check if date is a holiday — use UTC midnight because the column is
    // Postgres DATE and holidays are stored at 00:00 UTC.  Using the
    // timezone-adjusted dateStart (e.g. April 6 22:00 UTC for April 7 CEST)
    // would incorrectly match the previous day's holiday.
    const holidayDate = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
    const isHoliday = await prisma.autoscuolaHoliday.findFirst({
      where: {
        companyId: membership.companyId,
        date: holidayDate,
      },
    });
    if (isHoliday) {
      return { success: true, data: [] };
    }

    const serviceForLimits = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const serviceLimits = (serviceForLimits?.limits ?? {}) as Record<string, unknown>;
    const roundedHoursOnly = serviceLimits.roundedHoursOnly === true;
    const bookingMinStartDate =
      typeof serviceLimits.bookingMinStartDate === "string"
        ? serviceLimits.bookingMinStartDate.trim()
        : null;
    if (bookingMinStartDate) {
      const minDate = new Date(bookingMinStartDate);
      minDate.setHours(0, 0, 0, 0);
      if (dateStart < minDate) {
        return { success: false, message: "Data non disponibile per prenotazioni." };
      }
    }

    // Booking cutoff: block if past the deadline (day before at cutoff time)
    const cutoffEnabled = serviceLimits.bookingCutoffEnabled === true;
    if (cutoffEnabled) {
      const cutoffTime = typeof serviceLimits.bookingCutoffTime === "string"
        ? serviceLimits.bookingCutoffTime
        : "18:00";
      const [cutoffH, cutoffM] = cutoffTime.split(":").map(Number);
      const prevDate = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day - 1));
      const prevParts = { year: prevDate.getUTCFullYear(), month: prevDate.getUTCMonth() + 1, day: prevDate.getUTCDate() };
      const cutoffDeadline = toTimeZoneDate(prevParts, cutoffH, cutoffM);
      if (now >= cutoffDeadline) {
        return {
          success: false,
          message: "Le prenotazioni per questa data sono chiuse dalle " + cutoffTime + " del giorno prima.",
        };
      }
    }

    const allowedDurations = normalizeBookingSlotDurations(serviceLimits.bookingSlotDurations);
    if (!allowedDurations.some((d) => d === payload.durationMinutes)) {
      return { success: false, message: "Durata non disponibile per questa autoscuola." };
    }

    const lessonPolicy = parseLessonPolicyFromLimits(serviceLimits);
    const enforceLessonTypeTimeConstraints = lessonPolicy.lessonPolicyEnabled;
    const enforceRequiredTypes =
      lessonPolicy.lessonPolicyEnabled &&
      lessonPolicy.lessonRequiredTypesEnabled &&
      lessonPolicy.lessonRequiredTypes.length > 0;

    const governance = await getBookingGovernanceForCompany(membership.companyId);
    const filterByStudentAvailability = governance.studentBookingMode === "engine";

    const [
      activeInstructors,
      activeVehicles,
      student,
      studentAvailabilityRaw,
    ] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: {
          companyId: membership.companyId,
          status: { not: "inactive" },
          ...(payload.instructorId ? { id: payload.instructorId } : {}),
        },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      ensureStudentMembership(membership.companyId, payload.studentId),
      filterByStudentAvailability
        ? prisma.autoscuolaWeeklyAvailability.findFirst({
            where: { companyId: membership.companyId, ownerType: "student", ownerId: payload.studentId },
          })
        : Promise.resolve(null),
    ]);

    const studentAvailability = studentAvailabilityRaw
      ? defaultToAvailabilityRecord(studentAvailabilityRaw)
      : null;

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const activeInstructorIds = activeInstructors.map((i) => i.id);
    const activeVehicleIds = activeVehicles.map((v) => v.id);
    if (!activeInstructorIds.length || !activeVehicleIds.length) {
      return { success: true, data: [] };
    }

    const dayOfWeek = getDayOfWeekFromDateParts(dateParts);

    let missingRequiredTypes: string[] = [];
    if (enforceRequiredTypes) {
      const coverage = await getStudentLessonPolicyCoverage({
        companyId: membership.companyId,
        studentId: payload.studentId,
        policy: lessonPolicy,
      });
      missingRequiredTypes = coverage.missingRequiredTypes;
    }

    const rangeStart = dateStart;
    const rangeEnd = toTimeZoneDate(addDaysToDateParts(dateParts, 1), 0, 0);

    const [instructorResolver, vehicleResolver] = await Promise.all([
      buildAvailabilityResolver(
        membership.companyId,
        "instructor",
        activeInstructorIds,
        rangeStart,
        rangeEnd,
      ),
      buildAvailabilityResolver(
        membership.companyId,
        "vehicle",
        activeVehicleIds,
        rangeStart,
        rangeEnd,
      ),
    ]);
    const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        status: { notIn: ["cancelled"] },
        startsAt: { gte: appointmentScanStart, lt: rangeEnd },
      },
    });

    const starts = new Map<string, Set<number>>();
    const intervals = new Map<string, Array<{ start: number; end: number }>>();
    for (const appt of appointments) {
      const start = appt.startsAt.getTime();
      const end = appt.endsAt?.getTime() ?? start + SLOT_MINUTES * 60 * 1000;
      const addInterval = (ownerId: string) => {
        const list = intervals.get(ownerId) ?? [];
        list.push({ start, end });
        intervals.set(ownerId, list);
        const set = starts.get(ownerId) ?? new Set<number>();
        set.add(start);
        starts.set(ownerId, set);
      };
      addInterval(appt.studentId);
      if (appt.instructorId) addInterval(appt.instructorId);
      if (appt.vehicleId) addInterval(appt.vehicleId);
    }

    const overlaps = (
      ownerIntervals: Array<{ start: number; end: number }> | undefined,
      start: number,
      end: number,
    ) => {
      if (!ownerIntervals?.length) return false;
      return ownerIntervals.some((i) => start < i.end && end > i.start);
    };

    const isOwnerAvailable = (
      availability: AvailabilityRecord | null | undefined,
      dow: number,
      startMin: number,
      endMin: number,
    ) => {
      if (!availability) return false;
      if (!availability.daysOfWeek.includes(dow)) return false;
      return availability.ranges.some(
        (r) => r.endMinutes > r.startMinutes && startMin >= r.startMinutes && endMin <= r.endMinutes,
      );
    };

    // When roundedHoursOnly, collect half-hour offsets where at least one
    // instructor's availability range starts at a non-round minute, so we
    // still propose those slots (e.g. 8:30→9:30→10:30 for a 8:30–11:30 range).
    let allowedHalfHourStarts: Set<number> | null = null;
    if (roundedHoursOnly) {
      allowedHalfHourStarts = new Set<number>();
      const probe = toTimeZoneDate(dateParts, 0, 0);
      for (const instrId of activeInstructorIds) {
        const avail = instructorResolver.resolve(instrId, probe);
        if (!avail || !avail.daysOfWeek.includes(dayOfWeek)) continue;
        for (const r of avail.ranges) {
          if (r.startMinutes % 60 !== 0) {
            for (let s = r.startMinutes; s + payload.durationMinutes <= r.endMinutes; s += 60) {
              allowedHalfHourStarts.add(s);
            }
          }
        }
      }
    }

    const result: Array<{ startsAt: string; endsAt: string }> = [];
    const studentIntervals = intervals.get(payload.studentId);

    // Scan the full day (0–1440) — instructor/vehicle availability filters naturally
    const dayLastStart = 1440 - payload.durationMinutes;
    {
      for (let minutes = 0; minutes <= dayLastStart; minutes += SLOT_MINUTES) {
        // When roundedHoursOnly, skip non-round minutes unless explicitly allowed
        if (roundedHoursOnly && minutes % 60 !== 0 && !allowedHalfHourStarts!.has(minutes)) continue;
        const startDate = toTimeZoneDate(dateParts, Math.floor(minutes / 60), minutes % 60);
        const endDate = getSlotEnd(startDate, payload.durationMinutes);
        const startMs = startDate.getTime();
        if (startMs < now.getTime()) continue;
        if (startDate < rangeStart || endDate > rangeEnd) continue;
        if (overlaps(studentIntervals, startMs, endDate.getTime())) continue;

        // In engine mode, filter by student's weekly availability
        if (filterByStudentAvailability) {
          if (!studentAvailability) continue; // no availability configured → no slots
          if (!isOwnerAvailable(studentAvailability, dayOfWeek, minutes, minutes + payload.durationMinutes)) continue;
        }

        if (
          enforceLessonTypeTimeConstraints &&
          requestedPolicyType &&
          !getCompatibleLessonTypesForInterval({
            policy: lessonPolicy,
            startsAt: startDate,
            endsAt: endDate,
            candidateTypes: [requestedPolicyType],
          }).length
        ) {
          continue;
        }

        if (enforceRequiredTypes && missingRequiredTypes.length) {
          const compatibleTypes = getCompatibleLessonTypesForInterval({
            policy: lessonPolicy,
            startsAt: startDate,
            endsAt: endDate,
            candidateTypes: missingRequiredTypes,
          });
          if (!compatibleTypes.length) continue;
          if (requestedPolicyType && !compatibleTypes.includes(requestedPolicyType)) continue;
        }

        const candidateStartMinutes = minutes;
        const candidateEndMinutes = minutes + payload.durationMinutes;

        let hasInstructor = false;
        for (const ownerId of activeInstructorIds) {
          const availability = instructorResolver.resolve(ownerId, startDate);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) continue;
          if (overlaps(intervals.get(ownerId), startMs, endDate.getTime())) continue;
          hasInstructor = true;
          break;
        }
        if (!hasInstructor) continue;

        let hasVehicle = false;
        for (const ownerId of activeVehicleIds) {
          const availability = vehicleResolver.resolve(ownerId, startDate);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) continue;
          if (overlaps(intervals.get(ownerId), startMs, endDate.getTime())) continue;
          hasVehicle = true;
          break;
        }
        if (!hasVehicle) continue;

        result.push({
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
        });
      }
    }

    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const dateAvailabilityMapSchema = z.object({
  studentId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function getDateAvailabilityMap(
  input: z.infer<typeof dateAvailabilityMapSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = dateAvailabilityMapSchema.parse(input);
    const bookingAccess = await ensureStudentCanBookFromApp({
      companyId: membership.companyId,
      membership,
      studentId: payload.studentId,
    });
    if (!bookingAccess.allowed) {
      return { success: false, message: bookingAccess.message };
    }

    const now = new Date();

    const fromParts = parseDateOnly(payload.from);
    const toParts = parseDateOnly(payload.to);
    if (!fromParts || !toParts) {
      return { success: false, message: "Date non valide." };
    }

    // Service limits
    const serviceForLimits = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const serviceLimits = (serviceForLimits?.limits ?? {}) as Record<
      string,
      unknown
    >;
    const bookingMinStartDate =
      typeof serviceLimits.bookingMinStartDate === "string"
        ? serviceLimits.bookingMinStartDate.trim()
        : null;
    const cutoffEnabled = serviceLimits.bookingCutoffEnabled === true;
    const cutoffTime =
      typeof serviceLimits.bookingCutoffTime === "string"
        ? serviceLimits.bookingCutoffTime
        : "18:00";
    const [cutoffH, cutoffM] = cutoffTime.split(":").map(Number);
    const defaultDuration = normalizeBookingSlotDurations(
      serviceLimits.bookingSlotDurations,
    )[0];

    // Governance
    const governance = await getBookingGovernanceForCompany(
      membership.companyId,
    );
    const filterByStudentAvailability =
      governance.studentBookingMode === "engine";

    // Fetch resources in parallel
    const [activeInstructors, activeVehicles, student, studentAvailabilityRaw] =
      await Promise.all([
        prisma.autoscuolaInstructor.findMany({
          where: {
            companyId: membership.companyId,
            status: { not: "inactive" },
          },
          select: { id: true },
        }),
        prisma.autoscuolaVehicle.findMany({
          where: {
            companyId: membership.companyId,
            status: { not: "inactive" },
          },
          select: { id: true },
        }),
        ensureStudentMembership(membership.companyId, payload.studentId),
        filterByStudentAvailability
          ? prisma.autoscuolaWeeklyAvailability.findFirst({
              where: {
                companyId: membership.companyId,
                ownerType: "student",
                ownerId: payload.studentId,
              },
            })
          : Promise.resolve(null),
      ]);

    const studentAvailability = studentAvailabilityRaw
      ? defaultToAvailabilityRecord(studentAvailabilityRaw)
      : null;

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const activeInstructorIds = activeInstructors.map((i) => i.id);
    const activeVehicleIds = activeVehicles.map((v) => v.id);

    const result: Record<string, boolean> = {};
    const instructorsByDate: Record<string, string[]> = {};

    // No resources → all dates unavailable
    if (!activeInstructorIds.length || !activeVehicleIds.length) {
      let cur = { ...fromParts };
      const toMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
      for (;;) {
        const key = `${cur.year}-${String(cur.month).padStart(2, "0")}-${String(cur.day).padStart(2, "0")}`;
        result[key] = false;
        if (Date.UTC(cur.year, cur.month - 1, cur.day) >= toMs) break;
        cur = addDaysToDateParts(cur, 1);
      }
      return { success: true, data: { dates: result, instructorsByDate } };
    }

    // Range for resolvers and appointments
    const rangeStart = toTimeZoneDate(fromParts, 0, 0);
    const rangeEnd = toTimeZoneDate(addDaysToDateParts(toParts, 1), 0, 0);

    // Fetch holidays for the range — use UTC midnight bounds because the
    // column is Postgres DATE and holidays are stored at 00:00 UTC.
    const holidayFrom = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day));
    const holidayTo = new Date(Date.UTC(toParts.year, toParts.month - 1, toParts.day));
    const holidays = await prisma.autoscuolaHoliday.findMany({
      where: {
        companyId: membership.companyId,
        date: { gte: holidayFrom, lte: holidayTo },
      },
      select: { date: true },
    });
    const holidaySet = new Set<string>(
      holidays.map((h) => {
        const d = new Date(h.date);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      }),
    );

    // Build resolvers for the entire range (4 queries total)
    const [instructorResolver, vehicleResolver] = await Promise.all([
      buildAvailabilityResolver(
        membership.companyId,
        "instructor",
        activeInstructorIds,
        rangeStart,
        rangeEnd,
      ),
      buildAvailabilityResolver(
        membership.companyId,
        "vehicle",
        activeVehicleIds,
        rangeStart,
        rangeEnd,
      ),
    ]);

    // Fetch appointments for the entire range (1 query)
    const appointmentScanStart = new Date(
      rangeStart.getTime() - 60 * 60 * 1000,
    );
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        status: { notIn: ["cancelled"] },
        startsAt: { gte: appointmentScanStart, lt: rangeEnd },
      },
    });

    // Build intervals map
    const intervals = new Map<string, Array<{ start: number; end: number }>>();
    for (const appt of appointments) {
      const start = appt.startsAt.getTime();
      const end =
        appt.endsAt?.getTime() ?? start + SLOT_MINUTES * 60 * 1000;
      const addInterval = (ownerId: string) => {
        const list = intervals.get(ownerId) ?? [];
        list.push({ start, end });
        intervals.set(ownerId, list);
      };
      addInterval(appt.studentId);
      if (appt.instructorId) addInterval(appt.instructorId);
      if (appt.vehicleId) addInterval(appt.vehicleId);
    }

    const overlaps = (
      ownerIntervals: Array<{ start: number; end: number }> | undefined,
      candidateStart: number,
      candidateEnd: number,
    ) => {
      if (!ownerIntervals?.length) return false;
      return ownerIntervals.some(
        (i) => candidateStart < i.end && candidateEnd > i.start,
      );
    };

    const isOwnerAvail = (
      availability: AvailabilityRecord | null | undefined,
      dow: number,
      startMin: number,
      endMin: number,
    ) => {
      if (!availability) return false;
      if (!availability.daysOfWeek.includes(dow)) return false;
      return availability.ranges.some(
        (r) =>
          r.endMinutes > r.startMinutes &&
          startMin >= r.startMinutes &&
          endMin <= r.endMinutes,
      );
    };

    const nowParts = getZonedParts(now);
    const todayStart = toTimeZoneDate(
      { year: nowParts.year, month: nowParts.month, day: nowParts.day },
      0,
      0,
    );
    const minDate = bookingMinStartDate
      ? new Date(bookingMinStartDate)
      : null;
    if (minDate) minDate.setHours(0, 0, 0, 0);

    const studentIntervals = intervals.get(payload.studentId);
    const dayLastStart = 1440 - defaultDuration;
    const toMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);

    // ── Per-day scan (in-memory) ──
    let dateParts = { ...fromParts };
    for (;;) {
      const key = `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
      const dateStart = toTimeZoneDate(dateParts, 0, 0);
      const dateEnd = toTimeZoneDate(addDaysToDateParts(dateParts, 1), 0, 0);
      const dayOfWeek = getDayOfWeekFromDateParts(dateParts);

      // Holiday → mark unavailable, skip scan
      if (holidaySet.has(key)) {
        result[key] = false;
        if (Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day) >= toMs)
          break;
        dateParts = addDaysToDateParts(dateParts, 1);
        continue;
      }

      let available = false;
      const dayInstructors = new Set<string>();

      const isPast = dateStart < todayStart;
      const isBeforeMin = minDate !== null && dateStart < minDate;
      let isPastCutoff = false;
      if (cutoffEnabled && !isPast) {
        const prevDate = new Date(
          Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day - 1),
        );
        const prevParts = {
          year: prevDate.getUTCFullYear(),
          month: prevDate.getUTCMonth() + 1,
          day: prevDate.getUTCDate(),
        };
        const cutoffDeadline = toTimeZoneDate(prevParts, cutoffH, cutoffM);
        isPastCutoff = now >= cutoffDeadline;
      }

      if (!isPast && !isBeforeMin && !isPastCutoff) {
        for (
          let minutes = 0;
          minutes <= dayLastStart;
          minutes += SLOT_MINUTES
        ) {
          const startDate = toTimeZoneDate(
            dateParts,
            Math.floor(minutes / 60),
            minutes % 60,
          );
          const endDate = getSlotEnd(startDate, defaultDuration);
          const startMs = startDate.getTime();

          if (startMs < now.getTime()) continue;
          if (startDate < dateStart || endDate > dateEnd) continue;
          if (overlaps(studentIntervals, startMs, endDate.getTime())) continue;

          if (filterByStudentAvailability) {
            if (!studentAvailability) continue;
            if (
              !isOwnerAvail(
                studentAvailability,
                dayOfWeek,
                minutes,
                minutes + defaultDuration,
              )
            )
              continue;
          }

          const candidateEnd = minutes + defaultDuration;

          // Collect ALL available instructors for this slot
          const slotInstructors: string[] = [];
          for (const ownerId of activeInstructorIds) {
            const avail = instructorResolver.resolve(ownerId, startDate);
            if (!isOwnerAvail(avail, dayOfWeek, minutes, candidateEnd))
              continue;
            if (overlaps(intervals.get(ownerId), startMs, endDate.getTime()))
              continue;
            slotInstructors.push(ownerId);
          }
          if (!slotInstructors.length) continue;

          let hasVehicle = false;
          for (const ownerId of activeVehicleIds) {
            const avail = vehicleResolver.resolve(ownerId, startDate);
            if (!isOwnerAvail(avail, dayOfWeek, minutes, candidateEnd))
              continue;
            if (overlaps(intervals.get(ownerId), startMs, endDate.getTime()))
              continue;
            hasVehicle = true;
            break;
          }
          if (!hasVehicle) continue;

          // Valid slot — record available instructors
          available = true;
          for (const id of slotInstructors) dayInstructors.add(id);

          // Short-circuit when all instructors found
          if (dayInstructors.size >= activeInstructorIds.length) break;
        }
      }

      result[key] = available;
      if (dayInstructors.size > 0) {
        instructorsByDate[key] = Array.from(dayInstructors);
      }

      if (Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day) >= toMs)
        break;
      dateParts = addDaysToDateParts(dateParts, 1);
    }

    return {
      success: true,
      data: { dates: result, instructorsByDate, holidays: Array.from(holidaySet) },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function suggestInstructorBooking(
  input: z.infer<typeof instructorBookingSuggestSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = instructorBookingSuggestSchema.parse(input);

    if (membership.role !== "admin" && membership.autoscuolaRole !== "INSTRUCTOR") {
      return { success: false, message: "Operazione consentita solo agli istruttori." };
    }

    const governance = await getBookingGovernanceForCompany(membership.companyId);
    if (
      governance.appBookingActors !== "instructors" &&
      governance.appBookingActors !== "both"
    ) {
      return {
        success: false,
        message: "La prenotazione da app è abilitata solo per allievi.",
      };
    }

    const ownInstructor = await prisma.autoscuolaInstructor.findFirst({
      where: {
        companyId: membership.companyId,
        userId: membership.userId,
        status: { not: "inactive" },
      },
      select: { id: true },
    });
    if (!ownInstructor) {
      return {
        success: false,
        message: "Profilo istruttore non trovato per questo account.",
      };
    }

    const [student, service] = await Promise.all([
      ensureStudentMembership(membership.companyId, payload.studentId),
      prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);
    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const bookingSlotDurations = normalizeBookingSlotDurations(
      limits.bookingSlotDurations,
    );
    const durationMinutes = pickSuggestedDuration(bookingSlotDurations);
    const now = new Date();
    const preferredDate = payload.preferredDate ?? now.toISOString().slice(0, 10);
    const match = await findBestAutoscuolaSlot({
      companyId: membership.companyId,
      studentId: payload.studentId,
      preferredDate,
      durationMinutes,
      maxDays: 7,
      requiredInstructorId: ownInstructor.id,
      now,
    });

    if (!match) {
      return {
        success: false,
        message: "Nessuno slot disponibile al momento per questo allievo.",
      };
    }

    return {
      success: true,
      data: {
        startsAt: match.start,
        endsAt: match.end,
        instructorId: match.instructorId,
        vehicleId: match.vehicleId,
        suggestedLessonType: match.resolvedLessonType,
        durationMinutes,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function respondWaitlistOffer(input: z.infer<typeof respondOfferSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = respondOfferSchema.parse(input);

    const offer = await prisma.autoscuolaWaitlistOffer.findFirst({
      where: { id: payload.offerId, companyId: membership.companyId },
      include: { slot: true },
    });

    if (!offer) {
      return { success: false, message: "Offerta non trovata." };
    }

    const now = new Date();
    if (offer.status !== "broadcasted" || offer.expiresAt < now) {
      return { success: false, message: "Offerta non più valida." };
    }

    const [student, existingResponse, studentAvailabilityRaw, autoscuolaService] = await Promise.all([
      ensureStudentMembership(membership.companyId, payload.studentId),
      prisma.autoscuolaWaitlistResponse.findFirst({
        where: {
          offerId: offer.id,
          studentId: payload.studentId,
        },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "student",
          ownerId: payload.studentId,
        },
      }),
      prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);
    const studentAvailability = studentAvailabilityRaw ? defaultToAvailabilityRecord(studentAvailabilityRaw) : null;
    const lessonPolicy = parseLessonPolicyFromLimits(
      (autoscuolaService?.limits ?? {}) as Record<string, unknown>,
    );
    const enforceRequiredTypes =
      lessonPolicy.lessonPolicyEnabled &&
      lessonPolicy.lessonRequiredTypesEnabled &&
      lessonPolicy.lessonRequiredTypes.length > 0;
    const studentCoverage: {
      activeCaseId: string | null;
      completedTypes: Set<string>;
      missingRequiredTypes: string[];
    } = enforceRequiredTypes
      ? await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: payload.studentId,
          policy: lessonPolicy,
        })
      : {
          activeCaseId: null,
          completedTypes: new Set(),
          missingRequiredTypes: [],
        };
    const missingRequiredTypes = studentCoverage.missingRequiredTypes;

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    if (existingResponse) {
      return { success: false, message: "Hai già risposto a questa offerta." };
    }

    const dayBounds = getDayBoundsForDate(offer.slot.startsAt);
    const studentAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        studentId: payload.studentId,
        status: { not: "cancelled" },
        startsAt: { gte: dayBounds.start, lt: dayBounds.end },
      },
      select: { startsAt: true, endsAt: true },
    });

    if (payload.response === "decline") {
      const response = await prisma.autoscuolaWaitlistResponse.create({
        data: {
          offerId: offer.id,
          studentId: payload.studentId,
          status: "declined",
          respondedAt: now,
        },
      });
      return { success: true, data: { accepted: false, response } };
    }

    if (offer.slot.status !== "open") {
      return { success: false, message: "Slot non disponibile." };
    }

    if (
      !isAvailabilityCovering(
        studentAvailability,
        offer.slot.startsAt,
        offer.slot.endsAt,
      )
    ) {
      return { success: false, message: "Non sei disponibile in questa fascia oraria." };
    }

    if (
      hasAppointmentConflict(
        studentAppointments,
        offer.slot.startsAt,
        offer.slot.endsAt,
      )
    ) {
      return { success: false, message: "Hai già una guida in questa fascia oraria." };
    }
    const compatibleRequiredTypes =
      enforceRequiredTypes && missingRequiredTypes.length
        ? getCompatibleLessonTypesForInterval({
            policy: lessonPolicy,
            startsAt: offer.slot.startsAt,
            endsAt: offer.slot.endsAt,
            candidateTypes: missingRequiredTypes,
          })
        : [];
    if (enforceRequiredTypes && missingRequiredTypes.length && !compatibleRequiredTypes.length) {
      return {
        success: false,
        message: "Questo slot non è compatibile con i tipi guida obbligatori mancanti.",
      };
    }

    const slotTime = offer.slot.startsAt;
    const [instructorSlot, vehicleSlot] = await Promise.all([
      prisma.autoscuolaAvailabilitySlot.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "instructor",
          status: "open",
          startsAt: slotTime,
        },
      }),
      prisma.autoscuolaAvailabilitySlot.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "vehicle",
          status: "open",
          startsAt: slotTime,
        },
      }),
    ]);

    if (!instructorSlot || !vehicleSlot) {
      return { success: false, message: "Slot non disponibile." };
    }

    const appointmentId = randomUUID();
    const appointment = await prisma.$transaction(async (tx) => {
      const response = await tx.autoscuolaWaitlistResponse.create({
        data: {
          offerId: offer.id,
          studentId: payload.studentId,
          status: "accepted",
          respondedAt: now,
        },
      });

      const bookedSlots = await tx.autoscuolaAvailabilitySlot.updateMany({
        where: {
          id: { in: [offer.slotId, instructorSlot.id, vehicleSlot.id] },
          status: "open",
        },
        data: { status: "booked" },
      });
      if (bookedSlots.count < 3) {
        throw new Error("Slot non disponibile.");
      }

      const updatedOffer = await tx.autoscuolaWaitlistOffer.updateMany({
        where: { id: offer.id, status: "broadcasted" },
        data: { status: "accepted" },
      });
      if (!updatedOffer.count) {
        throw new Error("Offerta non più valida.");
      }

      const existingOnSlot = await tx.autoscuolaAppointment.findFirst({
        where: {
          companyId: membership.companyId,
          slotId: offer.slotId,
          status: { notIn: ["cancelled"] },
        },
        select: { id: true },
      });
      if (existingOnSlot) {
        throw new Error("Slot non disponibile.");
      }

      const appointment = await tx.autoscuolaAppointment.create({
        data: {
          id: appointmentId,
          companyId: membership.companyId,
          studentId: payload.studentId,
          type:
            enforceRequiredTypes && compatibleRequiredTypes.length === 1
              ? compatibleRequiredTypes[0]
              : "guida",
          startsAt: offer.slot.startsAt,
          endsAt: offer.slot.endsAt,
          status: "scheduled",
          instructorId: instructorSlot.ownerId,
          vehicleId: vehicleSlot.ownerId,
          slotId: offer.slotId,
          ...(await prepareAppointmentPaymentSnapshot({
            prisma: tx as never,
            companyId: membership.companyId,
            studentId: payload.studentId,
            startsAt: offer.slot.startsAt,
            endsAt: offer.slot.endsAt,
            appointmentId,
            actorUserId: membership.userId,
          })),
        },
      });

      return { appointment, response };
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return {
      success: true,
      data: {
        accepted: true,
        appointment: appointment.appointment,
        response: appointment.response,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getWaitlistOffers(input: z.infer<typeof getWaitlistOffersSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getWaitlistOffersSchema.parse(input);
    const now = new Date();
    const limit = payload.limit ?? 5;

    const student = await ensureStudentMembership(
      membership.companyId,
      payload.studentId,
    );
    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const [studentAvailabilityRaw, offers, appointments, autoscuolaService] = await Promise.all([
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "student",
          ownerId: payload.studentId,
        },
      }),
      prisma.autoscuolaWaitlistOffer.findMany({
        where: {
          companyId: membership.companyId,
          status: "broadcasted",
          expiresAt: { gt: now },
          slot: {
            startsAt: { gt: now },
            status: "open",
          },
        },
        include: {
          slot: true,
          responses: {
            where: { studentId: payload.studentId },
            select: { id: true },
          },
        },
        orderBy: { sentAt: "desc" },
        take: limit * 3,
      }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          status: { not: "cancelled" },
          startsAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { startsAt: true, endsAt: true },
      }),
      prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);
    const lessonPolicy = parseLessonPolicyFromLimits(
      (autoscuolaService?.limits ?? {}) as Record<string, unknown>,
    );
    const enforceRequiredTypes =
      lessonPolicy.lessonPolicyEnabled &&
      lessonPolicy.lessonRequiredTypesEnabled &&
      lessonPolicy.lessonRequiredTypes.length > 0;
    const studentCoverage: {
      activeCaseId: string | null;
      completedTypes: Set<string>;
      missingRequiredTypes: string[];
    } = enforceRequiredTypes
      ? await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: payload.studentId,
          policy: lessonPolicy,
        })
      : {
          activeCaseId: null,
          completedTypes: new Set(),
          missingRequiredTypes: [],
        };
    const missingRequiredTypes = studentCoverage.missingRequiredTypes;

    const studentAvailability = studentAvailabilityRaw ? defaultToAvailabilityRecord(studentAvailabilityRaw) : null;
    if (!studentAvailability) {
      return { success: true, data: [] };
    }

    const visible = offers
      .filter((offer) => !offer.responses.length)
      .filter((offer) =>
        isAvailabilityCovering(
          studentAvailability,
          offer.slot.startsAt,
          offer.slot.endsAt,
        ),
      )
      .filter(
        (offer) =>
          !hasAppointmentConflict(
            appointments,
            offer.slot.startsAt,
            offer.slot.endsAt,
          ),
      )
      .filter((offer) => {
        if (!enforceRequiredTypes || !missingRequiredTypes.length) return true;
        const compatible = getCompatibleLessonTypesForInterval({
          policy: lessonPolicy,
          startsAt: offer.slot.startsAt,
          endsAt: offer.slot.endsAt,
          candidateTypes: missingRequiredTypes,
        });
        return compatible.length > 0;
      })
      .slice(0, limit)
      .map(({ responses: _responses, ...offer }) => offer);

    return { success: true, data: visible };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function broadcastWaitlistOffer({
  companyId,
  slotId,
  startsAt,
  expiresAt,
  excludeStudentIds = [],
}: {
  companyId: string;
  slotId: string;
  startsAt: Date;
  expiresAt: Date;
  excludeStudentIds?: string[];
}) {
  const offer = await prisma.autoscuolaWaitlistOffer.create({
    data: {
      companyId,
      slotId,
      status: "broadcasted",
      sentAt: new Date(),
      expiresAt,
    },
  });

  const excludedStudentIds = Array.from(new Set(excludeStudentIds));
  if (excludedStudentIds.length) {
    await prisma.autoscuolaWaitlistResponse.createMany({
      data: excludedStudentIds.map((studentId) => ({
        offerId: offer.id,
        studentId,
        status: "declined",
        respondedAt: new Date(),
      })),
    });
  }

  const slot = await prisma.autoscuolaAvailabilitySlot.findFirst({
    where: {
      id: slotId,
      companyId,
    },
  });
  if (!slot) return offer;

  const dayBounds = getDayBoundsForDate(slot.startsAt);

  const students = await prisma.companyMember.findMany({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
      ...(excludedStudentIds.length ? { userId: { notIn: excludedStudentIds } } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
        },
      },
    },
  });
  if (!students.length) return offer;

  const studentIds = students.map((student) => student.user.id);
  const [availabilities, appointments, service] = await Promise.all([
    prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId,
        ownerType: "student",
        ownerId: { in: studentIds },
      },
    }),
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        status: { not: "cancelled" },
        startsAt: { gte: dayBounds.start, lt: dayBounds.end },
      },
      select: {
        studentId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    }),
  ]);

  const availabilityByStudent = new Map<string, AvailabilityRecord>(
    availabilities.map((availability) => [availability.ownerId, defaultToAvailabilityRecord(availability)]),
  );
  const appointmentsByStudent = new Map<
    string,
    Array<{ startsAt: Date; endsAt: Date | null }>
  >();
  for (const appointment of appointments) {
    const list = appointmentsByStudent.get(appointment.studentId) ?? [];
    list.push({ startsAt: appointment.startsAt, endsAt: appointment.endsAt });
    appointmentsByStudent.set(appointment.studentId, list);
  }

  const availableStudents = students.filter((student) => {
    const availability = availabilityByStudent.get(student.user.id);
    if (!isAvailabilityCovering(availability, slot.startsAt, slot.endsAt)) {
      return false;
    }
    const booked = appointmentsByStudent.get(student.user.id) ?? [];
    return !hasAppointmentConflict(booked, slot.startsAt, slot.endsAt);
  });
  if (!availableStudents.length) return offer;

  const channels = normalizeChannels(
    (service?.limits as Record<string, unknown> | null)?.slotFillChannels,
    DEFAULT_SLOT_FILL_CHANNELS,
  );

  const formattedDate = slot.startsAt.toLocaleDateString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
  });
  const formattedTime = slot.startsAt.toLocaleTimeString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  const message = `Si e liberato uno slot guida il ${formattedDate} alle ${formattedTime}. Apri Reglo per accettare o rifiutare la proposta.`;
  const title = "Reglo Autoscuole · Slot guida disponibile";

  if (channels.includes("push")) {
    const studentUserIds = Array.from(
      new Set(availableStudents.map((student) => student.user.id)),
    );

    if (studentUserIds.length) {
      try {
        await sendAutoscuolaPushToUsers({
          companyId,
          userIds: studentUserIds,
          title,
          body: message,
          data: {
            kind: "slot_fill_offer",
            offerId: offer.id,
            slotId: slot.id,
            startsAt: slot.startsAt.toISOString(),
          },
        });
      } catch (error) {
        console.error("Waitlist push error", error);
      }
    }
  }

  for (const student of availableStudents) {
    if (channels.includes("email")) {
      try {
        if (student.user.email) {
          await sendDynamicEmail({
            to: student.user.email,
            subject: title,
            body: message,
          });
        }
      } catch (error) {
        console.error("Waitlist email error", error);
      }
    }

    if (channels.includes("whatsapp")) {
      try {
        if (student.user.phone) {
          await sendAutoscuolaWhatsApp({ to: student.user.phone, body: message });
        }
      } catch (error) {
        console.error("Waitlist WhatsApp error", error);
      }
    }
  }

  return offer;
}

// ── Out-of-availability detection & override approval ─────────────────

const getOutOfAvailabilitySchema = z.object({
  instructorId: z.string().uuid().optional(),
});

export async function getOutOfAvailabilityAppointments(
  input?: z.infer<typeof getOutOfAvailabilitySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getOutOfAvailabilitySchema.parse(input ?? {});
    const companyId = membership.companyId;

    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: false,
        ...(payload.instructorId ? { instructorId: payload.instructorId } : {}),
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        type: true,
        status: true,
        instructorId: true,
        vehicleId: true,
        student: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true } },
        vehicle: { select: { id: true, name: true, plate: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 200,
    });

    if (!appointments.length) {
      return { success: true as const, data: [] };
    }

    // Collect unique instructor/vehicle IDs
    const instructorIds = [...new Set(appointments.map((a) => a.instructorId).filter(Boolean))] as string[];
    const vehicleIds = [...new Set(appointments.map((a) => a.vehicleId).filter(Boolean))] as string[];
    const earliest = appointments[0].startsAt;
    const latest = appointments[appointments.length - 1].startsAt;

    // Build resolvers for instructors and vehicles
    const [instructorResolver, vehicleResolver] = await Promise.all([
      instructorIds.length
        ? buildAvailabilityResolver(companyId, "instructor", instructorIds, earliest, latest)
        : null,
      vehicleIds.length
        ? buildAvailabilityResolver(companyId, "vehicle", vehicleIds, earliest, latest)
        : null,
    ]);

    const results: Array<{
      id: string;
      startsAt: Date;
      endsAt: Date;
      type: string;
      status: string;
      studentName: string;
      instructorName: string | null;
      vehicleName: string | null;
      outOfAvailabilityFor: ("instructor" | "vehicle")[];
    }> = [];

    for (const apt of appointments) {
      const end = apt.endsAt ?? getSlotEnd(apt.startsAt, SLOT_MINUTES);
      const outOf: ("instructor" | "vehicle")[] = [];

      if (apt.instructorId && instructorResolver) {
        const avail = instructorResolver.resolve(apt.instructorId, apt.startsAt);
        if (!isAvailabilityCovering(avail, apt.startsAt, end)) {
          outOf.push("instructor");
        }
      }

      if (apt.vehicleId && vehicleResolver) {
        const avail = vehicleResolver.resolve(apt.vehicleId, apt.startsAt);
        if (!isAvailabilityCovering(avail, apt.startsAt, end)) {
          outOf.push("vehicle");
        }
      }

      if (outOf.length > 0) {
        results.push({
          id: apt.id,
          startsAt: apt.startsAt,
          endsAt: end,
          type: apt.type,
          status: apt.status,
          studentName: apt.student?.name ?? "Senza nome",
          instructorName: apt.instructor?.name ?? null,
          vehicleName: apt.vehicle
            ? `${apt.vehicle.name}${apt.vehicle.plate ? ` (${apt.vehicle.plate})` : ""}`
            : null,
          outOfAvailabilityFor: outOf,
        });
      }
    }

    return { success: true as const, data: results };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const approveOverrideSchema = z.object({
  appointmentId: z.string().uuid(),
});

export async function approveAvailabilityOverride(
  input: z.infer<typeof approveOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const { appointmentId } = approveOverrideSchema.parse(input);

    await prisma.autoscuolaAppointment.update({
      where: { id: appointmentId, companyId: membership.companyId },
      data: { availabilityOverrideApproved: true },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function getStudentBookingBlockStatus(
  companyId: string,
  studentId: string,
): Promise<boolean> {
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId: studentId, autoscuolaRole: "STUDENT" },
    select: { bookingBlocked: true },
  });
  return member?.bookingBlocked ?? false;
}
