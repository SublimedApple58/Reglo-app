import { prisma } from "@/db/prisma";
import {
  getCompatibleLessonTypesForInterval,
  getStudentLessonPolicyCoverage,
  isLessonPolicyType,
  LessonPolicyType,
  normalizeBookingSlotDurations,
  normalizeLessonType,
  parseLessonPolicyFromLimits,
} from "@/lib/autoscuole/lesson-policy";

const SLOT_MINUTES = 30;
const AUTOSCUOLA_TIMEZONE = "Europe/Rome";

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

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

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

const parseDateOnly = (value: string) => {
  const parts = value.split("-");
  if (parts.length === 3) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return { year, month, day };
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const zoned = getZonedParts(parsed);
  return { year: zoned.year, month: zoned.month, day: zoned.day };
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

const minutesFromDate = (date: Date) => {
  const parts = getZonedParts(date);
  return parts.hour * 60 + parts.minute;
};

const getSlotEnd = (start: Date, durationMinutes: number) =>
  new Date(start.getTime() + durationMinutes * 60 * 1000);

const overlaps = (
  intervals: Array<{ start: number; end: number }> | undefined,
  start: number,
  end: number,
) => {
  if (!intervals?.length) return false;
  return intervals.some((interval) => start < interval.end && end > interval.start);
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
  durationMinutes: number,
) => {
  const first = Math.ceil(window.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const lastStart = window.endMinutes - durationMinutes;
  if (lastStart < first) return [];
  const candidates: Date[] = [];
  for (let minutes = first; minutes <= lastStart; minutes += SLOT_MINUTES) {
    candidates.push(
      toTimeZoneDate(dayParts, Math.floor(minutes / 60), minutes % 60),
    );
  }
  return candidates;
};

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
    const end = appointment.endsAt?.getTime() ?? start + SLOT_MINUTES * 60 * 1000;
    add(appointment.studentId, start, end);
    if (appointment.instructorId) add(appointment.instructorId, start, end);
    if (appointment.vehicleId) add(appointment.vehicleId, start, end);
  }

  return { starts, ends, intervals };
};

export type AutoscuolaSlotMatchInput = {
  companyId: string;
  studentId: string;
  preferredDate: string;
  durationMinutes: number;
  maxDays?: number;
  requestedLessonType?: string | null;
  requiredInstructorId?: string | null;
  now?: Date;
};

export type AutoscuolaSlotMatchResult = {
  start: Date;
  end: Date;
  instructorId: string;
  vehicleId: string;
  resolvedLessonType: string;
  compatibleRequiredTypes: string[];
  missingRequiredTypes: string[];
};

export async function findBestAutoscuolaSlot(
  input: AutoscuolaSlotMatchInput,
): Promise<AutoscuolaSlotMatchResult | null> {
  const now = input.now ?? new Date();
  const maxDays = Math.max(0, Math.min(7, input.maxDays ?? 4));
  const preferredDateParts = parseDateOnly(input.preferredDate);
  if (!preferredDateParts) return null;
  const preferredDate = toTimeZoneDate(preferredDateParts, 0, 0);
  const nowParts = getZonedParts(now);
  const todayStart = toTimeZoneDate(
    { year: nowParts.year, month: nowParts.month, day: nowParts.day },
    0,
    0,
  );
  if (preferredDate < todayStart) return null;

  const [activeInstructors, activeVehicles, studentAvailability, autoscuolaService] =
    await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: {
          companyId: input.companyId,
          status: { not: "inactive" },
          ...(input.requiredInstructorId ? { id: input.requiredInstructorId } : {}),
        },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: input.companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId: input.companyId,
          ownerType: "student",
          ownerId: input.studentId,
        },
      }),
      prisma.companyService.findFirst({
        where: { companyId: input.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);

  if (!studentAvailability) return null;
  if (!activeInstructors.length || !activeVehicles.length) return null;

  const limits = (autoscuolaService?.limits ?? {}) as Record<string, unknown>;
  const allowedDurations = normalizeBookingSlotDurations(limits.bookingSlotDurations);
  if (!allowedDurations.some((value) => value === input.durationMinutes)) {
    return null;
  }

  const lessonPolicy = parseLessonPolicyFromLimits(limits);
  const enforceRequiredTypes =
    lessonPolicy.lessonPolicyEnabled &&
    lessonPolicy.lessonRequiredTypesEnabled &&
    lessonPolicy.lessonRequiredTypes.length > 0;
  const enforceLessonTypeTimeConstraints = lessonPolicy.lessonPolicyEnabled;

  const normalizedRequestedType = normalizeLessonType(input.requestedLessonType);
  const requestedPolicyType = isLessonPolicyType(normalizedRequestedType)
    ? (normalizedRequestedType as LessonPolicyType)
    : null;
  if (normalizedRequestedType && !requestedPolicyType) return null;

  const studentCoverage: {
    missingRequiredTypes: string[];
  } = enforceRequiredTypes
    ? await getStudentLessonPolicyCoverage({
        companyId: input.companyId,
        studentId: input.studentId,
        policy: lessonPolicy,
      })
    : { missingRequiredTypes: [] };
  const missingRequiredTypes = studentCoverage.missingRequiredTypes;
  if (
    enforceRequiredTypes &&
    missingRequiredTypes.length &&
    requestedPolicyType &&
    !missingRequiredTypes.includes(requestedPolicyType)
  ) {
    return null;
  }

  const activeInstructorIds = activeInstructors.map((item) => item.id);
  const activeVehicleIds = activeVehicles.map((item) => item.id);

  const [instructorAvailabilities, vehicleAvailabilities] = await Promise.all([
    prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId: input.companyId,
        ownerType: "instructor",
        ownerId: { in: activeInstructorIds },
      },
    }),
    prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId: input.companyId,
        ownerType: "vehicle",
        ownerId: { in: activeVehicleIds },
      },
    }),
  ]);

  const instructorAvailabilityMap = new Map(
    instructorAvailabilities.map((availability) => [availability.ownerId, availability]),
  );
  const vehicleAvailabilityMap = new Map(
    vehicleAvailabilities.map((availability) => [availability.ownerId, availability]),
  );

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const dayParts = addDaysToDateParts(preferredDateParts, offset);
    const dayOfWeek = getDayOfWeekFromDateParts(dayParts);
    if (!studentAvailability.daysOfWeek.includes(dayOfWeek)) continue;

    const rangeStart = toTimeZoneDate(dayParts, 0, 0);
    const rangeEnd = toTimeZoneDate(addDaysToDateParts(dayParts, 1), 0, 0);
    const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: input.companyId,
        status: { notIn: ["cancelled"] },
        startsAt: { gte: appointmentScanStart, lt: rangeEnd },
      },
      select: {
        instructorId: true,
        vehicleId: true,
        studentId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    const appointmentMaps = buildAppointmentMaps(appointments);
    const studentIntervals = appointmentMaps.intervals.get(input.studentId);

    const window = {
      startMinutes: studentAvailability.startMinutes,
      endMinutes: studentAvailability.endMinutes,
    };
    const candidateStarts = buildCandidateStarts(
      dayParts,
      window,
      input.durationMinutes,
    );
    if (!candidateStarts.length) continue;

    let bestForDay: AutoscuolaSlotMatchResult | null = null;
    let bestScore = -1;

    for (const startDate of candidateStarts) {
      const endDate = getSlotEnd(startDate, input.durationMinutes);
      const startMs = startDate.getTime();
      const endMs = endDate.getTime();

      if (startMs < now.getTime()) continue;
      if (startDate < rangeStart || endDate > rangeEnd) continue;
      if (overlaps(studentIntervals, startMs, endMs)) continue;

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
      const candidateEndMinutes = candidateStartMinutes + input.durationMinutes;

      const availableInstructors: Array<{ id: string; score: number }> = [];
      for (const instructorId of activeInstructorIds) {
        const availability = instructorAvailabilityMap.get(instructorId);
        if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
          continue;
        }
        const intervals = appointmentMaps.intervals.get(instructorId);
        if (overlaps(intervals, startMs, endMs)) continue;
        const score =
          (appointmentMaps.ends.get(instructorId)?.has(startMs) ? 1 : 0) +
          (appointmentMaps.starts.get(instructorId)?.has(endMs) ? 1 : 0);
        availableInstructors.push({ id: instructorId, score });
      }

      const availableVehicles: Array<{ id: string; score: number }> = [];
      for (const vehicleId of activeVehicleIds) {
        const availability = vehicleAvailabilityMap.get(vehicleId);
        if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
          continue;
        }
        const intervals = appointmentMaps.intervals.get(vehicleId);
        if (overlaps(intervals, startMs, endMs)) continue;
        const score =
          (appointmentMaps.ends.get(vehicleId)?.has(startMs) ? 1 : 0) +
          (appointmentMaps.starts.get(vehicleId)?.has(endMs) ? 1 : 0);
        availableVehicles.push({ id: vehicleId, score });
      }

      if (!availableInstructors.length || !availableVehicles.length) continue;

      availableInstructors.sort((a, b) => b.score - a.score);
      availableVehicles.sort((a, b) => b.score - a.score);

      const chosenInstructor = availableInstructors[0];
      const chosenVehicle = availableVehicles[0];
      const score = chosenInstructor.score + chosenVehicle.score;

      if (!bestForDay || score > bestScore) {
        bestScore = score;
        bestForDay = {
          start: startDate,
          end: endDate,
          instructorId: chosenInstructor.id,
          vehicleId: chosenVehicle.id,
          compatibleRequiredTypes,
          missingRequiredTypes,
          resolvedLessonType:
            requestedPolicyType ||
            (enforceRequiredTypes && compatibleRequiredTypes.length === 1
              ? compatibleRequiredTypes[0]
              : "guida"),
        };
      }
    }

    if (bestForDay) return bestForDay;
  }

  return null;
}
