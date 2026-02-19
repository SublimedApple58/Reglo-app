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
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  weeks: z.number().int().min(1).max(12).optional(),
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
});

const bookingOptionsSchema = z.object({
  studentId: z.string().uuid(),
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

const isWeeklyAvailabilityCovering = (
  availability:
    | { daysOfWeek: number[]; startMinutes: number; endMinutes: number }
    | null
    | undefined,
  startsAt: Date,
  endsAt: Date,
) => {
  if (!availability) return false;
  const dayOfWeek = dayOfWeekFromDate(startsAt);
  if (!availability.daysOfWeek.includes(dayOfWeek)) return false;
  if (availability.endMinutes <= availability.startMinutes) return false;
  const startMinutes = minutesFromDate(startsAt);
  const endMinutes = minutesFromDate(endsAt);
  return (
    startMinutes >= availability.startMinutes &&
    endMinutes <= availability.endMinutes
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
      },
      create: {
        companyId: membership.companyId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        daysOfWeek,
        startMinutes,
        endMinutes,
      },
    });

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

    const availabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
      where: availabilityWhere,
    });

    const slots = availabilities.flatMap((availability) => {
      if (!availability.daysOfWeek.includes(dayOfWeek)) return [];
      if (availability.endMinutes <= availability.startMinutes) return [];
      const startMinutes = Math.ceil(availability.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
      const lastStart = availability.endMinutes - SLOT_MINUTES;
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
      return ownerSlots;
    });

    slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return { success: true, data: slots };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createBookingRequest(input: z.infer<typeof bookingRequestSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = bookingRequestSchema.parse(input);
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

    const maxDays = payload.maxDays ?? DEFAULT_MAX_DAYS;
    const [activeInstructors, activeVehicles, studentAvailability, autoscuolaService] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
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

    const [instructorAvailabilities, vehicleAvailabilities] = await Promise.all([
      activeInstructorIds.length
        ? prisma.autoscuolaWeeklyAvailability.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "instructor",
              ownerId: { in: activeInstructorIds },
            },
          })
        : [],
      activeVehicleIds.length
        ? prisma.autoscuolaWeeklyAvailability.findMany({
            where: {
              companyId: membership.companyId,
              ownerType: "vehicle",
              ownerId: { in: activeVehicleIds },
            },
          })
        : [],
    ]);

    const instructorAvailabilityMap = new Map(
      instructorAvailabilities.map((availability) => [
        availability.ownerId,
        availability,
      ]),
    );
    const vehicleAvailabilityMap = new Map(
      vehicleAvailabilities.map((availability) => [
        availability.ownerId,
        availability,
      ]),
    );

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

    const excludedStartMs = payload.excludeStartsAt
      ? new Date(payload.excludeStartsAt).getTime()
      : null;

    const upsertBookingRequest = async (status: "pending" | "matched") => {
      if (payload.requestId) {
        const existing = await prisma.autoscuolaBookingRequest.findFirst({
          where: {
            id: payload.requestId,
            companyId: membership.companyId,
            studentId: payload.studentId,
          },
        });
        if (existing) {
          return prisma.autoscuolaBookingRequest.update({
            where: { id: existing.id },
            data: { status, desiredDate: preferredDate },
          });
        }
      }

      return prisma.autoscuolaBookingRequest.create({
        data: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          desiredDate: preferredDate,
          status,
        },
      });
    };

    const isOwnerAvailable = (
      availability:
        | { daysOfWeek: number[]; startMinutes: number; endMinutes: number }
        | null
        | undefined,
      dayOfWeek: number,
      startMinutes: number,
      endMinutes: number,
    ) => {
      if (!availability) return false;
      if (!availability.daysOfWeek.includes(dayOfWeek)) return false;
      if (availability.endMinutes <= availability.startMinutes) return false;
      return startMinutes >= availability.startMinutes && endMinutes <= availability.endMinutes;
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
      if (!studentAvailability) return null;
      if (!activeInstructorIds.length || !activeVehicleIds.length) return null;

      const dayOfWeek = getDayOfWeekFromDateParts(dayParts);
      if (!studentAvailability.daysOfWeek.includes(dayOfWeek)) {
        return null;
      }

      let startMinutes = studentAvailability.startMinutes;
      let endMinutes = studentAvailability.endMinutes;
      if (preferredWindow) {
        startMinutes = Math.max(startMinutes, preferredWindow.startMinutes);
        endMinutes = Math.min(endMinutes, preferredWindow.endMinutes);
      }
      if (endMinutes - startMinutes < payload.durationMinutes) {
        return null;
      }

      const window = { startMinutes, endMinutes };
      let candidateStarts = buildCandidateStarts(dayParts, window);
      if (forcedStart) {
        const forcedMinutes = minutesFromDate(forcedStart);
        if (forcedMinutes % SLOT_MINUTES !== 0) return null;
        if (forcedMinutes < window.startMinutes) return null;
        if (forcedMinutes + payload.durationMinutes > window.endMinutes) return null;
        candidateStarts = [forcedStart];
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
        if (excludedStartMs && startMs === excludedStartMs) continue;
        if (startDate < rangeStart || endDate > rangeEnd) continue;
        if (overlaps(studentIntervals, startMs, endDate.getTime())) continue;

        if (
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
          const availability = instructorAvailabilityMap.get(ownerId);
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
          const availability = vehicleAvailabilityMap.get(ownerId);
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
              requestedPolicyType ||
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
        if (requestedPolicyType) {
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

      const paymentSnapshot = await prepareAppointmentPaymentSnapshot({
        companyId: membership.companyId,
        studentId: payload.studentId,
        startsAt: candidate.start,
        endsAt: candidate.end,
      });

      const appointment = await prisma.$transaction(async (tx) => {
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
      const request = await upsertBookingRequest("pending");

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

    const request = await upsertBookingRequest("pending");

    if (requestedPolicyType) {
      return {
        success: false,
        message: `Nessuno slot disponibile per il tipo guida ${getLessonPolicyTypeLabel(
          requestedPolicyType,
        )}.`,
      };
    }

    if (enforceRequiredTypes && missingRequiredTypes.length) {
      const label = missingRequiredTypes.map((type) => getLessonPolicyTypeLabel(type)).join(", ");
      return {
        success: false,
        message: `Nessuno slot compatibile con i tipi guida obbligatori mancanti (${label}).`,
      };
    }

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

    let availableLessonTypes: string[] = [...LESSON_POLICY_TYPES];

    if (
      policy.lessonPolicyEnabled &&
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

    return {
      success: true,
      data: {
        bookingSlotDurations,
        availableLessonTypes,
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

    const [student, existingResponse, studentAvailability, autoscuolaService] = await Promise.all([
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
      !isWeeklyAvailabilityCovering(
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

    const [studentAvailability, offers, appointments, autoscuolaService] = await Promise.all([
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

    if (!studentAvailability) {
      return { success: true, data: [] };
    }

    const visible = offers
      .filter((offer) => !offer.responses.length)
      .filter((offer) =>
        isWeeklyAvailabilityCovering(
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
      ...(excludeStudentIds.length ? { userId: { notIn: excludeStudentIds } } : {}),
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

  const availabilityByStudent = new Map(
    availabilities.map((availability) => [availability.ownerId, availability]),
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
    if (!isWeeklyAvailabilityCovering(availability, slot.startsAt, slot.endsAt)) {
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
    const emails = Array.from(
      new Set(
        availableStudents
          .map((student) => student.user.email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    );

    if (emails.length) {
      const members = await prisma.companyMember.findMany({
        where: {
          companyId,
          autoscuolaRole: "STUDENT",
          user: { email: { in: emails } },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      const studentUserIds = members.map((member) => member.user.id);
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
