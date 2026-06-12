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
import { buildAvailabilityResolver, getPublicationModeFilter } from "@/lib/actions/autoscuole-availability.actions";
import {
  buildFixedVehicleMaps,
  pickBestInstructorVehiclePair,
  resolveVehicleForInstructor,
} from "@/lib/autoscuole/fixed-vehicle";
import { vehicleServesLicense } from "@/lib/autoscuole/license";
import {
  addGroupLessonBusyIntervals,
  fetchGroupLessonBusyRows,
} from "@/lib/autoscuole/group-lesson-busy";

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
    | { daysOfWeek: number[]; ranges: Array<{ startMinutes: number; endMinutes: number }> }
    | null
    | undefined,
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
  durationMinutes: number,
) => {
  const lastStart = window.endMinutes - durationMinutes;
  if (lastStart < window.startMinutes) return [];
  const minutesSet = new Set<number>();
  // Legacy :00/:30 grid (kept — adjacency scoring may still pick these).
  const firstGrid = Math.ceil(window.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  for (let m = firstGrid; m <= lastStart; m += SLOT_MINUTES) minutesSet.add(m);
  // Window-anchored cascade + flush-to-end anchor: off-grid windows (e.g.
  // 14:15–18:15) get packing-friendly candidates (14:15, 15:15, …) instead of
  // only the midnight-aligned 14:30+. Restricted to the same 15-minute
  // granularity the booking confirm enforces.
  for (let m = window.startMinutes; m <= lastStart; m += durationMinutes) {
    if (m % 15 === 0) minutesSet.add(m);
  }
  if (lastStart % 15 === 0) minutesSet.add(lastStart);
  return [...minutesSet]
    .sort((a, b) => a - b)
    .map((m) => toTimeZoneDate(dayParts, Math.floor(m / 60), m % 60));
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
  vehicleId: string | null;
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

  const [
    activeInstructors,
    activeVehicles,
    studentAvailability,
    autoscuolaService,
    studentMember,
  ] = await Promise.all([
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
        select: {
          id: true,
          assignedInstructorId: true,
          followsInstructorAvailability: true,
          licenseCategory: true,
          transmission: true,
        },
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
      prisma.companyMember.findUnique({
        where: { companyId_userId: { companyId: input.companyId, userId: input.studentId } },
        select: { licenseCategory: true, transmission: true },
      }),
    ]);

  if (!studentAvailability) return null;
  const limits = (autoscuolaService?.limits ?? {}) as Record<string, unknown>;
  const smVehiclesEnabled = limits.vehiclesEnabled !== false;
  if (!activeInstructors.length) return null;
  if (smVehiclesEnabled && !activeVehicles.length) return null;
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
  const activeVehicleIds = smVehiclesEnabled ? activeVehicles.map((item) => item.id) : [];
  const fixedVehicleMaps = buildFixedVehicleMaps(activeVehicles);

  // License-category matching (only meaningful when vehicles are enabled): a
  // vehicle is eligible only if it serves the student's pursued license.
  const vehicleById = new Map(activeVehicles.map((v) => [v.id, v]));
  const studentLicense = {
    licenseCategory: studentMember?.licenseCategory ?? null,
    transmission: studentMember?.transmission ?? null,
  };
  const matchesLicenseCategory = (vehicleId: string) => {
    const vehicle = vehicleById.get(vehicleId);
    if (!vehicle) return false;
    return vehicleServesLicense(vehicle, studentLicense);
  };

  // Build date-aware availability resolvers that account for per-week overrides
  const searchRangeStart = toTimeZoneDate(preferredDateParts, 0, 0);
  const searchRangeEnd = toTimeZoneDate(addDaysToDateParts(preferredDateParts, maxDays + 1), 0, 0);

  // Publication mode gating
  const pubFilter = await getPublicationModeFilter(
    input.companyId,
    activeInstructorIds,
    searchRangeStart,
    searchRangeEnd,
  );

  const [instructorResolver, vehicleResolver] = await Promise.all([
    buildAvailabilityResolver(input.companyId, "instructor", activeInstructorIds, searchRangeStart, searchRangeEnd),
    smVehiclesEnabled && activeVehicleIds.length
      ? buildAvailabilityResolver(input.companyId, "vehicle", activeVehicleIds, searchRangeStart, searchRangeEnd)
      : { resolve: () => null, defaultMap: new Map() },
  ]);

  // Batch-fetch all appointments for the full search range in one query
  // instead of one query per day inside the loop (N+1 elimination)
  const fullRangeStart = new Date(
    toTimeZoneDate(preferredDateParts, 0, 0).getTime() - 60 * 60 * 1000,
  );
  const fullRangeEnd = toTimeZoneDate(addDaysToDateParts(preferredDateParts, maxDays + 1), 0, 0);
  const [allAppointments, allInstructorBlocks, allGroupLessonBusy] = await Promise.all([
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: input.companyId,
        status: { notIn: ["cancelled"] },
        startsAt: { gte: fullRangeStart, lt: fullRangeEnd },
      },
      select: {
        instructorId: true,
        vehicleId: true,
        studentId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId: input.companyId,
        instructorId: { in: activeInstructorIds },
        endsAt: { gt: fullRangeStart },
        startsAt: { lt: fullRangeEnd },
      },
    }),
    fetchGroupLessonBusyRows(input.companyId, fullRangeStart, fullRangeEnd),
  ]);

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const dayParts = addDaysToDateParts(preferredDateParts, offset);
    const dayOfWeek = getDayOfWeekFromDateParts(dayParts);
    if (!studentAvailability.daysOfWeek.includes(dayOfWeek)) continue;

    const rangeStart = toTimeZoneDate(dayParts, 0, 0);
    const rangeEnd = toTimeZoneDate(addDaysToDateParts(dayParts, 1), 0, 0);
    const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
    const dayAppointments = allAppointments.filter(
      (a) => a.startsAt >= appointmentScanStart && a.startsAt < rangeEnd,
    );
    const appointmentMaps = buildAppointmentMaps(dayAppointments);
    // Inject instructor blocks (sick leave, etc.) into the intervals map
    for (const block of allInstructorBlocks) {
      if (block.endsAt <= rangeStart || block.startsAt >= rangeEnd) continue;
      const list = appointmentMaps.intervals.get(block.instructorId) ?? [];
      list.push({ start: block.startsAt.getTime(), end: block.endsAt.getTime() });
      appointmentMaps.intervals.set(block.instructorId, list);
    }
    // Group-lesson containers (incl. empty ones with no appointment rows)
    // block their instructor and vehicle.
    addGroupLessonBusyIntervals(
      appointmentMaps.intervals,
      allGroupLessonBusy.filter((gl) => gl.endsAt && gl.endsAt > rangeStart && gl.startsAt < rangeEnd),
    );
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
        if (!pubFilter(instructorId, startDate)) continue;
        const availability = instructorResolver.resolve(instructorId, startDate);
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

      if (!availableInstructors.length) continue;

      // Instructor and vehicle can no longer be chosen independently: a fixed
      // vehicle is bound to its instructor, and reserved vehicles are excluded
      // from the pool offered to other instructors. Pick the best valid pair.
      const scoreVehicleAt = (vehicleId: string) =>
        (appointmentMaps.ends.get(vehicleId)?.has(startMs) ? 1 : 0) +
        (appointmentMaps.starts.get(vehicleId)?.has(endMs) ? 1 : 0);
      const isVehicleAvailableAt = (vehicleId: string) =>
        isOwnerAvailable(
          vehicleResolver.resolve(vehicleId, startDate),
          dayOfWeek,
          candidateStartMinutes,
          candidateEndMinutes,
        );
      const hasVehicleOverlapAt = (vehicleId: string) =>
        overlaps(appointmentMaps.intervals.get(vehicleId), startMs, endMs);

      const pair = pickBestInstructorVehiclePair({
        availableInstructors,
        vehiclesEnabled: smVehiclesEnabled,
        resolveVehicle: (instructorId) =>
          resolveVehicleForInstructor({
            instructorId,
            activeVehicleIds,
            maps: fixedVehicleMaps,
            isVehicleAvailable: isVehicleAvailableAt,
            hasOverlap: hasVehicleOverlapAt,
            scoreVehicle: scoreVehicleAt,
            matchesLicenseCategory,
          }),
      });
      if (!pair) continue;

      const score = pair.score;

      if (!bestForDay || score > bestScore) {
        bestScore = score;
        bestForDay = {
          start: startDate,
          end: endDate,
          instructorId: pair.instructorId,
          vehicleId: pair.vehicleId,
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
