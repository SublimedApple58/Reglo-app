"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { Prisma } from "@prisma/client";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { sendAutoscuolaWhatsApp } from "@/lib/autoscuole/whatsapp";
import { BOOKING_SOURCE } from "@/lib/autoscuole/booking-source";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  prepareAppointmentPaymentSnapshot,
  getGroupLessonPenaltySnapshot,
} from "@/lib/autoscuole/payments";
import {
  getBookingGovernanceForInstructor,
  isStudentAppBookingEnabled,
  parseBookingGovernanceFromLimits,
} from "@/lib/autoscuole/booking-governance";
import { isInstructor, isOwner } from "@/lib/autoscuole/roles";
import { findBestAutoscuolaSlot } from "@/lib/autoscuole/slot-matcher";
import {
  buildVehicleResolutionMaps,
  pickBestInstructorVehicleSet,
  resolveVehiclesForInstructor,
} from "@/lib/autoscuole/vehicle-resolution";
import { vehicleServesLicense } from "@/lib/autoscuole/license";
import { assignMotoForStudent, eligibleForMotoGroup, groupMotoFollowCarRequired, type FleetVehicle } from "@/lib/autoscuole/group-moto";
import { findFreeGroupFollowCar } from "@/lib/autoscuole/group-follow-assign";
import {
  FOLLOW_CAR_CATEGORY,
  isFollowCarVehicle,
  parseFollowCarRulesFromLimits,
  requiresFollowCar,
} from "@/lib/autoscuole/follow-car";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  invalidateAutoscuoleCache,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  getCachedCompanyServiceLimits,
  getCachedHolidays,
} from "@/lib/autoscuole/cached-service";
import {
  resolveEffectiveBookingSettings,
  buildCompanyBookingDefaults,
} from "@/lib/autoscuole/instructor-clusters";
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
import {
  computeAnchorAwareEntryPoints,
  computeFreeIntervalsInRange,
} from "@/lib/autoscuole/slot-packing";
import {
  addGroupLessonBusyIntervals,
  fetchGroupLessonBusyRows,
} from "@/lib/autoscuole/group-lesson-busy";
import {
  buildSlotAssignmentContext,
  resolveSlotAssignmentForStudent,
} from "@/lib/autoscuole/slot-assignment";

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
  // Per-weekday schedule: { "1": [{startMinutes,endMinutes}], ... }. When present
  // it is authoritative; the flat daysOfWeek/ranges/startsAt fields are derived
  // from a representative day for legacy/back-compat consumers.
  scheduleByDay: z.record(
    z.string().regex(/^[0-6]$/),
    z.array(z.object({
      startMinutes: z.number().int().min(0).max(1440),
      endMinutes: z.number().int().min(0).max(1440),
    })),
  ).optional(),
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
  // Optional inclusive date range. When both are provided, slots for every
  // day in [from, to] are returned in a single response (mobile uses this to
  // fetch a whole week in one call instead of one request per day).
  from: z.string().optional(),
  to: z.string().optional(),
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
const DURATION_PRIORITY = [60, 45, 30, 90, 120] as const;
const DEFAULT_SLOT_FILL_CHANNELS = ["push", "whatsapp", "email"] as const;
const AUTOSCUOLA_TIMEZONE = "Europe/Rome";
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
  // When present, ranges differ per weekday (0=Sun..6=Sat) and take precedence
  // over the flat `ranges` field. `rangesForDay()` is the single read accessor.
  rangesByDay?: Record<number, TimeRange[]>;
};

const parseRanges = (raw: unknown): TimeRange[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is TimeRange =>
      typeof e === "object" && e !== null &&
      typeof e.startMinutes === "number" && typeof e.endMinutes === "number",
  );
};

// Parse the `rangesByDay` JSON ({ "1": [...], ... }) into a {dayOfWeek: ranges}
// map, keeping only days that have at least one valid range. Returns null when
// absent/empty so callers fall back to the shared `ranges`.
const parseRangesByDay = (raw: unknown): Record<number, TimeRange[]> | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const map: Record<number, TimeRange[]> = {};
  let any = false;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const ranges = parseRanges(v).filter((r) => r.endMinutes > r.startMinutes);
    if (ranges.length) {
      map[day] = ranges;
      any = true;
    }
  }
  return any ? map : null;
};

// Single accessor for "what ranges apply on this weekday" — handles both the
// per-day model and the legacy shared model transparently.
const rangesForDay = (a: AvailabilityRecord, dayOfWeek: number): TimeRange[] => {
  if (a.rangesByDay) return a.rangesByDay[dayOfWeek] ?? [];
  return a.daysOfWeek.includes(dayOfWeek) ? a.ranges : [];
};

// Narrow a (possibly per-day) record down to a single date's effective ranges,
// shaped exactly like the legacy resolved record so every existing consumer
// (isOwnerAvailable / isAvailabilityCovering copies) keeps working unchanged.
const narrowToDay = (a: AvailabilityRecord, dayOfWeek: number): AvailabilityRecord => {
  const ranges = rangesForDay(a, dayOfWeek);
  return { daysOfWeek: ranges.length ? [dayOfWeek] : [], ranges };
};

const defaultToAvailabilityRecord = (record: { daysOfWeek: number[]; startMinutes: number; endMinutes: number; startMinutes2?: number | null; endMinutes2?: number | null; ranges?: unknown; rangesByDay?: unknown }): AvailabilityRecord => {
  const rangesByDay = parseRangesByDay(record.rangesByDay);
  if (rangesByDay) {
    // daysOfWeek = days that actually have ranges; flat `ranges` left empty (the
    // per-day map is authoritative and read via rangesForDay()).
    return { daysOfWeek: Object.keys(rangesByDay).map(Number).sort((a, b) => a - b), ranges: [], rangesByDay };
  }
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
  return narrowToDay(defaultToAvailabilityRecord(base), dayOfWeek);
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
      const base = defaultMap.get(ownerId);
      return base ? narrowToDay(base, dayOfWeek) : null;
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
  const dayRanges = rangesForDay(availability, dayOfWeek);
  if (!dayRanges.length) return false;
  const startMin = minutesFromDate(startsAt);
  const endMin = minutesFromDate(endsAt);
  return dayRanges.some(
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
    select: { userId: true, licenseCategory: true, transmission: true },
  });

/** The student's pursued license (category + transmission), used to filter vehicles. */
const getStudentLicense = async (companyId: string, studentId: string) =>
  prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId: studentId } },
    select: { licenseCategory: true, transmission: true },
  });

/**
 * Build the `matchesLicenseCategory(vehicleId)` predicate for the slot matcher:
 * a vehicle is eligible only if its category+transmission serve the student's
 * pursued license. Null on either side is permissive (see vehicleServesLicense).
 */
const buildMatchesLicenseCategory = (
  activeVehicles: Array<{
    id: string;
    licenseCategory?: string | null;
    transmission?: string | null;
  }>,
  student: { licenseCategory?: string | null; transmission?: string | null } | null,
) => {
  const byId = new Map(activeVehicles.map((v) => [v.id, v]));
  return (vehicleId: string) => {
    const vehicle = byId.get(vehicleId);
    if (!vehicle) return false;
    return vehicleServesLicense(vehicle, student ?? {});
  };
};

const buildMatchesFollowCar = (
  activeVehicles: Array<{ id: string; licenseCategory?: string | null }>,
) => {
  const byId = new Map(activeVehicles.map((v) => [v.id, v]));
  return (vehicleId: string) => {
    const vehicle = byId.get(vehicleId);
    if (!vehicle) return false;
    return isFollowCarVehicle(vehicle);
  };
};

const ensureStudentCanBookFromApp = async ({
  companyId,
  membership,
  studentId,
}: {
  companyId: string;
  membership: { role: string; autoscuolaRole: string | null; userId: string };
  studentId: string;
}) => {
  if (membership.role === "admin" || isOwner(membership.autoscuolaRole)) {
    return { allowed: true as const, settings: null, limits: null };
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

  // Read the membership row (block + phase gate) and the service limits in
  // parallel — they are independent.
  //   AWAITING → l'autoscuola non ha ancora attivato il percorso
  //   TEORIA   → ha il modulo quiz ma non ha ancora il foglio rosa
  // PRATICA e PATENTATO sono entrambi ammessi per coerenza.
  const [studentMembership, limits] = await Promise.all([
    prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: studentId,
        autoscuolaRole: "STUDENT",
      },
      select: { bookingBlocked: true, studentPhase: true },
    }),
    getCachedCompanyServiceLimits(companyId),
  ]);
  if (studentMembership?.bookingBlocked) {
    return {
      allowed: false as const,
      message:
        "Le tue prenotazioni sono temporaneamente sospese. Contatta la segreteria.",
    };
  }
  if (studentMembership?.studentPhase === "AWAITING") {
    return {
      allowed: false as const,
      message:
        "Il tuo percorso non è ancora stato attivato dall'autoscuola.",
    };
  }
  if (studentMembership?.studentPhase === "TEORIA") {
    return {
      allowed: false as const,
      message:
        "Le lezioni di guida saranno disponibili dopo l'esame di teoria.",
    };
  }

  // Resolve cluster-aware governance (instructor cluster override → company default).
  const effective = await resolveEffectiveBookingSettings(companyId, studentId, buildCompanyBookingDefaults(limits));
  const effectiveActors = effective.appBookingActors;
  if (effectiveActors === "instructors") {
    return {
      allowed: false as const,
      message: "La prenotazione da app è abilitata solo per istruttori.",
    };
  }
  // Return the resolved cluster settings AND limits so the caller can reuse
  // them instead of fetching/resolving a second time.
  return { allowed: true as const, settings: effective, limits };
};

export async function createAvailabilitySlots(input: z.infer<typeof slotSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = slotSchema.parse(input);
    const start = new Date(payload.startsAt);
    const end = new Date(payload.endsAt);
    const daysOfWeek = normalizeDays(payload.daysOfWeek);

    if (!daysOfWeek.length && !payload.scheduleByDay) {
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

    // ── Per-weekday schedule (authoritative when provided) ──
    // When `scheduleByDay` is present it is persisted to `rangesByDay` and the
    // flat fields below are derived from the first active day so legacy readers
    // still get a sensible representative. When absent, `rangesByDay` is cleared
    // (a shared-hours save reverts the record to the legacy model).
    let rangesByDayJson: Record<string, TimeRange[]> | null = null;
    let finalDaysOfWeek = daysOfWeek;
    let finalRanges = ranges;
    let finalStartMinutes = startMinutes;
    let finalEndMinutes = endMinutes;
    let finalStartMinutes2 = startMinutes2;
    let finalEndMinutes2 = endMinutes2;

    if (payload.scheduleByDay) {
      const map: Record<string, TimeRange[]> = {};
      const activeDays: number[] = [];
      for (const [k, v] of Object.entries(payload.scheduleByDay)) {
        const dayRanges = (v as TimeRange[]).filter((r) => r.endMinutes > r.startMinutes);
        if (dayRanges.length) {
          map[k] = dayRanges;
          activeDays.push(Number(k));
        }
      }
      if (!activeDays.length) {
        return { success: false, message: "Seleziona almeno un giorno." };
      }
      activeDays.sort((a, b) => a - b);
      const rep = map[String(activeDays[0])];
      rangesByDayJson = map;
      finalDaysOfWeek = activeDays;
      finalRanges = rep;
      finalStartMinutes = rep[0].startMinutes;
      finalEndMinutes = rep[0].endMinutes;
      finalStartMinutes2 = rep[1]?.startMinutes ?? null;
      finalEndMinutes2 = rep[1]?.endMinutes ?? null;
    }

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId: membership.companyId,
          ownerType: payload.ownerType,
          ownerId: payload.ownerId,
        },
      },
      update: {
        daysOfWeek: finalDaysOfWeek,
        startMinutes: finalStartMinutes,
        endMinutes: finalEndMinutes,
        startMinutes2: finalStartMinutes2,
        endMinutes2: finalEndMinutes2,
        ranges: finalRanges,
        rangesByDay: rangesByDayJson ?? Prisma.DbNull,
      },
      create: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        daysOfWeek: finalDaysOfWeek,
        startMinutes: finalStartMinutes,
        endMinutes: finalEndMinutes,
        startMinutes2: finalStartMinutes2,
        endMinutes2: finalEndMinutes2,
        ranges: finalRanges,
        rangesByDay: rangesByDayJson ?? Prisma.DbNull,
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

    const isoFor = (p: CalendarDateParts) =>
      `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;

    // Resolve the list of days to compute: either a single `date` (legacy) or
    // an inclusive `from`..`to` range (capped at 31 days).
    let dayPartsList: CalendarDateParts[] = [];
    if (payload.from && payload.to) {
      const fromParts = parseDateOnly(payload.from);
      const toParts = parseDateOnly(payload.to);
      if (!fromParts || !toParts) {
        return { success: false, message: "Intervallo date non valido." };
      }
      const cursor = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day));
      const end = new Date(Date.UTC(toParts.year, toParts.month - 1, toParts.day));
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard < 31) {
        dayPartsList.push({
          year: cursor.getUTCFullYear(),
          month: cursor.getUTCMonth() + 1,
          day: cursor.getUTCDate(),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        guard += 1;
      }
    } else if (payload.date) {
      const dayParts = parseDateOnly(payload.date);
      if (!dayParts) {
        return { success: false, message: "Data non valida." };
      }
      dayPartsList = [dayParts];
    }

    if (dayPartsList.length === 0) {
      return { success: true, data: [] };
    }

    const availabilityWhere: Record<string, unknown> = {
      companyId: membership.companyId,
    };
    if (payload.ownerType) availabilityWhere.ownerType = payload.ownerType;
    if (payload.ownerId) availabilityWhere.ownerId = payload.ownerId;

    // Fetch base availabilities once for the whole range.
    const baseAvailabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
      where: availabilityWhere,
    });

    // Fetch every daily override spanning the range in a single query.
    const firstISO = isoFor(dayPartsList[0]);
    const lastISO = isoFor(dayPartsList[dayPartsList.length - 1]);
    const overrideWhere: Record<string, unknown> = {
      companyId: membership.companyId,
      date:
        dayPartsList.length === 1
          ? new Date(firstISO + "T00:00:00Z")
          : {
              gte: new Date(firstISO + "T00:00:00Z"),
              lte: new Date(lastISO + "T00:00:00Z"),
            },
    };
    if (payload.ownerType) overrideWhere.ownerType = payload.ownerType;
    if (payload.ownerId) overrideWhere.ownerId = payload.ownerId;

    const overrides = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
      where: overrideWhere,
    });

    // Index overrides by their date (YYYY-MM-DD) for per-day lookups.
    type OverrideRow = (typeof overrides)[number];
    const overridesByDate = new Map<string, OverrideRow[]>();
    for (const o of overrides) {
      const dateKey = o.date.toISOString().slice(0, 10);
      const arr = overridesByDate.get(dateKey);
      if (arr) arr.push(o);
      else overridesByDate.set(dateKey, [o]);
    }

    type SlotAvailability = AvailabilityRecord & { ownerType: string; ownerId: string };
    const slots: Array<{
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

    for (const dayParts of dayPartsList) {
      const dayOfWeek = getDayOfWeekFromDateParts(dayParts);
      const dayOverrides = overridesByDate.get(isoFor(dayParts)) ?? [];

      // Build a map: ownerKey → AvailabilityRecord resolved for this day.
      const overrideByOwner = new Map<string, AvailabilityRecord>();
      for (const o of dayOverrides) {
        const key = `${o.ownerType}:${o.ownerId}`;
        overrideByOwner.set(key, { daysOfWeek: [dayOfWeek], ranges: parseRanges(o.ranges) });
      }

      // Merge: override wins over base; base converted otherwise.
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
      // Override-only owners (no base record).
      for (const o of dayOverrides) {
        const key = `${o.ownerType}:${o.ownerId}`;
        if (!seenOwners.has(key)) {
          const entry = overrideByOwner.get(key);
          if (entry) {
            availabilities.push({ ...entry, ownerType: o.ownerType, ownerId: o.ownerId });
          }
        }
      }

      for (const availability of availabilities) {
        const dayRanges = rangesForDay(availability, dayOfWeek);
        if (!dayRanges.length) continue;
        for (const range of dayRanges) {
          if (range.endMinutes <= range.startMinutes) continue;
          const startMinutes = Math.ceil(range.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
          const lastStart = range.endMinutes - SLOT_MINUTES;
          for (let minutes = startMinutes; minutes <= lastStart; minutes += SLOT_MINUTES) {
            const startsAt = toTimeZoneDate(dayParts, Math.floor(minutes / 60), minutes % 60);
            const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
            slots.push({
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
      }
    }

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

    const resolved = defaultToAvailabilityRecord(record);
    // Always expose a per-day map so the mobile editor can paint per-weekday
    // rows. Legacy records (no rangesByDay) are projected by applying the shared
    // ranges to each active day.
    const scheduleByDay: Record<number, TimeRange[]> =
      resolved.rangesByDay ??
      Object.fromEntries(resolved.daysOfWeek.map((d) => [d, resolved.ranges]));

    return {
      success: true,
      data: { daysOfWeek: resolved.daysOfWeek, ranges: resolved.ranges, scheduleByDay },
    };
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
  // Anchor date ("YYYY-MM-DD"): first occurrence is the target dayOfWeek ON or
  // AFTER this date. The web dialog passes the calendar day the user selected,
  // so "ricorrente" starts from THAT day — not from the nearest occurrence to
  // today (selecting Sat 20 must not also write Sat 13). Optional: mobile
  // callers pick only a weekday, so they keep anchoring from today.
  fromDate: z.string().optional(),
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

    // The UI presents this as "applica a tutti i [giorno] futuri", so cover a
    // full year by default. The old default (company `availabilityWeeks`,
    // typically 4) created a ROLLING GAP: the booking horizon advances every
    // day, while the override coverage stayed frozen at save-time + 4 weeks —
    // dates beyond it silently fell back to the (often stale) weekly base, and
    // the school read it as "gli orari non si salvano" / "prenotazioni in
    // orari non disponibili" (Robatto, 2026-06-12).
    const weeks = payload.weeksAhead ?? 52;

    // Generate dates for the target dayOfWeek for the next N weeks.
    // Anchor = the selected calendar day when provided (clamped to today so a
    // past selection can never write past dates), otherwise today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let anchor = today;
    if (payload.fromDate) {
      const fd = new Date(`${payload.fromDate.slice(0, 10)}T00:00:00.000Z`);
      if (!Number.isNaN(fd.getTime()) && fd.getTime() > today.getTime()) anchor = fd;
    }
    const currentDay = anchor.getUTCDay();
    let daysUntilTarget = payload.dayOfWeek - currentDay;
    if (daysUntilTarget < 0) daysUntilTarget += 7;
    const firstDate = new Date(anchor.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);

    const dates: Date[] = [];
    for (let w = 0; w < weeks; w++) {
      dates.push(new Date(firstDate.getTime() + w * 7 * 24 * 60 * 60 * 1000));
    }

    // Upsert override for each date (batched in one transaction — with 52
    // weeks this is too many round-trips for a Promise.all of upserts).
    await prisma.$transaction(
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

    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        ...ownerField,
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
        OR: dates.map((date) => ({
          startsAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        })),
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

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
    if (payload.durationMinutes < 30 || payload.durationMinutes > 120 || payload.durationMinutes % 15 !== 0) {
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
          timeZone: "Europe/Rome",
        });
        return {
          success: false,
          message: `Le prenotazioni sono aperte a partire dal ${formatted}.`,
        };
      }
    }

    const maxDays = payload.maxDays ?? DEFAULT_MAX_DAYS;
    // Resolve cluster settings FIRST so we can force instructor filter when student is locked to a cluster
    const autoscuolaServicePre = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const preServiceLimits = (autoscuolaServicePre?.limits ?? {}) as Record<string, unknown>;
    const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import("@/lib/autoscuole/instructor-clusters");
    const clusterBookingSettings = await resolveEffectiveBookingSettings(
      membership.companyId,
      payload.studentId,
      buildCompanyBookingDefaults(preServiceLimits),
    );

    // Booking cutoff: block if past the deadline (day before at cutoff time).
    // Uses cluster-resolved settings (cluster overrides company).
    if (clusterBookingSettings.bookingCutoffEnabled) {
      const cutoffTime = clusterBookingSettings.bookingCutoffTime;
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

    // If student is locked to a cluster instructor, ALWAYS use that instructor
    const effectiveInstructorId = clusterBookingSettings.isLockedToInstructor && clusterBookingSettings.assignedInstructorId
      ? clusterBookingSettings.assignedInstructorId
      : payload.instructorId;
    const [
      activeInstructors,
      activeVehicles,
      vehiclePoolMembers,
      instructorPreferredVehicles,
      studentAvailabilityRaw,
      studentLicense,
    ] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: {
          companyId: membership.companyId,
          status: { not: "inactive" },
          ...(effectiveInstructorId ? { id: effectiveInstructorId } : {}),
        },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: "active" },
        select: {
          id: true,
          assignedInstructorId: true,
          followsInstructorAvailability: true,
          licenseCategory: true,
          transmission: true,
        },
      }),
      prisma.autoscuolaVehiclePoolMember.findMany({
        where: { vehicle: { companyId: membership.companyId } },
        select: { vehicleId: true, instructorId: true },
      }),
      prisma.autoscuolaInstructorPreferredVehicle.findMany({
        where: { instructor: { companyId: membership.companyId } },
        select: { instructorId: true, licenseCategory: true, vehicleId: true },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId: membership.companyId,
          ownerType: "student",
          ownerId: payload.studentId,
        },
      }),
      getStudentLicense(membership.companyId, payload.studentId),
    ]);
    const autoscuolaService = autoscuolaServicePre;
    const studentAvailability = studentAvailabilityRaw ? defaultToAvailabilityRecord(studentAvailabilityRaw) : null;
    const lessonPolicy = parseLessonPolicyFromLimits(
      (autoscuolaService?.limits ?? {}) as Record<string, unknown>,
    );
    const allowedDurations = clusterBookingSettings.bookingSlotDurations;
    if (!allowedDurations.some((duration) => duration === payload.durationMinutes)) {
      return {
        success: false,
        message: "Durata non disponibile per questa autoscuola.",
      };
    }

    // Exam priority per-day block is checked AFTER candidate resolution,
    // using the candidate's actual day (see checkExamPriorityDayBlock below).
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
    const vehiclesEnabled = preServiceLimits.vehiclesEnabled !== false;
    const activeInstructorIds = activeInstructors.map((item) => item.id);
    const activeVehicleIds = vehiclesEnabled ? activeVehicles.map((item) => item.id) : [];
    const vehicleResolutionMaps = buildVehicleResolutionMaps({
      vehicles: activeVehicles,
      poolMembers: vehiclePoolMembers,
      preferred: instructorPreferredVehicles,
    });
    const matchesLicenseCategory = buildMatchesLicenseCategory(activeVehicles, studentLicense);
    const followCarRules = parseFollowCarRulesFromLimits(preServiceLimits);
    const requireFollowCar =
      vehiclesEnabled && requiresFollowCar(followCarRules, studentLicense?.licenseCategory ?? null);
    const matchesFollowCar = buildMatchesFollowCar(activeVehicles);

    const resolverRangeStart = preferredDate;
    const resolverRangeEnd = toTimeZoneDate(
      addDaysToDateParts(preferredDateParts, (payload.maxDays ?? DEFAULT_MAX_DAYS) + 1),
      0,
      0,
    );

    // Publication mode gating
    const pubFilter = await getPublicationModeFilter(
      membership.companyId,
      activeInstructorIds,
      resolverRangeStart,
      resolverRangeEnd,
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
        // Null only for studentless exam placeholders — they still reserve the
        // instructor/vehicle but have no student interval to record.
        studentId: string | null;
        startsAt: Date;
        endsAt: Date | null;
        appointmentVehicles?: Array<{ vehicleId: string }>;
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
        if (appointment.studentId) add(appointment.studentId, start, end);
        if (appointment.instructorId) {
          add(appointment.instructorId, start, end);
        }
        if (appointment.vehicleId) {
          add(appointment.vehicleId, start, end);
        }
        // Follow car (and any secondary vehicle) reserved by the appointment.
        for (const link of appointment.appointmentVehicles ?? []) {
          if (link.vehicleId !== appointment.vehicleId) {
            add(link.vehicleId, start, end);
          }
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
      const lastStart = window.endMinutes - payload.durationMinutes;
      if (lastStart < window.startMinutes) return [];
      const minutesSet = new Set<number>();
      // Legacy :00/:30 grid (kept for continuity).
      const firstGrid = Math.ceil(window.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
      for (let m = firstGrid; m <= lastStart; m += SLOT_MINUTES) minutesSet.add(m);
      // Window-anchored cascade + flush-to-end anchor (same packing-friendly
      // candidates as the slot matcher; 15-minute granularity like the
      // booking confirm guard).
      for (let m = window.startMinutes; m <= lastStart; m += payload.durationMinutes) {
        if (m % 15 === 0) minutesSet.add(m);
      }
      if (lastStart % 15 === 0) minutesSet.add(lastStart);
      return [...minutesSet]
        .sort((a, b) => a - b)
        .map((m) => toTimeZoneDate(dayParts, Math.floor(m / 60), m % 60));
    };

    const findCandidateForDay = async (
      dayParts: CalendarDateParts,
      preferredWindow?: { startMinutes: number; endMinutes: number },
      forcedStart?: Date,
    ) => {
      if (!studentAvailability && !forcedStart) return null;
      if (!activeInstructorIds.length) return null;
      if (vehiclesEnabled && !activeVehicleIds.length) return null;

      const dayOfWeek = getDayOfWeekFromDateParts(dayParts);

      // When roundedHoursOnly, collect allowed starts by cascading from each
      // instructor range start in 60-min steps. Ranges starting at :30 only
      // produce :30 slots; ranges starting at :00 only produce :00 slots.
      let allowedRoundedStarts: Set<number> | null = null;
      if (roundedHoursOnly) {
        allowedRoundedStarts = new Set<number>();
        const probe = toTimeZoneDate(dayParts, 0, 0);
        for (const instrId of activeInstructorIds) {
          const avail = instructorAvailabilityResolver.resolve(instrId, probe);
          if (!avail || !avail.daysOfWeek.includes(dayOfWeek)) continue;
          for (const r of avail.ranges) {
            for (let s = r.startMinutes; s + payload.durationMinutes <= r.endMinutes; s += 60) {
              allowedRoundedStarts.add(s);
            }
          }
        }
      }

      // Build candidate starts from all student availability ranges
      let candidateStarts: Date[] = [];
      if (forcedStart) {
        // When a specific start is forced (free_choice or accepted suggestion),
        // skip student availability checks — the slot was already validated.
        //
        // Granularity guard: with anchor-aware slot packing, proposed entry
        // points can land on non-:00/:30 times (e.g. 08:45, when packed flush
        // against a previous lesson ending at 08:45). The legacy "must be a
        // multiple of SLOT_MINUTES (30)" gate rejected exactly those anchors
        // and made them un-bookable — the proposal succeeded, the confirm
        // failed. We keep a sanity check on a 15-minute granularity (the same
        // granularity already enforced on `durationMinutes` above), which
        // still blocks arbitrary client-supplied times while admitting the
        // anchors the engine itself produces. All real constraints
        // (availability, overlap, lesson policy, exam priority, ...) are
        // still validated below.
        const forcedMinutes = minutesFromDate(forcedStart);
        if (forcedMinutes % 15 !== 0) return null;
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
      const [appointments, bookingInstructorBlocks, bookingGroupLessonBusy] = await Promise.all([
        prisma.autoscuolaAppointment.findMany({
          where: {
            companyId: membership.companyId,
            status: { notIn: ["cancelled"] },
            startsAt: { gte: appointmentScanStart, lt: rangeEnd },
          },
          include: { appointmentVehicles: { select: { vehicleId: true } } },
        }),
        prisma.autoscuolaInstructorBlock.findMany({
          where: {
            companyId: membership.companyId,
            instructorId: { in: activeInstructorIds },
            endsAt: { gt: rangeStart },
            startsAt: { lt: rangeEnd },
          },
          select: { instructorId: true, startsAt: true, endsAt: true },
        }),
        fetchGroupLessonBusyRows(membership.companyId, rangeStart, rangeEnd),
      ]);

      const appointmentMaps = buildAppointmentMaps(appointments);
      // Instructor blocks ("blocca slot") were missing from this booking-time
      // check — the slot LIST excluded them, but the final placement here did
      // not, so the engine could assign an instructor inside their own block
      // (Robatto, 2026-06-12).
      for (const block of bookingInstructorBlocks) {
        const list = appointmentMaps.intervals.get(block.instructorId) ?? [];
        list.push({ start: block.startsAt.getTime(), end: block.endsAt.getTime() });
        appointmentMaps.intervals.set(block.instructorId, list);
      }
      // Empty group lessons have no appointment rows — block instructor/vehicle
      // via the containers so a single guide can never land on top of one.
      addGroupLessonBusyIntervals(appointmentMaps.intervals, bookingGroupLessonBusy);
      const studentIntervals = appointmentMaps.intervals.get(payload.studentId);

      let best: {
        start: Date;
        end: Date;
        instructorId: string;
        vehicleId: string | null;
        followVehicleId: string | null;
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

        // When roundedHoursOnly, only allow starts that align with instructor range cascades
        if (roundedHoursOnly) {
          const candidateMin = minutesFromDate(startDate);
          if (!allowedRoundedStarts!.has(candidateMin)) continue;
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
          // Publication mode: skip instructors without published week
          if (!pubFilter(ownerId, startDate)) continue;
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

        if (!availableInstructors.length) {
          continue;
        }

        // Couple instructor↔vehicle: exclusive vehicles are bound to their
        // instructor and hidden from others' pool; a moto may also need a follow car.
        const endTime = endDate.getTime();
        const pair = pickBestInstructorVehicleSet({
          availableInstructors,
          vehiclesEnabled,
          resolveVehicles: (instructorId) =>
            resolveVehiclesForInstructor({
              instructorId,
              studentCategory: studentLicense?.licenseCategory ?? null,
              activeVehicleIds,
              maps: vehicleResolutionMaps,
              isVehicleAvailable: (vehicleId) =>
                isOwnerAvailable(
                  vehicleAvailabilityResolver.resolve(vehicleId, startDate),
                  dayOfWeek,
                  candidateStartMinutes,
                  candidateEndMinutes,
                ),
              hasOverlap: (vehicleId) =>
                overlaps(appointmentMaps.intervals.get(vehicleId), startMs, endTime),
              scoreVehicle: (vehicleId) =>
                (appointmentMaps.ends.get(vehicleId)?.has(startMs) ? 1 : 0) +
                (appointmentMaps.starts.get(vehicleId)?.has(endTime) ? 1 : 0),
              matchesLicenseCategory,
              requireFollowCar,
              matchesFollowCar,
              followCarCategory: FOLLOW_CAR_CATEGORY,
            }),
        });
        if (!pair) {
          continue;
        }

        const score = pair.score;

        if (
          !best ||
          score > best.score ||
          (score === best.score && startMs < best.start.getTime())
        ) {
          best = {
            start: startDate,
            end: endDate,
            instructorId: pair.instructorId,
            vehicleId: pair.vehicleId,
            followVehicleId: pair.followVehicleId,
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

    // Exam priority day-block checker (reusable in both selectedStartsAt and engine paths)
    const checkExamPriorityDayBlock = async (dayDate: Date, slotStartsAt?: Date): Promise<string | null> => {
      const companyLimits = (autoscuolaService?.limits ?? {}) as Record<string, unknown>;
      const examEnabled = companyLimits.examPriorityEnabled === true;
      const examBlockNonExam = companyLimits.examPriorityBlockNonExam === true;
      const pausedUntilStr =
        typeof companyLimits.examPriorityPausedUntil === "string" ? companyLimits.examPriorityPausedUntil : null;
      const isPaused = Boolean(pausedUntilStr && new Date(pausedUntilStr) > now);
      if (!examEnabled || !examBlockNonExam || isPaused) return null;

      const examDaysBefore =
        typeof companyLimits.examPriorityDaysBeforeExam === "number" && companyLimits.examPriorityDaysBeforeExam >= 1
          ? companyLimits.examPriorityDaysBeforeExam
          : 14;
      const { getExamPriorityInfo, isDayBlockedByExamPriority } = await import("@/lib/autoscuole/exam-priority");
      const selfInfo = await getExamPriorityInfo(membership.companyId, payload.studentId, examDaysBefore);
      if (selfInfo.active) return null; // this student IS priority → never blocked

      const studentMember = await prisma.companyMember.findFirst({
        where: {
          companyId: membership.companyId,
          userId: payload.studentId,
          autoscuolaRole: "STUDENT",
        },
        select: { assignedInstructorId: true },
      });
      const scope = clusterBookingSettings.isLockedToInstructor
        ? studentMember?.assignedInstructorId ?? null
        : null;
      const dayStart = new Date(dayDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const blocked = await isDayBlockedByExamPriority({
        companyId: membership.companyId,
        studentInstructorId: scope,
        dayStart,
        dayEnd,
        daysBeforeExam: examDaysBefore,
        slotStartsAt,
      });
      if (!blocked) return null;
      return scope
        ? "Questo giorno è riservato agli allievi del tuo gruppo prossimi all'esame. Scegli un altro giorno."
        : "Questo giorno è riservato agli allievi prossimi all'esame. Scegli un altro giorno.";
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

      // Exam priority per-day block check (selectedStartsAt path)
      const blockMsg = await checkExamPriorityDayBlock(candidate.start, candidate.start);
      if (blockMsg) {
        return { success: false, message: blockMsg };
      }

      // Weekly booking limit enforcement — student self-serve path.
      // The limit was previously enforced ONLY in createAutoscuolaAppointment
      // (instructor/web create), so students could exceed it from the app
      // (e.g. Robatto: 3 guide in una settimana con limite 2). Mirror the same
      // logic here: effective limit (cluster → company), student exemption and
      // exam-priority bypass, ISO week (Mon–Sun UTC) of the selected slot.
      if (clusterBookingSettings.weeklyBookingLimitEnabled) {
        const limitMember = await prisma.companyMember.findFirst({
          where: { companyId: membership.companyId, userId: payload.studentId },
          select: { weeklyBookingLimitExempt: true },
        });
        const isLimitExempt = limitMember?.weeklyBookingLimitExempt === true;

        let examPriorityBypass = false;
        if (preServiceLimits.examPriorityEnabled === true) {
          const daysBeforeExam =
            typeof preServiceLimits.examPriorityDaysBeforeExam === "number" &&
            preServiceLimits.examPriorityDaysBeforeExam >= 1
              ? preServiceLimits.examPriorityDaysBeforeExam
              : 14;
          const { hasExamPriority } = await import("@/lib/autoscuole/exam-priority");
          examPriorityBypass = await hasExamPriority(
            membership.companyId,
            payload.studentId,
            daysBeforeExam,
          );
        }

        const effectiveWeeklyLimit =
          typeof clusterBookingSettings.weeklyBookingLimit === "number" &&
          clusterBookingSettings.weeklyBookingLimit >= 1
            ? clusterBookingSettings.weeklyBookingLimit
            : null;

        if (!isLimitExempt && !examPriorityBypass && effectiveWeeklyLimit !== null) {
          const slotDate = new Date(candidate.start);
          const dayOfWeek = slotDate.getUTCDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(slotDate);
          weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
          weekStart.setUTCHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

          const weekCount = await prisma.autoscuolaAppointment.count({
            where: {
              companyId: membership.companyId,
              studentId: payload.studentId,
              status: { notIn: ["cancelled"] },
              startsAt: { gte: weekStart, lt: weekEnd },
            },
          });

          if (weekCount >= effectiveWeeklyLimit) {
            return {
              success: false,
              message: `Hai raggiunto il limite massimo di ${effectiveWeeklyLimit} guide settimanali. Non puoi prenotare altre guide per questa settimana.`,
              code: "WEEKLY_LIMIT_REACHED" as const,
            };
          }
        }
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

        if (candidate.vehicleId) {
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
        }

        // Follow car (auto al seguito): reserve its slot too.
        if (candidate.followVehicleId) {
          await tx.autoscuolaAvailabilitySlot.upsert({
            where: {
              companyId_ownerType_ownerId_startsAt: {
                companyId: membership.companyId,
                ownerType: "vehicle",
                ownerId: candidate.followVehicleId,
                startsAt: candidate.start,
              },
            },
            update: { endsAt: candidate.end, status: "booked" },
            create: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              ownerId: candidate.followVehicleId,
              startsAt: candidate.start,
              endsAt: candidate.end,
              status: "booked",
            },
          });
        }

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

        // Default location: link student-initiated bookings to the company sede
        const studentBookingLoc = await tx.autoscuolaLocation.findFirst({
          where: { companyId: membership.companyId, isDefault: true, archivedAt: null },
          select: { id: true },
        });
        return tx.autoscuolaAppointment.create({
          data: {
            id: appointmentId,
            companyId: membership.companyId,
            studentId: payload.studentId,
            bookingSource: BOOKING_SOURCE.studentSelf,
            type: candidate.resolvedLessonType,
            startsAt: candidate.start,
            endsAt: candidate.end,
            status: "scheduled",
            instructorId: candidate.instructorId,
            vehicleId: candidate.vehicleId,
            locationId: studentBookingLoc?.id ?? null,
            slotId: studentSlot.id,
            paymentRequired: paymentSnapshot.paymentRequired,
            paymentStatus: paymentSnapshot.paymentStatus,
            priceAmount: paymentSnapshot.priceAmount,
            penaltyAmount: paymentSnapshot.penaltyAmount,
            penaltyCutoffAt: paymentSnapshot.penaltyCutoffAt,
            paidAmount: paymentSnapshot.paidAmount,
            invoiceStatus: paymentSnapshot.invoiceStatus,
            creditApplied: paymentSnapshot.creditApplied,
            // Reserve every vehicle this lesson uses (primary + follow car).
            ...(candidate.vehicleId
              ? {
                  appointmentVehicles: {
                    create: [
                      { vehicleId: candidate.vehicleId, role: "primary" },
                      ...(candidate.followVehicleId
                        ? [{ vehicleId: candidate.followVehicleId, role: "follow" }]
                        : []),
                    ],
                  },
                }
              : {}),
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
    // Auth guard only — do NOT gate on booking-allowed.
    // getBookingOptions must always return cluster info (instructor, weekly absence, etc.)
    // even when the student cannot book, so the UI can render the right state.
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole) &&
      (membership.autoscuolaRole !== "STUDENT" || membership.userId !== payload.studentId)
    ) {
      return { success: false, message: "Accesso non consentito." };
    }

    const [student, limits] = await Promise.all([
      ensureStudentMembership(membership.companyId, payload.studentId),
      getCachedCompanyServiceLimits(membership.companyId),
    ]);

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }
    const policy = parseLessonPolicyFromLimits(limits);
    const companyBookingSlotDurations = normalizeBookingSlotDurations(
      limits.bookingSlotDurations,
    );
    const companyRoundedHoursOnly = limits.roundedHoursOnly === true;
    // Use limits already fetched — no need to re-query companyService
    const governance = parseBookingGovernanceFromLimits(limits);

    // Resolve cluster-aware settings (pass full company defaults so appBookingActors
    // and all other governance fields are correctly inherited when no cluster override exists)
    const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import("@/lib/autoscuole/instructor-clusters");
    const companyDefaults = buildCompanyBookingDefaults(limits);

    // Resolve cluster settings and lesson coverage in parallel (independent queries)
    const needsCoverage =
      policy.lessonPolicyEnabled &&
      policy.lessonRequiredTypesEnabled &&
      policy.lessonRequiredTypes.length > 0;

    const [clusterSettings, coverageResult] = await Promise.all([
      resolveEffectiveBookingSettings(
        membership.companyId,
        payload.studentId,
        companyDefaults,
      ),
      needsCoverage
        ? getStudentLessonPolicyCoverage({
            companyId: membership.companyId,
            studentId: payload.studentId,
            policy,
          })
        : null,
    ]);

    const lessonTypeSelectionEnabled = policy.lessonPolicyEnabled;
    let availableLessonTypes: string[] = lessonTypeSelectionEnabled
      ? [...LESSON_POLICY_TYPES]
      : [];

    if (coverageResult && coverageResult.missingRequiredTypes.length) {
      availableLessonTypes = coverageResult.missingRequiredTypes;
    }

    const instructorPreferenceEnabled =
      typeof limits.instructorPreferenceEnabled === "boolean"
        ? limits.instructorPreferenceEnabled
        : false;

    // Weekly booking limit info — cluster overrides company (clusterSettings is
    // already resolved with the full company defaults above).
    const weeklyBookingLimitEnabled = clusterSettings.weeklyBookingLimitEnabled;
    const weeklyBookingLimit = typeof clusterSettings.weeklyBookingLimit === "number" && clusterSettings.weeklyBookingLimit >= 1
      ? clusterSettings.weeklyBookingLimit
      : 3;
    // Exam priority settings (new model — gated by examPriorityEnabled master toggle)
    const examPriorityEnabled = limits.examPriorityEnabled === true;
    const examPriorityDaysBeforeExam =
      typeof limits.examPriorityDaysBeforeExam === "number" && limits.examPriorityDaysBeforeExam >= 1
        ? limits.examPriorityDaysBeforeExam
        : 14;
    const examPriorityBlockNonExam = limits.examPriorityBlockNonExam === true;
    const pausedUntilStr =
      typeof limits.examPriorityPausedUntil === "string" ? limits.examPriorityPausedUntil : null;
    const examPriorityPaused = Boolean(pausedUntilStr && new Date(pausedUntilStr) > new Date());

    // Compute exam priority info (drives banner + weekly limit bypass + blocking)
    let examPriorityInfo: { active: boolean; examDate: string | null } = { active: false, examDate: null };
    let blockedByExamPriority = false;
    let studentHasExamPriority = false;

    if (examPriorityEnabled) {
      const { getExamPriorityInfo, getExamStudentsInScope } = await import("@/lib/autoscuole/exam-priority");
      const studentExamInfo = await getExamPriorityInfo(
        membership.companyId,
        payload.studentId,
        examPriorityDaysBeforeExam,
      );
      examPriorityInfo = { active: studentExamInfo.active, examDate: studentExamInfo.examDate };
      studentHasExamPriority = studentExamInfo.active;

      if (examPriorityBlockNonExam && !studentExamInfo.active && !examPriorityPaused) {
        const studentMember = await prisma.companyMember.findFirst({
          where: { companyId: membership.companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
          select: { assignedInstructorId: true },
        });
        const scope = clusterSettings.isLockedToInstructor
          ? studentMember?.assignedInstructorId ?? null
          : null;
        const examStudentsInScope = await getExamStudentsInScope({
          companyId: membership.companyId,
          studentInstructorId: scope,
          daysBeforeExam: examPriorityDaysBeforeExam,
        });
        if (examStudentsInScope.length > 0) {
          blockedByExamPriority = true;
        }
      }
    }

    let weeklyLimitReached = false;
    let weeklyBookingCount = 0;
    const effectiveLimit = weeklyBookingLimit;

    if (weeklyBookingLimitEnabled) {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { companyId: membership.companyId, userId: payload.studentId },
        select: { weeklyBookingLimitExempt: true },
      });
      // Bypass weekly limit: exempt members OR students with exam priority
      if (!memberRecord?.weeklyBookingLimitExempt && !studentHasExamPriority) {
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
        bookingSlotDurations: clusterSettings.bookingSlotDurations,
        lessonTypeSelectionEnabled,
        availableLessonTypes,
        instructorPreferenceEnabled,
        weeklyBookingLimit: weeklyBookingLimitEnabled ? {
          enabled: true,
          limit: effectiveLimit,
          current: weeklyBookingCount,
          reached: weeklyLimitReached,
          examPriority: examPriorityInfo,
        } : { enabled: false },
        assignedInstructorId: clusterSettings.assignedInstructorId,
        assignedInstructorName: clusterSettings.assignedInstructorName,
        assignedInstructorPhone: clusterSettings.assignedInstructorPhone,
        isLockedToInstructor: clusterSettings.isLockedToInstructor,
        weeklyAbsenceEnabled: clusterSettings.weeklyAbsenceEnabled,
        appBookingActors: clusterSettings.appBookingActors,
        swapEnabled: clusterSettings.swapEnabled,
        studentCancellationEnabled: clusterSettings.studentCancellationEnabled,
        examPriority: examPriorityInfo,
        blockedByExamPriority,
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

    // Redis cache check — after auth, before heavy computation
    const slotsCacheKey = await buildAutoscuoleCacheKey({
      companyId: membership.companyId,
      segment: AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
      scope: hashCacheInput({
        action: "available-slots",
        studentId: payload.studentId,
        date: payload.date,
        durationMinutes: payload.durationMinutes,
        instructorId: payload.instructorId,
        lessonType: payload.lessonType,
      }),
    });
    const cachedSlots = await readAutoscuoleCache<unknown>(slotsCacheKey);
    if (cachedSlots) {
      return { success: true, data: cachedSlots };
    }

    const now = new Date();
    if (payload.durationMinutes < 30 || payload.durationMinutes > 120 || payload.durationMinutes % 15 !== 0) {
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
    // Holiday check + service limits. Limits were already fetched during the
    // booking-access check for students — reuse them; only admin/owner refetch.
    const [isHoliday, serviceLimits] = await Promise.all([
      prisma.autoscuolaHoliday.findFirst({
        where: {
          companyId: membership.companyId,
          date: holidayDate,
        },
      }),
      bookingAccess.limits ?? getCachedCompanyServiceLimits(membership.companyId),
    ]);
    if (isHoliday) {
      return { success: true, data: [] };
    }

    // Reuse the cluster settings already resolved during the booking-access
    // check (students); only recompute for admin/owner, who skip that path.
    const clusterSettings = bookingAccess.settings ?? await resolveEffectiveBookingSettings(
      membership.companyId,
      payload.studentId,
      buildCompanyBookingDefaults(serviceLimits),
    );
    const roundedHoursOnly = clusterSettings.roundedHoursOnly;

    // If student is locked to an instructor, force the instructorId filter
    const effectiveInstructorId = clusterSettings.isLockedToInstructor && clusterSettings.assignedInstructorId
      ? clusterSettings.assignedInstructorId
      : payload.instructorId;

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

    // Booking cutoff: block if past the deadline (day before at cutoff time).
    // Uses cluster-resolved settings (cluster overrides company).
    if (clusterSettings.bookingCutoffEnabled) {
      const cutoffTime = clusterSettings.bookingCutoffTime;
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

    const allowedDurations = clusterSettings.bookingSlotDurations;
    if (!allowedDurations.some((d) => d === payload.durationMinutes)) {
      return { success: false, message: "Durata non disponibile per questa autoscuola." };
    }

    const lessonPolicy = parseLessonPolicyFromLimits(serviceLimits);
    const enforceLessonTypeTimeConstraints = lessonPolicy.lessonPolicyEnabled;
    const enforceRequiredTypes =
      lessonPolicy.lessonPolicyEnabled &&
      lessonPolicy.lessonRequiredTypesEnabled &&
      lessonPolicy.lessonRequiredTypes.length > 0;

    // Need student availability when restricted time range is active (to check overlap)
    const needStudentAvailability = clusterSettings.restrictedTimeRangeEnabled;

    const [
      activeInstructors,
      activeVehicles,
      vehiclePoolMembers,
      instructorPreferredVehicles,
      student,
      studentAvailabilityRaw,
    ] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: {
          companyId: membership.companyId,
          status: { not: "inactive" },
          ...(effectiveInstructorId ? { id: effectiveInstructorId } : {}),
        },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: "active" },
        select: {
          id: true,
          assignedInstructorId: true,
          followsInstructorAvailability: true,
          licenseCategory: true,
          transmission: true,
        },
      }),
      prisma.autoscuolaVehiclePoolMember.findMany({
        where: { vehicle: { companyId: membership.companyId } },
        select: { vehicleId: true, instructorId: true },
      }),
      prisma.autoscuolaInstructorPreferredVehicle.findMany({
        where: { instructor: { companyId: membership.companyId } },
        select: { instructorId: true, licenseCategory: true, vehicleId: true },
      }),
      ensureStudentMembership(membership.companyId, payload.studentId),
      needStudentAvailability
        ? prisma.autoscuolaWeeklyAvailability.findFirst({
            where: { companyId: membership.companyId, ownerType: "student", ownerId: payload.studentId },
          })
        : Promise.resolve(null),
    ]);

    const studentAvailability = studentAvailabilityRaw
      ? defaultToAvailabilityRecord(studentAvailabilityRaw)
      : null;

    // Restricted time range: check if student has availability overlapping with the restricted range
    let restrictToTimeRange = false;
    let restrictedStartMin = 0;
    let restrictedEndMin = 0;
    if (clusterSettings.restrictedTimeRangeEnabled && studentAvailability) {
      const [rsH, rsM] = clusterSettings.restrictedTimeRangeStart.split(":").map(Number);
      const [reH, reM] = clusterSettings.restrictedTimeRangeEnd.split(":").map(Number);
      restrictedStartMin = rsH * 60 + rsM;
      restrictedEndMin = reH * 60 + reM;
      // Check if any of the student's declared availability ranges overlap with the restricted range
      const hasOverlap = studentAvailability.ranges.some(
        (r) => r.startMinutes < restrictedEndMin && r.endMinutes > restrictedStartMin,
      );
      if (hasOverlap) {
        restrictToTimeRange = true;
      }
    }

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const vehiclesEnabledForSlots = serviceLimits.vehiclesEnabled !== false;
    const allInstructorIds = activeInstructors.map((i) => i.id);

    // Publication mode gating: filter out instructors with unpublished weeks
    const pubFilter = await getPublicationModeFilter(
      membership.companyId,
      allInstructorIds,
      dateStart,
      toTimeZoneDate(addDaysToDateParts(dateParts, 1), 0, 0),
    );
    const activeInstructorIds = allInstructorIds.filter((id) => pubFilter(id, dateStart));

    const activeVehicleIds = vehiclesEnabledForSlots ? activeVehicles.map((v) => v.id) : [];
    const vehicleResolutionMaps = buildVehicleResolutionMaps({
      vehicles: activeVehicles,
      poolMembers: vehiclePoolMembers,
      preferred: instructorPreferredVehicles,
    });
    const matchesLicenseCategory = buildMatchesLicenseCategory(activeVehicles, student);
    const followCarRules = parseFollowCarRulesFromLimits(serviceLimits);
    const requireFollowCar =
      vehiclesEnabledForSlots && requiresFollowCar(followCarRules, student?.licenseCategory ?? null);
    const matchesFollowCar = buildMatchesFollowCar(activeVehicles);
    if (!activeInstructorIds.length) {
      return { success: true, data: [] };
    }
    if (vehiclesEnabledForSlots && !activeVehicleIds.length) {
      return { success: true, data: [] };
    }

    const dayOfWeek = getDayOfWeekFromDateParts(dateParts);

    const rangeStart = dateStart;
    const rangeEnd = toTimeZoneDate(addDaysToDateParts(dateParts, 1), 0, 0);
    const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);

    // Everything still needed is independent — fetch it in a single parallel
    // wave instead of four sequential round-trips (policy coverage, the two
    // availability resolvers, appointments, and instructor blocks).
    const [
      lessonCoverage,
      instructorResolver,
      vehicleResolver,
      appointments,
      instructorBlocks,
      groupLessonBusy,
    ] = await Promise.all([
      enforceRequiredTypes
        ? getStudentLessonPolicyCoverage({
            companyId: membership.companyId,
            studentId: payload.studentId,
            policy: lessonPolicy,
          })
        : Promise.resolve(null),
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
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          status: { notIn: ["cancelled"] },
          startsAt: { gte: appointmentScanStart, lt: rangeEnd },
        },
        include: { appointmentVehicles: { select: { vehicleId: true } } },
      }),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId: membership.companyId,
          instructorId: { in: activeInstructorIds },
          endsAt: { gt: rangeStart },
          startsAt: { lt: rangeEnd },
        },
      }),
      fetchGroupLessonBusyRows(membership.companyId, rangeStart, rangeEnd),
    ]);
    const missingRequiredTypes = lessonCoverage?.missingRequiredTypes ?? [];

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
      if (appt.studentId) addInterval(appt.studentId); // null only for studentless exam placeholders
      if (appt.instructorId) addInterval(appt.instructorId);
      if (appt.vehicleId) addInterval(appt.vehicleId);
      for (const link of appt.appointmentVehicles ?? []) {
        if (link.vehicleId !== appt.vehicleId) addInterval(link.vehicleId);
      }
    }

    // Instructor blocks (sick leave, etc.) were fetched in the parallel wave
    // above — add them to the busy intervals.
    for (const block of instructorBlocks) {
      const list = intervals.get(block.instructorId) ?? [];
      list.push({ start: block.startsAt.getTime(), end: block.endsAt.getTime() });
      intervals.set(block.instructorId, list);
    }

    // Group-lesson containers (even with 0 participants) block their
    // instructor and vehicle — empty lessons have no appointment rows and
    // would otherwise be invisible here.
    addGroupLessonBusyIntervals(intervals, groupLessonBusy);

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

    // Anchor-aware packing: compute the union of admissible entry-point
    // minutes-from-midnight across all active instructors, taking into
    // account both their availability windows and their already-booked
    // intervals. For each instructor:
    //   - subtract busy intervals from each availability range,
    //   - feed the resulting free intervals into computeAnchorAwareEntryPoints,
    //   - which yields entry points anchored to busy edges + a filtered grid
    //     that never leaves gaps smaller than the minimum bookable duration.
    //
    // This replaces the legacy "iterate the static :00/:30 grid" approach,
    // which was the root cause of orphaned gaps when durations were not
    // aligned to the grid (e.g. 45-min lessons leaving 15-min orphans).
    const dayStartMs = dateStart.getTime();
    const minCompanyDurationMinutes = Math.min(
      ...(allowedDurations.length ? allowedDurations : [SLOT_MINUTES]),
    );
    const slotGridMinutes = roundedHoursOnly ? 60 : SLOT_MINUTES;

    const allowedEntryMinutes = new Set<number>();
    for (const instrId of activeInstructorIds) {
      const avail = instructorResolver.resolve(instrId, dateStart);
      if (!avail || !avail.daysOfWeek.includes(dayOfWeek)) continue;

      // Convert this instructor's busy intervals (appointments + blocks) into
      // minutes from local midnight, clipped to today.
      const ownerBusyMs = intervals.get(instrId) ?? [];
      const ownerBusyMinutes = ownerBusyMs.map((b) => ({
        startMinutes: Math.round((b.start - dayStartMs) / 60_000),
        endMinutes: Math.round((b.end - dayStartMs) / 60_000),
      }));

      for (const range of avail.ranges) {
        if (range.endMinutes <= range.startMinutes) continue;
        const free = computeFreeIntervalsInRange(
          range.startMinutes,
          range.endMinutes,
          ownerBusyMinutes,
        );
        // gridPhase preserves the cascade-from-range-start semantics used by
        // the legacy roundedHoursOnly path (a range starting at 09:30 yields
        // 09:30, 10:30, ... rather than 10:00, 11:00, ...).
        const gridPhaseMinutes = roundedHoursOnly ? range.startMinutes % 60 : 0;
        for (const interval of free) {
          const points = computeAnchorAwareEntryPoints(
            interval,
            payload.durationMinutes,
            minCompanyDurationMinutes,
            // Packing-complete: only starts whose residues are exactly
            // fillable with the cluster's allowed durations (no stranded
            // minutes — e.g. 14:15–18:15 with 60' lessons → 14:15, 15:15, …).
            { slotGridMinutes, gridPhaseMinutes, allowedDurations },
          );
          for (const p of points) allowedEntryMinutes.add(p);
        }
      }
    }

    const sortedEntryMinutes = [...allowedEntryMinutes].sort((a, b) => a - b);

    // Marchiamo ogni slot come dentro/fuori la fascia oraria prioritaria: dopo il
    // ciclo teniamo solo quelli dentro fascia, e ripieghiamo su TUTTI se dentro non
    // ce n'è nessuno (fascia prioritaria "morbida", non un muro).
    const result: Array<{ startsAt: string; endsAt: string; inRestrictedWindow: boolean }> = [];
    const studentIntervals = intervals.get(payload.studentId);

    {
      for (const minutes of sortedEntryMinutes) {
        const startDate = toTimeZoneDate(dateParts, Math.floor(minutes / 60), minutes % 60);
        const endDate = getSlotEnd(startDate, payload.durationMinutes);
        const startMs = startDate.getTime();
        if (startMs < now.getTime()) continue;
        if (startDate < rangeStart || endDate > rangeEnd) continue;
        if (overlaps(studentIntervals, startMs, endDate.getTime())) continue;

        // Fascia oraria prioritaria: NON scartiamo più lo slot se è fuori fascia,
        // lo marchiamo soltanto (il fallback avviene dopo il ciclo).
        const inRestrictedWindow =
          !restrictToTimeRange ||
          (minutes >= restrictedStartMin && minutes + payload.durationMinutes <= restrictedEndMin);

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

        const availableInstructors: Array<{ id: string; score: number }> = [];
        for (const ownerId of activeInstructorIds) {
          const availability = instructorResolver.resolve(ownerId, startDate);
          if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) continue;
          if (overlaps(intervals.get(ownerId), startMs, endDate.getTime())) continue;
          availableInstructors.push({ id: ownerId, score: 0 });
        }
        if (!availableInstructors.length) continue;

        // A slot exists only if some instructor can be paired with a vehicle
        // (an exclusive one, or a pool/open vehicle) — plus a follow car when
        // the school requires one for the student's category.
        const endTime = endDate.getTime();
        const pair = pickBestInstructorVehicleSet({
          availableInstructors,
          vehiclesEnabled: vehiclesEnabledForSlots,
          resolveVehicles: (instructorId) =>
            resolveVehiclesForInstructor({
              instructorId,
              studentCategory: student?.licenseCategory ?? null,
              activeVehicleIds,
              maps: vehicleResolutionMaps,
              isVehicleAvailable: (vehicleId) =>
                isOwnerAvailable(
                  vehicleResolver.resolve(vehicleId, startDate),
                  dayOfWeek,
                  candidateStartMinutes,
                  candidateEndMinutes,
                ),
              hasOverlap: (vehicleId) =>
                overlaps(intervals.get(vehicleId), startMs, endTime),
              scoreVehicle: () => 0,
              matchesLicenseCategory,
              requireFollowCar,
              matchesFollowCar,
              followCarCategory: FOLLOW_CAR_CATEGORY,
            }),
        });
        if (!pair) continue;

        result.push({
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
          inRestrictedWindow,
        });
      }
    }

    // Fascia prioritaria "morbida": se il giorno ha slot DENTRO la fascia mostra
    // solo quelli; altrimenti (nessuno dentro) ripiega su tutti (dentro + fuori).
    const insideWindow = result.filter((s) => s.inRestrictedWindow);
    const chosen = insideWindow.length > 0 ? insideWindow : result;
    const data = chosen.map(({ startsAt, endsAt }) => ({ startsAt, endsAt }));

    await writeAutoscuoleCache(slotsCacheKey, data, 30); // 30s TTL
    return { success: true, data };
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

    // Redis cache check — after auth, before heavy computation
    const dateMapCacheKey = await buildAutoscuoleCacheKey({
      companyId: membership.companyId,
      segment: AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
      scope: hashCacheInput({
        action: "date-availability-map",
        studentId: payload.studentId,
        from: payload.from,
        to: payload.to,
      }),
    });
    const cachedDateMap = await readAutoscuoleCache<unknown>(dateMapCacheKey);
    if (cachedDateMap) {
      return { success: true, data: cachedDateMap };
    }

    const now = new Date();

    const fromParts = parseDateOnly(payload.from);
    const toParts = parseDateOnly(payload.to);
    if (!fromParts || !toParts) {
      return { success: false, message: "Date non valide." };
    }

    // Service limits (cached)
    const serviceLimits = await getCachedCompanyServiceLimits(membership.companyId);
    const bookingMinStartDate =
      typeof serviceLimits.bookingMinStartDate === "string"
        ? serviceLimits.bookingMinStartDate.trim()
        : null;
    const defaultDuration = normalizeBookingSlotDurations(
      serviceLimits.bookingSlotDurations,
    )[0];

    // Resolve cluster-aware settings for restricted time range
    const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import("@/lib/autoscuole/instructor-clusters");
    const clusterSettings = await resolveEffectiveBookingSettings(
      membership.companyId,
      payload.studentId,
      buildCompanyBookingDefaults(serviceLimits),
    );

    // Booking cutoff (cluster overrides company).
    const cutoffEnabled = clusterSettings.bookingCutoffEnabled;
    const cutoffTime = clusterSettings.bookingCutoffTime;
    const [cutoffH, cutoffM] = cutoffTime.split(":").map(Number);

    // Need student availability when restricted time range is active
    const needStudentAvailability = clusterSettings.restrictedTimeRangeEnabled;

    // If student is locked to an instructor (cluster), only consider that instructor
    const effectiveInstructorId = clusterSettings.isLockedToInstructor && clusterSettings.assignedInstructorId
      ? clusterSettings.assignedInstructorId
      : null;

    // Fetch resources in parallel
    const [
      activeInstructors,
      activeVehicles,
      vehiclePoolMembers,
      instructorPreferredVehicles,
      student,
      studentAvailabilityRaw,
    ] = await Promise.all([
        prisma.autoscuolaInstructor.findMany({
          where: {
            companyId: membership.companyId,
            status: { not: "inactive" },
            ...(effectiveInstructorId ? { id: effectiveInstructorId } : {}),
          },
          select: { id: true },
        }),
        prisma.autoscuolaVehicle.findMany({
          where: {
            companyId: membership.companyId,
            status: "active",
          },
          select: {
            id: true,
            assignedInstructorId: true,
            followsInstructorAvailability: true,
            licenseCategory: true,
            transmission: true,
          },
        }),
        prisma.autoscuolaVehiclePoolMember.findMany({
          where: { vehicle: { companyId: membership.companyId } },
          select: { vehicleId: true, instructorId: true },
        }),
        prisma.autoscuolaInstructorPreferredVehicle.findMany({
          where: { instructor: { companyId: membership.companyId } },
          select: { instructorId: true, licenseCategory: true, vehicleId: true },
        }),
        ensureStudentMembership(membership.companyId, payload.studentId),
        needStudentAvailability
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

    // Restricted time range: check if student has availability overlapping with the restricted range
    let restrictToTimeRange = false;
    let restrictedStartMin = 0;
    let restrictedEndMin = 0;
    if (clusterSettings.restrictedTimeRangeEnabled && studentAvailability) {
      const [rsH, rsM] = clusterSettings.restrictedTimeRangeStart.split(":").map(Number);
      const [reH, reM] = clusterSettings.restrictedTimeRangeEnd.split(":").map(Number);
      restrictedStartMin = rsH * 60 + rsM;
      restrictedEndMin = reH * 60 + reM;
      const hasOverlap = studentAvailability.ranges.some(
        (r) => r.startMinutes < restrictedEndMin && r.endMinutes > restrictedStartMin,
      );
      if (hasOverlap) {
        restrictToTimeRange = true;
      }
    }

    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const vehiclesEnabled = serviceLimits.vehiclesEnabled !== false;
    const activeInstructorIds = activeInstructors.map((i) => i.id);
    const activeVehicleIds = vehiclesEnabled ? activeVehicles.map((v) => v.id) : [];
    const vehicleResolutionMaps = buildVehicleResolutionMaps({
      vehicles: activeVehicles,
      poolMembers: vehiclePoolMembers,
      preferred: instructorPreferredVehicles,
    });
    const matchesLicenseCategory = buildMatchesLicenseCategory(activeVehicles, student);
    const followCarRules = parseFollowCarRulesFromLimits(serviceLimits);
    const requireFollowCar =
      vehiclesEnabled && requiresFollowCar(followCarRules, student?.licenseCategory ?? null);
    const matchesFollowCar = buildMatchesFollowCar(activeVehicles);

    const result: Record<string, boolean> = {};
    const instructorsByDate: Record<string, string[]> = {};

    // No resources → all dates unavailable
    if (!activeInstructorIds.length || (vehiclesEnabled && !activeVehicleIds.length)) {
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

    // Build resolvers for the entire range (4 queries total) + publication mode filter
    const [instructorResolver, vehicleResolver, pubFilter] = await Promise.all([
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
      getPublicationModeFilter(
        membership.companyId,
        activeInstructorIds,
        rangeStart,
        rangeEnd,
      ),
    ]);

    // Fetch appointments + instructor blocks in parallel (independent queries)
    const appointmentScanStart = new Date(
      rangeStart.getTime() - 60 * 60 * 1000,
    );
    const [appointments, dateMapInstructorBlocks, dateMapGroupLessonBusy] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          status: { notIn: ["cancelled"] },
          startsAt: { gte: appointmentScanStart, lt: rangeEnd },
        },
        include: { appointmentVehicles: { select: { vehicleId: true } } },
      }),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId: membership.companyId,
          instructorId: { in: activeInstructorIds },
          endsAt: { gt: rangeStart },
          startsAt: { lt: rangeEnd },
        },
      }),
      fetchGroupLessonBusyRows(membership.companyId, rangeStart, rangeEnd),
    ]);

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
      if (appt.studentId) addInterval(appt.studentId); // null only for studentless exam placeholders
      if (appt.instructorId) addInterval(appt.instructorId);
      if (appt.vehicleId) addInterval(appt.vehicleId);
      for (const link of appt.appointmentVehicles ?? []) {
        if (link.vehicleId !== appt.vehicleId) addInterval(link.vehicleId);
      }
    }
    for (const block of dateMapInstructorBlocks) {
      const list = intervals.get(block.instructorId) ?? [];
      list.push({ start: block.startsAt.getTime(), end: block.endsAt.getTime() });
      intervals.set(block.instructorId, list);
    }
    // Empty group lessons have no appointment rows — block instructor/vehicle
    // via the containers.
    addGroupLessonBusyIntervals(intervals, dateMapGroupLessonBusy);

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
    const toMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);

    // Anchor-aware packing inputs (mirror of getAllAvailableSlots).
    const roundedHoursOnly = clusterSettings.roundedHoursOnly;
    const slotGridMinutes = roundedHoursOnly ? 60 : SLOT_MINUTES;
    const clusterDurations = clusterSettings.bookingSlotDurations;
    const minCompanyDurationMinutes = Math.min(
      ...(clusterDurations.length ? clusterDurations : [defaultDuration]),
    );

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
      // Fascia oraria prioritaria "morbida": teniamo a parte la disponibilità
      // FUORI fascia, da usare come fallback solo se dentro la fascia non c'è nulla.
      let availableOutOfWindow = false;
      const dayInstructorsOutOfWindow = new Set<string>();

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
        // Build the union of admissible entry-point minutes across all active
        // instructors using anchor-aware packing on each instructor's free
        // intervals for the day. This ensures the date-availability map stays
        // in sync with getAllAvailableSlots: a date is marked available only
        // if at least one anchor-aware slot exists for at least one instructor.
        const dayStartMs = dateStart.getTime();
        const entryPointsByInstructor = new Map<string, Set<number>>();
        const allowedEntryMinutes = new Set<number>();
        for (const ownerId of activeInstructorIds) {
          if (!pubFilter(ownerId, dateStart)) continue;
          const avail = instructorResolver.resolve(ownerId, dateStart);
          if (!avail || !avail.daysOfWeek.includes(dayOfWeek)) continue;

          const ownerBusyMs = intervals.get(ownerId) ?? [];
          const ownerBusyMinutes = ownerBusyMs.map((b) => ({
            startMinutes: Math.round((b.start - dayStartMs) / 60_000),
            endMinutes: Math.round((b.end - dayStartMs) / 60_000),
          }));

          const instructorPoints = new Set<number>();
          for (const range of avail.ranges) {
            if (range.endMinutes <= range.startMinutes) continue;
            const freeIntervals = computeFreeIntervalsInRange(
              range.startMinutes,
              range.endMinutes,
              ownerBusyMinutes,
            );
            const gridPhaseMinutes = roundedHoursOnly ? range.startMinutes % 60 : 0;
            for (const interval of freeIntervals) {
              const points = computeAnchorAwareEntryPoints(
                interval,
                defaultDuration,
                minCompanyDurationMinutes,
                // Same packing-complete rule as getAllAvailableSlots, so the
                // date map never marks a day whose slots the list won't show.
                { slotGridMinutes, gridPhaseMinutes, allowedDurations: clusterDurations },
              );
              for (const p of points) {
                instructorPoints.add(p);
                allowedEntryMinutes.add(p);
              }
            }
          }
          if (instructorPoints.size) {
            entryPointsByInstructor.set(ownerId, instructorPoints);
          }
        }

        for (const minutes of [...allowedEntryMinutes].sort((a, b) => a - b)) {
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

          // Fascia oraria prioritaria: non scartiamo lo slot fuori fascia, lo
          // marchiamo — così se dentro la fascia non c'è nulla facciamo fallback.
          const inRestrictedWindow =
            !restrictToTimeRange ||
            (minutes >= restrictedStartMin && minutes + defaultDuration <= restrictedEndMin);

          const candidateEnd = minutes + defaultDuration;

          // Pick the instructors whose anchor-aware packing emitted this tick
          // (these are the ones whose availability covers it AND who are free
          // for the duration); the explicit overlap re-check is a defensive
          // safety net in case of stale intervals.
          const slotInstructors: string[] = [];
          for (const ownerId of activeInstructorIds) {
            const instructorPoints = entryPointsByInstructor.get(ownerId);
            if (!instructorPoints || !instructorPoints.has(minutes)) continue;
            const avail = instructorResolver.resolve(ownerId, startDate);
            if (!isOwnerAvail(avail, dayOfWeek, minutes, candidateEnd))
              continue;
            if (overlaps(intervals.get(ownerId), startMs, endDate.getTime()))
              continue;
            slotInstructors.push(ownerId);
          }
          if (!slotInstructors.length) continue;

          // Each instructor counts only if it can also be paired with a vehicle
          // (an exclusive one, or a pool/open vehicle) — plus a follow car when
          // the school requires one for the student's category.
          const endTime = endDate.getTime();
          const pairableInstructors = vehiclesEnabled
            ? slotInstructors.filter(
                (instructorId) =>
                  resolveVehiclesForInstructor({
                    instructorId,
                    studentCategory: student?.licenseCategory ?? null,
                    activeVehicleIds,
                    maps: vehicleResolutionMaps,
                    isVehicleAvailable: (vehicleId) =>
                      isOwnerAvail(
                        vehicleResolver.resolve(vehicleId, startDate),
                        dayOfWeek,
                        minutes,
                        candidateEnd,
                      ),
                    hasOverlap: (vehicleId) =>
                      overlaps(intervals.get(vehicleId), startMs, endTime),
                    scoreVehicle: () => 0,
                    matchesLicenseCategory,
                    requireFollowCar,
                    matchesFollowCar,
                    followCarCategory: FOLLOW_CAR_CATEGORY,
                  }) !== null,
              )
            : slotInstructors;
          if (!pairableInstructors.length) continue;

          // Valid slot — lo registriamo dentro o fuori fascia
          if (inRestrictedWindow) {
            available = true;
            for (const id of pairableInstructors) dayInstructors.add(id);
          } else {
            availableOutOfWindow = true;
            for (const id of pairableInstructors) dayInstructorsOutOfWindow.add(id);
          }

          // Short-circuit quando la fascia prioritaria copre già tutti gli istruttori
          if (dayInstructors.size >= activeInstructorIds.length) break;
        }
      }

      // Fallback fascia prioritaria: se dentro la fascia non c'è nulla ma fuori sì,
      // rendiamo comunque il giorno selezionabile (con gli istruttori fuori fascia).
      if (!available && availableOutOfWindow) {
        available = true;
        for (const id of dayInstructorsOutOfWindow) dayInstructors.add(id);
      }

      result[key] = available;
      if (dayInstructors.size > 0) {
        instructorsByDate[key] = Array.from(dayInstructors);
      }

      if (Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day) >= toMs)
        break;
      dateParts = addDaysToDateParts(dateParts, 1);
    }

    const dateMapResult = { dates: result, instructorsByDate, holidays: Array.from(holidaySet) };
    await writeAutoscuoleCache(dateMapCacheKey, dateMapResult, 60); // 60s TTL
    return {
      success: true,
      data: dateMapResult,
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

    if (membership.role !== "admin" && !isInstructor(membership.autoscuolaRole)) {
      return { success: false, message: "Operazione consentita solo agli istruttori." };
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

    // Governance resolved with cascade cluster → company for this instructor.
    const governance = await getBookingGovernanceForInstructor(membership.companyId, ownInstructor.id);
    if (
      governance.appBookingActors !== "instructors" &&
      governance.appBookingActors !== "both"
    ) {
      return {
        success: false,
        message: "La prenotazione da app è abilitata solo per allievi.",
      };
    }

    const [student, limits] = await Promise.all([
      ensureStudentMembership(membership.companyId, payload.studentId),
      getCachedCompanyServiceLimits(membership.companyId),
    ]);
    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

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

    // Resolve instructor + vehicle set through the SAME engine as the booking
    // flow (license+transmission, exclusive/pool/open, follow car, real busy
    // intervals incl. the appointmentVehicles join and group-lesson containers,
    // publication mode, maintenance excluded). This replaced the legacy
    // "findFirst open availability-slot row" mechanism, which bypassed all of
    // those rules and trusted stale slot rows.
    const assignmentCtx = await buildSlotAssignmentContext({
      companyId: membership.companyId,
      rangeStart: dayBounds.start,
      rangeEnd: dayBounds.end,
    });
    const assignment = resolveSlotAssignmentForStudent(assignmentCtx, {
      licenseCategory: student.licenseCategory ?? null,
      transmission: student.transmission ?? null,
      startsAt: offer.slot.startsAt,
      endsAt: offer.slot.endsAt,
    });
    if (!assignment) {
      return { success: false, message: "Slot non disponibile." };
    }
    const assignedVehicleIds = [assignment.vehicleId, assignment.followVehicleId].filter(
      (id): id is string => !!id,
    );

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
        where: { id: offer.slotId, status: "open" },
        data: { status: "booked" },
      });
      if (bookedSlots.count < 1) {
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

      // Race guard: the assignment was resolved against a snapshot — re-check
      // the chosen instructor/vehicles against REAL appointments inside the tx
      // (the legacy count-3-slot-rows guard trusted stale slot rows instead).
      const conflicting = await tx.autoscuolaAppointment.findFirst({
        where: {
          companyId: membership.companyId,
          status: { notIn: ["cancelled"] },
          startsAt: { lt: offer.slot.endsAt },
          endsAt: { gt: offer.slot.startsAt },
          OR: [
            { instructorId: assignment.instructorId },
            ...(assignedVehicleIds.length
              ? [
                  { vehicleId: { in: assignedVehicleIds } },
                  { appointmentVehicles: { some: { vehicleId: { in: assignedVehicleIds } } } },
                ]
              : []),
          ],
        },
        select: { id: true },
      });
      if (conflicting) {
        throw new Error("Slot non disponibile.");
      }

      // Keep the legacy slot rows coherent: mark the assigned instructor and
      // vehicle(s) as booked at this time (rows may not exist yet — upsert).
      const slotOwners: Array<{ ownerType: string; ownerId: string }> = [
        { ownerType: "instructor", ownerId: assignment.instructorId },
        ...assignedVehicleIds.map((id) => ({ ownerType: "vehicle", ownerId: id })),
      ];
      for (const owner of slotOwners) {
        await tx.autoscuolaAvailabilitySlot.upsert({
          where: {
            companyId_ownerType_ownerId_startsAt: {
              companyId: membership.companyId,
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
              startsAt: offer.slot.startsAt,
            },
          },
          update: { endsAt: offer.slot.endsAt, status: "booked" },
          create: {
            companyId: membership.companyId,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            startsAt: offer.slot.startsAt,
            endsAt: offer.slot.endsAt,
            status: "booked",
          },
        });
      }

      // Default location: link student-initiated bookings to the company sede
      const waitlistAcceptLoc = await tx.autoscuolaLocation.findFirst({
        where: { companyId: membership.companyId, isDefault: true, archivedAt: null },
        select: { id: true },
      });
      const appointment = await tx.autoscuolaAppointment.create({
        data: {
          id: appointmentId,
          companyId: membership.companyId,
          studentId: payload.studentId,
          bookingSource: BOOKING_SOURCE.slotFill,
          type:
            enforceRequiredTypes && compatibleRequiredTypes.length === 1
              ? compatibleRequiredTypes[0]
              : "guida",
          startsAt: offer.slot.startsAt,
          endsAt: offer.slot.endsAt,
          status: "scheduled",
          instructorId: assignment.instructorId,
          vehicleId: assignment.vehicleId,
          locationId: waitlistAcceptLoc?.id ?? null,
          slotId: offer.slotId,
          // Reserve every vehicle this lesson uses (primary + follow car), like
          // the main booking flow — busy-builders read this join.
          ...(assignment.vehicleId
            ? {
                appointmentVehicles: {
                  create: [
                    { vehicleId: assignment.vehicleId, role: "primary" },
                    ...(assignment.followVehicleId
                      ? [{ vehicleId: assignment.followVehicleId, role: "follow" }]
                      : []),
                  ],
                },
              }
            : {}),
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

    // Assignment gate: hide offers the engine couldn't actually pair for THIS
    // student (license+transmission, pool/exclusive, follow car, real busy
    // intervals) — mirrors the accept path so a visible offer is bookable.
    const assignableByOfferId = new Map<string, boolean>();
    if (offers.length) {
      const offerStartMs = offers.map((o) => o.slot.startsAt.getTime());
      const offerEndMs = offers.map((o) => o.slot.endsAt.getTime());
      const assignmentCtx = await buildSlotAssignmentContext({
        companyId: membership.companyId,
        rangeStart: new Date(Math.min(...offerStartMs)),
        rangeEnd: new Date(Math.max(...offerEndMs)),
      });
      for (const offer of offers) {
        assignableByOfferId.set(
          offer.id,
          resolveSlotAssignmentForStudent(assignmentCtx, {
            licenseCategory: student.licenseCategory ?? null,
            transmission: student.transmission ?? null,
            startsAt: offer.slot.startsAt,
            endsAt: offer.slot.endsAt,
          }) !== null,
        );
      }
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
      .filter((offer) => assignableByOfferId.get(offer.id) === true)
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
    if (!appointment.studentId) continue; // studentless exam placeholder
    const list = appointmentsByStudent.get(appointment.studentId) ?? [];
    list.push({ startsAt: appointment.startsAt, endsAt: appointment.endsAt });
    appointmentsByStudent.set(appointment.studentId, list);
  }

  // Assignment gate: only notify students the engine could ACTUALLY pair with
  // an instructor + vehicle set at this time (license+transmission, pool/
  // exclusive, follow car, real busy intervals) — same rules as the accept
  // path, so an offer never reaches someone who couldn't take it.
  const assignmentCtx = await buildSlotAssignmentContext({
    companyId,
    rangeStart: dayBounds.start,
    rangeEnd: dayBounds.end,
  });

  const availableStudents = students.filter((student) => {
    const availability = availabilityByStudent.get(student.user.id);
    if (!isAvailabilityCovering(availability, slot.startsAt, slot.endsAt)) {
      return false;
    }
    const booked = appointmentsByStudent.get(student.user.id) ?? [];
    if (hasAppointmentConflict(booked, slot.startsAt, slot.endsAt)) return false;
    return (
      resolveSlotAssignmentForStudent(assignmentCtx, {
        licenseCategory: student.licenseCategory ?? null,
        transmission: student.transmission ?? null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      }) !== null
    );
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
  const title = "⏰ Slot guida disponibile";

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

// ── Group lesson invites (Guide di gruppo) ────────────────────────────
// Invite eligible students to self-enrol into a group lesson. Mirrors the
// waitlist offer pattern, but seats live on the AutoscuolaGroupLesson container
// (capacity), so accept fills a seat via an optimistic-locked transaction
// (SELECT ... FOR UPDATE on the lesson row) instead of booking availability slots.

const GROUP_LESSON_ACTIVE_STATUSES = ["scheduled", "confirmed", "proposal", "checked_in"];

const respondGroupLessonInviteSchema = z.object({
  inviteId: z.string().uuid(),
  studentId: z.string().uuid(),
  response: z.enum(["accept", "decline"]),
});

const getGroupLessonInvitesSchema = z.object({
  studentId: z.string().uuid(),
  // Raised from 20 (2026-07-06, Robatto): the joinable-lessons list is the
  // student's ONLY window on group lessons — with 3-4 lessons/day a cap of 20
  // hid everything beyond ~2 weeks ("vedo le guide di gruppo solo fino al 23").
  limit: z.number().int().min(1).max(100).optional(),
  /** Count/badge mode: skips the ensure-invite writes (no inviteId needed). */
  countOnly: z.boolean().optional(),
});

const inviteToGroupLessonSchema = z.object({
  groupLessonId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(168).optional(),
});

type GroupLessonVehicleLicense = {
  licenseCategory: string | null;
  transmission: string | null;
} | null;

/**
 * Create an invite for a group lesson and notify all eligible students
 * (opted-in, license-compatible with the lesson vehicle when the vehicles
 * module is on, available, no time conflict, not already enrolled). Returns the
 * created invite (or null if the lesson is full / has no open seats).
 */
export async function broadcastGroupLessonInvite({
  companyId,
  groupLessonId,
  expiresAt,
}: {
  companyId: string;
  groupLessonId: string;
  expiresAt: Date;
}) {
  const gl = await prisma.autoscuolaGroupLesson.findFirst({
    where: { id: groupLessonId, companyId, status: "scheduled" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      kind: true,
      vehicle: { select: { licenseCategory: true, transmission: true } },
      fleetVehicles: {
        select: { vehicle: { select: { id: true, licenseCategory: true, transmission: true } } },
      },
      appointments: {
        where: { status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
        select: { studentId: true },
      },
    },
  });
  if (!gl || !gl.endsAt) return null;
  const openSeats = gl.capacity - gl.appointments.length;
  if (openSeats <= 0) return null;

  // Keep at most ONE active invite per group lesson: supersede any previous
  // broadcasted invites for this lesson before creating the new one. Avoids the
  // student seeing N notifications for the same lesson after re-inviting.
  await prisma.autoscuolaGroupLessonInvite.updateMany({
    where: { groupLessonId: gl.id, status: "broadcasted" },
    data: { status: "superseded" },
  });

  const invite = await prisma.autoscuolaGroupLessonInvite.create({
    data: {
      companyId,
      groupLessonId: gl.id,
      status: "broadcasted",
      sentAt: new Date(),
      expiresAt,
    },
  });

  const enrolled = new Set(gl.appointments.map((a) => a.studentId));
  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  const vehiclesEnabled =
    (service?.limits as Record<string, unknown> | null)?.vehiclesEnabled !== false;
  const vehicle: GroupLessonVehicleLicense = gl.vehicle ?? null;

  const students = await prisma.companyMember.findMany({
    where: { companyId, autoscuolaRole: "STUDENT", groupLessonsOptIn: true },
    include: { user: { select: { id: true, email: true, phone: true } } },
  });
  const candidateIds = students
    .map((s) => s.user.id)
    .filter((id) => !enrolled.has(id));
  if (!candidateIds.length) return invite;

  // A group lesson is a fixed-time event the school offers, NOT a student-driven
  // booking — so we do NOT require the student to have declared a weekly
  // availability covering the slot (that gate excluded students with no
  // availability set). Eligibility = opted-in + license-compatible + not already
  // busy at that exact time.
  const dayBounds = getDayBoundsForDate(gl.startsAt);
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId: { in: candidateIds },
      status: { not: "cancelled" },
      startsAt: { gte: dayBounds.start, lt: dayBounds.end },
    },
    select: { studentId: true, startsAt: true, endsAt: true },
  });
  const appointmentsByStudent = new Map<string, Array<{ startsAt: Date; endsAt: Date | null }>>();
  for (const appointment of appointments) {
    if (!appointment.studentId) continue; // studentless exam placeholder
    const list = appointmentsByStudent.get(appointment.studentId) ?? [];
    list.push({ startsAt: appointment.startsAt, endsAt: appointment.endsAt });
    appointmentsByStudent.set(appointment.studentId, list);
  }

  const broadcastFleet: FleetVehicle[] = gl.fleetVehicles.map((f) => f.vehicle);
  const eligible = students.filter((student) => {
    const id = student.user.id;
    if (enrolled.has(id)) return false;
    if (gl.kind === "moto") {
      // Moto group: any fleet moto must serve the license (hierarchy-only).
      // Before 2026-07-06 moto groups had NO license filter here (container
      // vehicle is null) — every opted-in student got the push.
      if (vehiclesEnabled && !eligibleForMotoGroup({ fleet: broadcastFleet, student })) return false;
    } else if (vehiclesEnabled && vehicle && !vehicleServesLicense(vehicle, student)) {
      return false;
    }
    const booked = appointmentsByStudent.get(id) ?? [];
    if (hasAppointmentConflict(booked, gl.startsAt, gl.endsAt!)) return false;
    return true;
  });
  if (!eligible.length) return invite;

  const channels = normalizeChannels(
    (service?.limits as Record<string, unknown> | null)?.slotFillChannels,
    DEFAULT_SLOT_FILL_CHANNELS,
  );
  const formattedDate = gl.startsAt.toLocaleDateString("it-IT", { timeZone: AUTOSCUOLA_TIMEZONE });
  const formattedTime = gl.startsAt.toLocaleTimeString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = "👥 Guida di gruppo disponibile";
  const message = `C'è posto in una guida di gruppo il ${formattedDate} alle ${formattedTime}. Apri Reglo per iscriverti.`;

  if (channels.includes("push")) {
    const userIds = Array.from(new Set(eligible.map((s) => s.user.id)));
    if (userIds.length) {
      try {
        await sendAutoscuolaPushToUsers({
          companyId,
          userIds,
          title,
          body: message,
          data: {
            kind: "group_lesson_invite",
            inviteId: invite.id,
            groupLessonId: gl.id,
            startsAt: gl.startsAt.toISOString(),
          },
        });
      } catch (error) {
        console.error("Group lesson invite push error", error);
      }
    }
  }
  for (const student of eligible) {
    if (channels.includes("email") && student.user.email) {
      try {
        await sendDynamicEmail({ to: student.user.email, subject: title, body: message });
      } catch (error) {
        console.error("Group lesson invite email error", error);
      }
    }
    if (channels.includes("whatsapp") && student.user.phone) {
      try {
        await sendAutoscuolaWhatsApp({ to: student.user.phone, body: message });
      } catch (error) {
        console.error("Group lesson invite WhatsApp error", error);
      }
    }
  }

  return invite;
}

/** Owner/instructor-triggered broadcast of a group-lesson invite. */
export async function inviteToGroupLesson(input: z.infer<typeof inviteToGroupLessonSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = inviteToGroupLessonSchema.parse(input);

    const gl = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: payload.groupLessonId, companyId: membership.companyId, status: "scheduled" },
      select: { id: true, startsAt: true },
    });
    if (!gl) return { success: false as const, message: "Guida di gruppo non trovata." };

    // Expire at the lesson start or in `expiresInHours` (default 24h), whichever is sooner.
    const hours = payload.expiresInHours ?? 24;
    const byHours = new Date(Date.now() + hours * 60 * 60 * 1000);
    const expiresAt = gl.startsAt < byHours ? gl.startsAt : byHours;
    if (expiresAt <= new Date()) {
      return { success: false as const, message: "La guida è già iniziata." };
    }

    const invite = await broadcastGroupLessonInvite({
      companyId: membership.companyId,
      groupLessonId: gl.id,
      expiresAt,
    });
    if (!invite) {
      return { success: false as const, message: "Nessun posto disponibile da invitare." };
    }
    return { success: true as const, data: { inviteId: invite.id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function respondGroupLessonInvite(
  input: z.infer<typeof respondGroupLessonInviteSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = respondGroupLessonInviteSchema.parse(input);
    const companyId = membership.companyId;
    const now = new Date();

    const invite = await prisma.autoscuolaGroupLessonInvite.findFirst({
      where: { id: payload.inviteId, companyId },
      include: {
        groupLesson: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            capacity: true,
            status: true,
            kind: true,
            instructorId: true,
            followVehicleId: true,
            priceAmount: true,
            notes: true,
            vehicle: { select: { id: true, licenseCategory: true, transmission: true } },
            fleetVehicles: {
              select: { vehicle: { select: { id: true, licenseCategory: true, transmission: true } } },
            },
          },
        },
      },
    });
    if (!invite) return { success: false as const, message: "Invito non trovato." };
    if (invite.status !== "broadcasted" || invite.expiresAt < now) {
      return { success: false as const, message: "Invito non più valido." };
    }
    const gl = invite.groupLesson;
    if (!gl || gl.status !== "scheduled" || !gl.endsAt) {
      return { success: false as const, message: "Guida di gruppo non più disponibile." };
    }

    const member = await prisma.companyMember.findFirst({
      where: { companyId, autoscuolaRole: "STUDENT", userId: payload.studentId },
      select: { userId: true, groupLessonsOptIn: true, licenseCategory: true, transmission: true },
    });
    if (!member) return { success: false as const, message: "Allievo non valido." };

    const existingResponse = await prisma.autoscuolaGroupLessonInviteResponse.findFirst({
      where: { inviteId: invite.id, studentId: payload.studentId },
      select: { id: true },
    });
    if (existingResponse) {
      return { success: false as const, message: "Hai già risposto a questo invito." };
    }

    if (payload.response === "decline") {
      await prisma.autoscuolaGroupLessonInviteResponse.create({
        data: {
          inviteId: invite.id,
          studentId: payload.studentId,
          status: "declined",
          respondedAt: now,
        },
      });
      return { success: true as const, data: { accepted: false } };
    }

    // Accept path — validate eligibility before competing for a seat.
    if (!member.groupLessonsOptIn) {
      return { success: false as const, message: "Non sei abilitato alle guide di gruppo." };
    }
    const service = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const vehiclesEnabled =
      (service?.limits as Record<string, unknown> | null)?.vehiclesEnabled !== false;
    const isMoto = gl.kind === "moto";
    const motoFleet: FleetVehicle[] = gl.fleetVehicles.map((f) => f.vehicle);
    if (isMoto) {
      // Eligible iff any fleet moto serves the license (hierarchy-only;
      // participants may outnumber the motos and ride in turns).
      if (!eligibleForMotoGroup({ fleet: motoFleet, student: member })) {
        return { success: false as const, message: "La tua patente non è compatibile con questa guida." };
      }
      // Lazy follow car: only for the FIRST rider of a car-less lesson (when
      // the rules demand it). With riders already in, a missing car means the
      // staff explicitly removed it — their choice wins, never re-assign.
      if (
        !gl.followVehicleId &&
        vehiclesEnabled &&
        groupMotoFollowCarRequired(
          parseFollowCarRulesFromLimits((service?.limits ?? {}) as Record<string, unknown>),
          motoFleet.map((m) => m.licenseCategory),
        )
      ) {
        const riders = await prisma.autoscuolaAppointment.count({
          where: { groupLessonId: gl.id, status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
        });
        if (riders === 0) {
          const car = await findFreeGroupFollowCar({
            companyId,
            instructorId: gl.instructorId,
            startsAt: gl.startsAt,
            endsAt: gl.endsAt,
            excludeGroupLessonId: gl.id,
          });
          if (!car) {
            return {
              success: false as const,
              message: "Nessuna auto al seguito disponibile per questa guida: contatta l'autoscuola.",
            };
          }
          await prisma.autoscuolaGroupLesson.updateMany({
            where: { id: gl.id, followVehicleId: null },
            data: { followVehicleId: car },
          });
        }
      }
    } else if (vehiclesEnabled && gl.vehicle && !vehicleServesLicense(gl.vehicle, member)) {
      return { success: false as const, message: "La tua patente non è compatibile con questa guida." };
    }

    const dayBounds = getDayBoundsForDate(gl.startsAt);
    const studentAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        studentId: payload.studentId,
        status: { not: "cancelled" },
        startsAt: { gte: dayBounds.start, lt: dayBounds.end },
      },
      select: { startsAt: true, endsAt: true },
    });
    if (hasAppointmentConflict(studentAppointments, gl.startsAt, gl.endsAt)) {
      return { success: false as const, message: "Hai già un impegno in questa fascia oraria." };
    }

    const { penaltyCutoffAt, penaltyAmount } = await getGroupLessonPenaltySnapshot({
      companyId,
      startsAt: gl.startsAt,
      price: Number(gl.priceAmount),
    });

    const result = await prisma.$transaction(async (tx) => {
      // Serialize concurrent accepts on this lesson so the seat count is exact.
      await tx.$queryRaw`SELECT id FROM "AutoscuolaGroupLesson" WHERE id = ${gl.id}::uuid FOR UPDATE`;

      const activeSeats = await tx.autoscuolaAppointment.findMany({
        where: { groupLessonId: gl.id, status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
        select: { vehicleId: true },
      });
      if (activeSeats.length >= gl.capacity) {
        throw new Error("Posti esauriti.");
      }

      // Moto group: auto-assign a still-free fleet moto matching the student
      // (best-effort — none free = the student rides in turns).
      let assignedVehicleId: string | null = gl.vehicle?.id ?? null;
      if (isMoto) {
        const taken = activeSeats
          .map((s) => s.vehicleId)
          .filter((v): v is string => Boolean(v));
        assignedVehicleId = assignMotoForStudent({
          fleet: motoFleet,
          takenVehicleIds: taken,
          student: member,
        });
      }

      await tx.autoscuolaGroupLessonInviteResponse.create({
        data: {
          inviteId: invite.id,
          studentId: payload.studentId,
          status: "accepted",
          respondedAt: now,
        },
      });

      const appointment = await tx.autoscuolaAppointment.create({
        data: {
          companyId,
          studentId: payload.studentId,
          bookingSource: BOOKING_SOURCE.groupLesson,
          type: "group_lesson",
          startsAt: gl.startsAt,
          endsAt: gl.endsAt,
          status: "scheduled",
          instructorId: gl.instructorId,
          vehicleId: assignedVehicleId,
          // Moto group participants carry their assigned moto as primary; the
          // shared follow car is reserved on the group container only.
          notes: gl.notes,
          groupLessonId: gl.id,
          paymentRequired: true,
          paymentStatus: "pending",
          manualPaymentStatus: "unpaid",
          priceAmount: gl.priceAmount,
          penaltyAmount,
          penaltyCutoffAt,
          creditApplied: false,
          ...(isMoto && assignedVehicleId
            ? { appointmentVehicles: { create: [{ vehicleId: assignedVehicleId, role: "primary" }] } }
            : {}),
        },
      });

      // Close the invite once the last seat is taken.
      if (activeSeats.length + 1 >= gl.capacity) {
        await tx.autoscuolaGroupLessonInvite.updateMany({
          where: { id: invite.id, status: "broadcasted" },
          data: { status: "filled" },
        });
      }

      return appointment;
    });

    await invalidateAgendaAndPaymentsCache(companyId);
    return { success: true as const, data: { accepted: true, appointmentId: result.id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Cancel a single group-lesson seat (student withdrawal or instructor removal).
 * Shared source of truth for the payment treatment + seat re-broadcast.
 * Authorization is the caller's responsibility — it must pass an
 * already-resolved appointment that belongs to `companyId`.
 *
 * Payment behaviour mirrors a normal lesson (option A): an early cancellation
 * (before `penaltyCutoffAt`) frees the seat with no charge; a late one — or a
 * removal after the lesson has happened — stays "da pagare" and surfaces in the
 * late-cancellations inbox via `cancellationKind` + `penaltyCutoffAt`.
 */
export async function cancelGroupLessonParticipantAppointment({
  companyId,
  appointmentId,
  actorUserId,
}: {
  companyId: string;
  appointmentId: string;
  actorUserId: string;
}): Promise<{ success: boolean; message?: string }> {
  const now = new Date();

  const appt = await prisma.autoscuolaAppointment.findFirst({
    where: {
      id: appointmentId,
      companyId,
      type: "group_lesson",
      status: { in: GROUP_LESSON_ACTIVE_STATUSES },
    },
    select: {
      id: true,
      studentId: true,
      groupLessonId: true,
      penaltyCutoffAt: true,
    },
  });
  if (!appt || !appt.groupLessonId) {
    return { success: false, message: "Partecipante non trovato." };
  }

  const cancelledBeforeCutoff =
    appt.penaltyCutoffAt != null && now < appt.penaltyCutoffAt;

  await prisma.autoscuolaAppointment.update({
    where: { id: appt.id },
    data: {
      status: "cancelled",
      cancelledAt: now,
      cancelledByUserId: actorUserId,
      cancellationKind: "manual_cancel",
      ...(cancelledBeforeCutoff
        ? {
            paymentRequired: false,
            paymentStatus: "not_required",
            manualPaymentStatus: null,
          }
        : {}),
    },
  });

  const gl = await prisma.autoscuolaGroupLesson.findFirst({
    where: { id: appt.groupLessonId, companyId },
    select: {
      id: true,
      startsAt: true,
      status: true,
      capacity: true,
      instructor: { select: { userId: true } },
      _count: {
        select: {
          appointments: { where: { status: { in: GROUP_LESSON_ACTIVE_STATUSES } } },
        },
      },
    },
  });

  if (gl) {
    const openSeats = gl.capacity - gl._count.appointments;
    const isUpcoming = gl.status === "scheduled" && gl.startsAt > now;

    // Free seat → re-broadcast an invite to the eligible students.
    if (isUpcoming && openSeats > 0) {
      const byHours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const expiresAt = gl.startsAt < byHours ? gl.startsAt : byHours;
      if (expiresAt > now) {
        try {
          await broadcastGroupLessonInvite({
            companyId,
            groupLessonId: gl.id,
            expiresAt,
          });
        } catch (error) {
          console.error("Group lesson re-broadcast error", error);
        }
      }
    }

    // A student withdrawing themselves notifies their instructor.
    const studentWithdrew = actorUserId === appt.studentId;
    if (studentWithdrew && gl.instructor?.userId) {
      const dateLabel = gl.startsAt.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: AUTOSCUOLA_TIMEZONE,
      });
      const timeLabel = gl.startsAt.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: AUTOSCUOLA_TIMEZONE,
      });
      const student = await prisma.user.findUnique({
        // Non-null: this is a group-lesson seat, which always has a student.
        where: { id: appt.studentId! },
        select: { name: true },
      });
      try {
        await sendAutoscuolaPushToUsers({
          companyId,
          userIds: [gl.instructor.userId],
          title: "Ritiro guida di gruppo",
          body: `${student?.name ?? "Un allievo"} si è ritirato dalla guida di gruppo di ${dateLabel} alle ${timeLabel}.`,
          data: {
            kind: "appointment_cancelled",
            appointmentId: appt.id,
            startsAt: gl.startsAt.toISOString(),
          },
        });
      } catch (error) {
        console.error("Group lesson withdrawal push error", error);
      }
    }
  }

  await invalidateAgendaAndPaymentsCache(companyId);
  return { success: true };
}

const withdrawFromGroupLessonSchema = z.object({
  groupLessonId: z.string().uuid(),
});

/** Student withdraws themselves from a group lesson they are enrolled in. */
export async function withdrawFromGroupLesson(
  input: z.infer<typeof withdrawFromGroupLessonSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = withdrawFromGroupLessonSchema.parse(input);
    const companyId = membership.companyId;

    const appt = await prisma.autoscuolaAppointment.findFirst({
      where: {
        companyId,
        groupLessonId: payload.groupLessonId,
        studentId: membership.userId,
        type: "group_lesson",
        status: { in: GROUP_LESSON_ACTIVE_STATUSES },
      },
      select: { id: true, startsAt: true },
    });
    if (!appt) return { success: false as const, message: "Iscrizione non trovata." };
    if (appt.startsAt <= new Date()) {
      return { success: false as const, message: "La guida è già iniziata." };
    }

    return await cancelGroupLessonParticipantAppointment({
      companyId,
      appointmentId: appt.id,
      actorUserId: membership.userId,
    });
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Group-lesson invites visible to a student (for the inbox + offline recovery). */
/**
 * Ensure a discovery-ready invite handle exists for a group lesson, WITHOUT
 * sending any notification (unlike `broadcastGroupLessonInvite`). Used by the
 * in-app student discovery list so the existing accept flow
 * (`respondGroupLessonInvite`, keyed by inviteId) keeps working for every
 * lesson surfaced — including partially-filled ones whose push-time invite has
 * expired, been superseded, or never existed.
 *
 * Returns an inviteId that is `broadcasted`, not expired (valid until lesson
 * start), and carries NO prior response from this student (so "Iscrivimi" never
 * hits the "Hai già risposto" guard). If the latest live invite was already
 * declined/answered by this student, it is superseded and a fresh handle issued.
 */
async function ensureDiscoverableGroupLessonInvite(
  companyId: string,
  groupLessonId: string,
  studentId: string,
  startsAt: Date,
): Promise<string> {
  const now = new Date();
  const live = await prisma.autoscuolaGroupLessonInvite.findFirst({
    where: { companyId, groupLessonId, status: "broadcasted" },
    orderBy: { sentAt: "desc" },
    select: { id: true, expiresAt: true },
  });
  if (live) {
    const responded = await prisma.autoscuolaGroupLessonInviteResponse.findFirst({
      where: { inviteId: live.id, studentId },
      select: { id: true },
    });
    if (!responded) {
      if (live.expiresAt <= now) {
        await prisma.autoscuolaGroupLessonInvite.update({
          where: { id: live.id },
          data: { expiresAt: startsAt },
        });
      }
      return live.id;
    }
    // This student already answered the live invite — supersede it so we can
    // hand back a clean handle (other students simply re-fetch the new one).
    await prisma.autoscuolaGroupLessonInvite.updateMany({
      where: { groupLessonId, status: "broadcasted" },
      data: { status: "superseded" },
    });
  }
  const created = await prisma.autoscuolaGroupLessonInvite.create({
    data: { companyId, groupLessonId, status: "broadcasted", sentAt: now, expiresAt: startsAt },
    select: { id: true },
  });
  return created.id;
}

export async function getGroupLessonInvites(
  input: z.infer<typeof getGroupLessonInvitesSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getGroupLessonInvitesSchema.parse(input);
    const companyId = membership.companyId;
    const now = new Date();
    const limit = payload.limit ?? 5;

    const member = await prisma.companyMember.findFirst({
      where: { companyId, autoscuolaRole: "STUDENT", userId: payload.studentId },
      select: { userId: true, groupLessonsOptIn: true, licenseCategory: true, transmission: true },
    });
    if (!member || !member.groupLessonsOptIn) return { success: true as const, data: [] };

    // Lesson-first discovery: surface EVERY scheduled, future, non-full group
    // lesson the opted-in student can still join — not just lessons that happen
    // to carry a live invite row. An invite is just the push-notification nudge;
    // open seats stay joinable in-app until the lesson starts.
    const [lessons, appointments, service, declinedResponses] = await Promise.all([
      prisma.autoscuolaGroupLesson.findMany({
        where: { companyId, status: "scheduled", startsAt: { gt: now } },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          kind: true,
          notes: true,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true, licenseCategory: true, transmission: true } },
          fleetVehicles: {
            select: { vehicle: { select: { id: true, licenseCategory: true, transmission: true } } },
          },
          appointments: {
            where: { status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
            select: { studentId: true },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 200,
      }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: payload.studentId,
          status: { not: "cancelled" },
          startsAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { startsAt: true, endsAt: true },
      }),
      prisma.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
      // Lessons this student has explicitly declined ("Non mi interessa") — kept
      // hidden so the decline sticks and the home count drops. Checked across ALL
      // of the lesson's invites (invite rows churn as seats fill / re-broadcast).
      prisma.autoscuolaGroupLessonInviteResponse.findMany({
        where: { studentId: payload.studentId, status: "declined", invite: { companyId } },
        select: { invite: { select: { groupLessonId: true } } },
      }),
    ]);

    const vehiclesEnabled =
      (service?.limits as Record<string, unknown> | null)?.vehiclesEnabled !== false;
    const declinedLessonIds = new Set(declinedResponses.map((r) => r.invite.groupLessonId));

    const eligible = lessons
      .filter((gl) => {
        if (!gl.endsAt) return false;
        if (declinedLessonIds.has(gl.id)) return false;
        if (gl.appointments.some((a) => a.studentId === payload.studentId)) return false;
        if (gl.appointments.length >= gl.capacity) return false;
        if (gl.kind === "moto") {
          // Moto group: any fleet moto must serve the license (hierarchy-only).
          // Before 2026-07-06 moto groups were listed to EVERY opted-in student
          // (container vehicle is null → the standard check passed everyone).
          if (
            vehiclesEnabled &&
            !eligibleForMotoGroup({ fleet: gl.fleetVehicles.map((f) => f.vehicle), student: member })
          ) {
            return false;
          }
        } else if (vehiclesEnabled && gl.vehicle && !vehicleServesLicense(gl.vehicle, member)) {
          return false;
        }
        if (hasAppointmentConflict(appointments, gl.startsAt, gl.endsAt)) return false;
        return true;
      })
      .slice(0, limit);

    const visible = await Promise.all(
      eligible.map(async (gl) => {
        // countOnly (home badge) only needs the eligible list length — skip
        // the per-lesson ensure-invite writes, the caller never opens them.
        const inviteId = payload.countOnly
          ? null
          : await ensureDiscoverableGroupLessonInvite(
              companyId,
              gl.id,
              payload.studentId,
              gl.startsAt,
            );
        return {
          inviteId,
          groupLessonId: gl.id,
          startsAt: gl.startsAt.toISOString(),
          endsAt: gl.endsAt!.toISOString(),
          capacity: gl.capacity,
          kind: gl.kind,
          filledSeats: gl.appointments.length,
          openSeats: Math.max(0, gl.capacity - gl.appointments.length),
          instructorName: gl.instructor?.name ?? null,
          // For a moto group the moto is assigned only at acceptance, so the
          // discovery list has no specific vehicle to show — surface `kind` so
          // the mobile invite card can say "ti verrà assegnata una moto".
          vehicleName: gl.vehicle?.name ?? null,
          notes: gl.notes,
          expiresAt: gl.startsAt.toISOString(),
        };
      }),
    );

    return { success: true as const, data: visible };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
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
        type: { not: "esame" },
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
        groupLessonId: true,
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

    // Check if vehicles module is enabled
    const oobService = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const oobVehiclesEnabled = ((oobService?.limits ?? {}) as Record<string, unknown>).vehiclesEnabled !== false;

    // Collect unique instructor/vehicle IDs
    const instructorIds = [...new Set(appointments.map((a) => a.instructorId).filter(Boolean))] as string[];
    const vehicleIds = oobVehiclesEnabled
      ? [...new Set(appointments.map((a) => a.vehicleId).filter(Boolean))] as string[]
      : [];
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
      groupLessonId: string | null;
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
          groupLessonId: apt.groupLessonId ?? null,
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

// ── Publication Mode ──────────────────────────────────────────────────────────

const publishWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instructorId: z.string().uuid().optional(),
});

export async function publishInstructorWeek(input: z.infer<typeof publishWeekSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = publishWeekSchema.parse(input);
    const companyId = membership.companyId;

    // Resolve instructor: owner can pass instructorId, instructor publishes own
    let instructorId: string;
    if (payload.instructorId && (isOwner(membership.autoscuolaRole) || membership.role === "admin")) {
      instructorId = payload.instructorId;
    } else {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Profilo istruttore non trovato." };
      instructorId = instr.id;
    }

    // Validate weekStart is a Monday
    const weekStart = new Date(payload.weekStart + "T00:00:00Z");
    if (Number.isNaN(weekStart.getTime()) || weekStart.getUTCDay() !== 1) {
      return { success: false as const, message: "La data deve essere un lunedì." };
    }

    // For each day of the week: if no override exists, copy from the last published week's overrides.
    // If no previous published week, copy from the default weekly availability.
    const lastPublished = await prisma.autoscuolaInstructorPublishedWeek.findFirst({
      where: { companyId, instructorId, weekStart: { lt: weekStart } },
      orderBy: { weekStart: "desc" },
      select: { weekStart: true },
    });

    const existingOverrides = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
      where: {
        companyId,
        ownerType: "instructor",
        ownerId: instructorId,
        date: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * 86400000) },
      },
    });
    const existingDates = new Set(
      existingOverrides.map((o) => {
        const d = new Date(o.date);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      }),
    );

    // Load source for missing days
    let sourceOverrides: Array<{ date: Date; ranges: unknown }> = [];
    let defaultAvail: AvailabilityRecord | null = null;

    if (lastPublished) {
      const lpStart = new Date(lastPublished.weekStart);
      sourceOverrides = await prisma.autoscuolaDailyAvailabilityOverride.findMany({
        where: {
          companyId,
          ownerType: "instructor",
          ownerId: instructorId,
          date: { gte: lpStart, lt: new Date(lpStart.getTime() + 7 * 86400000) },
        },
        select: { date: true, ranges: true },
      });
    }
    if (!sourceOverrides.length) {
      const weeklyAvail = await prisma.autoscuolaWeeklyAvailability.findFirst({
        where: { companyId, ownerType: "instructor", ownerId: instructorId },
      });
      if (weeklyAvail) {
        defaultAvail = defaultToAvailabilityRecord(weeklyAvail);
      }
    }

    // Create missing overrides
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const entryDate = new Date(weekStart.getTime() + dayOffset * 86400000);
      const dateStr = `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, "0")}-${String(entryDate.getUTCDate()).padStart(2, "0")}`;
      if (existingDates.has(dateStr)) continue;

      let ranges: TimeRange[] = [];
      if (sourceOverrides.length) {
        // Find matching day of week from source
        const sourceDayOffset = dayOffset;
        const sourceEntry = sourceOverrides.find((o) => {
          const d = new Date(o.date);
          const lpDow = (d.getUTCDay() + 6) % 7; // Mon=0
          return lpDow === sourceDayOffset;
        });
        if (sourceEntry) {
          ranges = parseRanges(sourceEntry.ranges);
        }
      } else if (defaultAvail) {
        const dayOfWeek = dayOffset === 6 ? 0 : dayOffset + 1; // Convert Mon=0..Sun=6 to Sun=0..Sat=6
        // rangesForDay honours per-day schedules (rangesByDay): with a per-day
        // base, defaultToAvailabilityRecord leaves the flat `ranges` EMPTY, so
        // reading it directly materialized every day as OFF (bug 2026-07-07).
        ranges = rangesForDay(defaultAvail, dayOfWeek);
      }
      // Ranges empty = day off

      await prisma.autoscuolaDailyAvailabilityOverride.upsert({
        where: {
          companyId_ownerType_ownerId_date: {
            companyId,
            ownerType: "instructor",
            ownerId: instructorId,
            date: entryDate,
          },
        },
        update: { ranges },
        create: {
          companyId,
          ownerType: "instructor",
          ownerId: instructorId,
          date: entryDate,
          ranges,
        },
      });
    }

    // Upsert published week
    const published = await prisma.autoscuolaInstructorPublishedWeek.upsert({
      where: {
        companyId_instructorId_weekStart: { companyId, instructorId, weekStart },
      },
      update: { publishedAt: new Date() },
      create: { companyId, instructorId, weekStart },
    });

    // Notify assigned students if instructor has autonomousMode
    const instructor = await prisma.autoscuolaInstructor.findUnique({
      where: { id: instructorId },
      select: { autonomousMode: true, name: true, assignedStudents: { select: { userId: true } } },
    });
    if (instructor?.autonomousMode && instructor.assignedStudents.length > 0) {
      const studentUserIds = instructor.assignedStudents.map((s) => s.userId);
      const weekLabel = weekStart.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Rome",
      });
      await sendAutoscuolaPushToUsers({
        companyId,
        userIds: studentUserIds,
        title: "📅 Nuove disponibilità",
        body: `Il tuo istruttore ha pubblicato la disponibilità per la settimana del ${weekLabel}. Prenota la tua guida!`,
        data: {
          kind: "availability_published",
          instructorId,
          instructorName: instructor.name,
          weekStart: payload.weekStart,
        },
      });
    }

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const, data: published };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const unpublishWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instructorId: z.string().uuid().optional(),
});

export async function unpublishInstructorWeek(input: z.infer<typeof unpublishWeekSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = unpublishWeekSchema.parse(input);
    const companyId = membership.companyId;

    let instructorId: string;
    if (payload.instructorId && (isOwner(membership.autoscuolaRole) || membership.role === "admin")) {
      instructorId = payload.instructorId;
    } else {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Profilo istruttore non trovato." };
      instructorId = instr.id;
    }

    const weekStart = new Date(payload.weekStart + "T00:00:00Z");
    if (Number.isNaN(weekStart.getTime()) || weekStart.getUTCDay() !== 1) {
      return { success: false as const, message: "La data deve essere un lunedì." };
    }

    // Delete published week record (NOT the overrides)
    await prisma.autoscuolaInstructorPublishedWeek.deleteMany({
      where: { companyId, instructorId, weekStart },
    });

    // Reset availabilityOverrideApproved for appointments in this week
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        instructorId,
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

const getPublishedWeeksSchema = z.object({
  instructorId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function getInstructorPublishedWeeks(input: z.infer<typeof getPublishedWeeksSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getPublishedWeeksSchema.parse(input);
    const companyId = membership.companyId;

    let instructorId = payload.instructorId;
    if (!instructorId) {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Profilo istruttore non trovato." };
      instructorId = instr.id;
    }

    const weekStartFilter: { gte?: Date; lte?: Date } = {};
    if (payload.from) weekStartFilter.gte = new Date(payload.from + "T00:00:00Z");
    if (payload.to) weekStartFilter.lte = new Date(payload.to + "T00:00:00Z");

    const weeks = await prisma.autoscuolaInstructorPublishedWeek.findMany({
      where: {
        companyId,
        instructorId,
        ...(Object.keys(weekStartFilter).length ? { weekStart: weekStartFilter } : {}),
      },
      orderBy: { weekStart: "asc" },
    });

    return {
      success: true as const,
      data: weeks.map((w) => ({
        id: w.id,
        weekStart: w.weekStart instanceof Date
          ? `${w.weekStart.getUTCFullYear()}-${String(w.weekStart.getUTCMonth() + 1).padStart(2, "0")}-${String(w.weekStart.getUTCDate()).padStart(2, "0")}`
          : String(w.weekStart),
        publishedAt: w.publishedAt.toISOString(),
      })),
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ── Publication Mode Gating ───────────────────────────────────────────────────

export async function getPublicationModeFilter(
  companyId: string,
  instructorIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<(instructorId: string, date: Date) => boolean> {
  if (!instructorIds.length) return () => true;

  // Load all instructors with their settings
  const instructors = await prisma.autoscuolaInstructor.findMany({
    where: { companyId, id: { in: instructorIds }, status: { not: "inactive" } },
    select: { id: true, settings: true },
  });

  const { parseInstructorSettings } = await import("@/lib/autoscuole/instructor-clusters");
  const publicationModeIds = new Set<string>();
  for (const instr of instructors) {
    const settings = parseInstructorSettings(instr.settings);
    if (settings.availabilityMode === "publication") {
      publicationModeIds.add(instr.id);
    }
  }

  if (!publicationModeIds.size) return () => true;

  // Expand rangeStart backwards to the Monday of its week (in Europe/Rome) so
  // we catch published weeks whose weekStart ≤ rangeStart but still cover it.
  // IMPORTANT: must use the Italian-zoned week start, not UTC. The caller
  // typically passes midnight Europe/Rome which is 22:00 UTC of the previous
  // day — naive UTC arithmetic would shift the week by 1 day on every Monday.
  const adjustedStart = getWeekStart(rangeStart);

  // Load published weeks for publication-mode instructors in range
  const publishedWeeks = await prisma.autoscuolaInstructorPublishedWeek.findMany({
    where: {
      companyId,
      instructorId: { in: Array.from(publicationModeIds) },
      weekStart: { gte: adjustedStart, lte: rangeEnd },
    },
  });

  // Build a set of `instructorId:weekStart` for quick lookup. `weekStart` is a
  // `@db.Date` column so Prisma returns it as a Date at UTC midnight, which is
  // exactly the format produced by getWeekStart() — safe to compare via UTC parts.
  const formatWeekKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const publishedSet = new Set<string>();
  for (const pw of publishedWeeks) {
    publishedSet.add(`${pw.instructorId}:${formatWeekKey(pw.weekStart)}`);
  }

  return (instructorId: string, date: Date) => {
    if (!publicationModeIds.has(instructorId)) return true;
    // Compute week start (Monday) in Europe/Rome — naive UTC arithmetic would
    // be off by 1 day for any date whose CEST midnight falls on the previous
    // UTC day (i.e. every Monday in CEST, and a few hours of every other day).
    const ws = formatWeekKey(getWeekStart(date));
    return publishedSet.has(`${instructorId}:${ws}`);
  };
}
