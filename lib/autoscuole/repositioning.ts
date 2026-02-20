"use server";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  isLessonPolicyType,
  isLessonTypeAllowedForInterval,
  normalizeLessonType,
  parseLessonPolicyFromLimits,
} from "@/lib/autoscuole/lesson-policy";

type PrismaClientLike = typeof defaultPrisma;

const SLOT_MINUTES = 30;
const AUTOSCUOLA_TIMEZONE = "Europe/Rome";
const REPOSITION_MAX_DAYS = 14;
const RETRY_DELAY_MINUTES = 1;
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const ACTIVE_REPOSITIONABLE_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "proposal",
  "checked_in",
]);

const normalizeStatus = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const formatCancellationReason = (value: string) => {
  switch ((value ?? "").trim()) {
    case "instructor_cancel":
      return "L'istruttore ha cancellato la guida";
    case "vehicle_inactive":
      return "Il veicolo non è più disponibile";
    case "instructor_inactive":
      return "L'istruttore non è più disponibile";
    case "availability_changed":
      return "Disponibilità risorse aggiornata";
    case "owner_delete":
      return "La guida è stata rimossa dall'agenda autoscuola";
    case "directory_instructor_removed":
      return "Istruttore rimosso dalla directory";
    default:
      return "La guida è stata cancellata per motivi organizzativi";
  }
};

const formatDurationMinutes = (value: number) => {
  if (value <= 60) return `${value} minuti`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!minutes) return `${hours} ora${hours > 1 ? "e" : ""}`;
  return `${hours}h ${minutes}m`;
};

const toDecimal = (value: number) => new Prisma.Decimal(value.toFixed(2));
const toCents = (value: Prisma.Decimal | number | string) => {
  const number = value instanceof Prisma.Decimal ? value.toNumber() : Number(value);
  if (Number.isNaN(number)) return 0;
  return Math.round(number * 100);
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

const addDaysToDateParts = (parts: CalendarDateParts, days: number) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const minutesFromDate = (date: Date) => {
  const parts = getZonedParts(date);
  return parts.hour * 60 + parts.minute;
};

const getDayOfWeekFromDateParts = (parts: CalendarDateParts) =>
  new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

const dayOfWeekFromDate = (date: Date) => {
  const weekday = getZonedParts(date).weekday;
  return WEEKDAY_TO_INDEX[weekday] ?? date.getUTCDay();
};

const getSlotEnd = (start: Date, durationMinutes: number) =>
  new Date(start.getTime() + durationMinutes * 60 * 1000);

const getAppointmentEnd = (appointment: {
  startsAt: Date;
  endsAt: Date | null;
}) => appointment.endsAt ?? getSlotEnd(appointment.startsAt, SLOT_MINUTES);

const buildCandidateStarts = (
  dayParts: CalendarDateParts,
  window: { startMinutes: number; endMinutes: number },
  durationMinutes: number,
) => {
  const first = Math.ceil(window.startMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const lastStart = window.endMinutes - durationMinutes;
  if (lastStart < first) return [] as Date[];
  const candidates: Date[] = [];
  for (let minutes = first; minutes <= lastStart; minutes += SLOT_MINUTES) {
    candidates.push(
      toTimeZoneDate(dayParts, Math.floor(minutes / 60), minutes % 60),
    );
  }
  return candidates;
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

const overlaps = (
  intervals: Array<{ start: number; end: number }> | undefined,
  start: number,
  end: number,
) => {
  if (!intervals?.length) return false;
  return intervals.some((interval) => start < interval.end && end > interval.start);
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
    const end = getAppointmentEnd(appointment).getTime();
    add(appointment.studentId, start, end);
    if (appointment.instructorId) add(appointment.instructorId, start, end);
    if (appointment.vehicleId) add(appointment.vehicleId, start, end);
  }

  return { starts, ends, intervals };
};

const resolveTransferredPaymentStatus = (appointment: {
  paymentRequired: boolean;
  paymentStatus: string;
  paidAmount: Prisma.Decimal | number | string;
  priceAmount: Prisma.Decimal | number | string;
}) => {
  if (!appointment.paymentRequired) return "not_required";
  const normalized = normalizeStatus(appointment.paymentStatus);
  if (normalized === "insoluto") return "insoluto";

  const paidCents = toCents(appointment.paidAmount);
  const priceCents = toCents(appointment.priceAmount);
  if (priceCents <= 0) return "waived";
  if (paidCents >= priceCents) return "paid";
  if (paidCents > 0) return "partial_paid";
  return "pending_penalty";
};

const nextRetryAt = (now: Date) => new Date(now.getTime() + RETRY_DELAY_MINUTES * 60 * 1000);

const isAppointmentOperationallyRepositionable = (appointment: {
  status: string;
  startsAt: Date;
}) => {
  const status = normalizeStatus(appointment.status);
  return ACTIVE_REPOSITIONABLE_STATUSES.has(status) && appointment.startsAt.getTime() > Date.now();
};

const releaseSlotsForAppointment = async (
  prisma: PrismaClientLike,
  appointment: {
    companyId: string;
    studentId: string;
    instructorId: string | null;
    vehicleId: string | null;
    startsAt: Date;
    endsAt: Date | null;
  },
) => {
  const rangeEnd = getAppointmentEnd(appointment);
  const ownerFilters = [{ ownerType: "student", ownerId: appointment.studentId }];
  if (appointment.instructorId) {
    ownerFilters.push({ ownerType: "instructor", ownerId: appointment.instructorId });
  }
  if (appointment.vehicleId) {
    ownerFilters.push({ ownerType: "vehicle", ownerId: appointment.vehicleId });
  }

  await prisma.autoscuolaAvailabilitySlot.updateMany({
    where: {
      companyId: appointment.companyId,
      status: "booked",
      startsAt: { gte: appointment.startsAt, lt: rangeEnd },
      OR: ownerFilters,
    },
    data: { status: "open" },
  });
};

const notifyOperationalCancellationPending = async ({
  companyId,
  studentId,
  startsAt,
  reason,
}: {
  companyId: string;
  studentId: string;
  startsAt: Date;
  reason: string;
}) => {
  const [studentUser] = await Promise.all([
    defaultPrisma.user.findUnique({
      where: { id: studentId },
      select: { email: true },
    }),
  ]);

  const dateLabel = startsAt.toLocaleDateString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
  });
  const timeLabel = startsAt.toLocaleTimeString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

  const title = "Reglo Autoscuole · Guida da riprogrammare";
  const body = `${formatCancellationReason(reason)} (${dateLabel} ${timeLabel}). Stiamo cercando un nuovo slot e ti invieremo una proposta.`;

  try {
    await sendAutoscuolaPushToUsers({
      companyId,
      userIds: [studentId],
      title,
      body,
      data: {
        kind: "appointment_cancelled",
        startsAt: startsAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Operational cancellation push error", error);
  }

  if (studentUser?.email) {
    try {
      await sendDynamicEmail({
        to: studentUser.email,
        subject: title,
        body,
      });
    } catch (error) {
      console.error("Operational cancellation email error", error);
    }
  }
};

const notifyOperationalProposal = async ({
  companyId,
  studentId,
  appointmentId,
  startsAt,
  lessonType,
}: {
  companyId: string;
  studentId: string;
  appointmentId: string;
  startsAt: Date;
  lessonType: string;
}) => {
  const studentUser = await defaultPrisma.user.findUnique({
    where: { id: studentId },
    select: { email: true },
  });

  const when = startsAt.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AUTOSCUOLA_TIMEZONE,
  });

  const title = "Reglo Autoscuole · Nuova proposta guida";
  const body = `Abbiamo trovato un nuovo slot per il ${when}. Apri Reglo per accettare o rifiutare.`;

  try {
    await sendAutoscuolaPushToUsers({
      companyId,
      userIds: [studentId],
      title,
      body,
      data: {
        kind: "appointment_proposal",
        appointmentId,
        startsAt: startsAt.toISOString(),
        type: lessonType,
      },
    });
  } catch (error) {
    console.error("Operational proposal push error", error);
  }

  if (studentUser?.email) {
    try {
      await sendDynamicEmail({
        to: studentUser.email,
        subject: title,
        body,
      });
    } catch (error) {
      console.error("Operational proposal email error", error);
    }
  }
};

const findOperationalCandidate = async ({
  prisma,
  companyId,
  studentId,
  durationMinutes,
  earliestStartsAt,
  lessonType,
  excludedStartsAt,
  excludedEndsAt,
  excludedInstructorId,
  excludedVehicleId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  studentId: string;
  durationMinutes: number;
  earliestStartsAt: Date;
  lessonType: string;
  excludedStartsAt?: Date | null;
  excludedEndsAt?: Date | null;
  excludedInstructorId?: string | null;
  excludedVehicleId?: string | null;
}) => {
  const [activeInstructors, activeVehicles, studentAvailability, autoscuolaService] =
    await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: { companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId, status: { not: "inactive" } },
        select: { id: true },
      }),
      prisma.autoscuolaWeeklyAvailability.findFirst({
        where: {
          companyId,
          ownerType: "student",
          ownerId: studentId,
        },
      }),
      prisma.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
    ]);

  if (!studentAvailability || !activeInstructors.length || !activeVehicles.length) {
    return null;
  }

  const normalizedLessonType = normalizeLessonType(lessonType);
  const policy = parseLessonPolicyFromLimits(
    (autoscuolaService?.limits ?? {}) as Record<string, unknown>,
  );

  const activeInstructorIds = activeInstructors
    .map((item) => item.id)
    .filter((id) => !excludedInstructorId || id !== excludedInstructorId);
  const activeVehicleIds = activeVehicles
    .map((item) => item.id)
    .filter((id) => !excludedVehicleId || id !== excludedVehicleId);

  if (!activeInstructorIds.length || !activeVehicleIds.length) {
    return null;
  }

  const [instructorAvailabilities, vehicleAvailabilities] = await Promise.all([
    prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId,
        ownerType: "instructor",
        ownerId: { in: activeInstructorIds },
      },
    }),
    prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId,
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

  const earliest = earliestStartsAt;
  const earliestParts = getZonedParts(earliest);
  const startDay: CalendarDateParts = {
    year: earliestParts.year,
    month: earliestParts.month,
    day: earliestParts.day,
  };
  const rangeStart = toTimeZoneDate(startDay, 0, 0);
  const rangeEnd = toTimeZoneDate(addDaysToDateParts(startDay, REPOSITION_MAX_DAYS + 1), 0, 0);

  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      startsAt: {
        gte: new Date(rangeStart.getTime() - 60 * 60 * 1000),
        lt: rangeEnd,
      },
      status: { notIn: ["cancelled", "completed", "no_show"] },
    },
    select: {
      studentId: true,
      instructorId: true,
      vehicleId: true,
      startsAt: true,
      endsAt: true,
    },
  });

  const maps = buildAppointmentMaps(appointments);
  const studentIntervals = maps.intervals.get(studentId);

  let best: {
    start: Date;
    end: Date;
    instructorId: string;
    vehicleId: string;
    score: number;
  } | null = null;

  const earliestRoundedMinutes = Math.ceil(minutesFromDate(earliest) / SLOT_MINUTES) * SLOT_MINUTES;
  const excludedStartMs = excludedStartsAt?.getTime() ?? null;
  const excludedEndMs = excludedEndsAt?.getTime() ?? null;

  for (let offset = 0; offset <= REPOSITION_MAX_DAYS; offset += 1) {
    const dayParts = addDaysToDateParts(startDay, offset);
    const dayOfWeek = getDayOfWeekFromDateParts(dayParts);

    if (!studentAvailability.daysOfWeek.includes(dayOfWeek)) continue;

    let windowStartMinutes = studentAvailability.startMinutes;
    const windowEndMinutes = studentAvailability.endMinutes;
    if (windowEndMinutes - windowStartMinutes < durationMinutes) continue;

    if (offset === 0) {
      windowStartMinutes = Math.max(windowStartMinutes, earliestRoundedMinutes);
      if (windowEndMinutes - windowStartMinutes < durationMinutes) continue;
    }

    const candidateStarts = buildCandidateStarts(
      dayParts,
      { startMinutes: windowStartMinutes, endMinutes: windowEndMinutes },
      durationMinutes,
    );

    for (const start of candidateStarts) {
      if (start.getTime() < earliest.getTime()) continue;
      const end = getSlotEnd(start, durationMinutes);

      if (
        policy.lessonPolicyEnabled &&
        isLessonPolicyType(normalizedLessonType) &&
        !isLessonTypeAllowedForInterval({
          policy,
          lessonType: normalizedLessonType,
          startsAt: start,
          endsAt: end,
        })
      ) {
        continue;
      }

      const startMs = start.getTime();
      const endMs = end.getTime();

      if (
        excludedStartMs != null &&
        excludedEndMs != null &&
        startMs === excludedStartMs &&
        endMs === excludedEndMs
      ) {
        continue;
      }

      if (overlaps(studentIntervals, startMs, endMs)) continue;

      const candidateStartMinutes = minutesFromDate(start);
      const candidateEndMinutes = candidateStartMinutes + durationMinutes;

      const availableInstructors: Array<{ id: string; score: number }> = [];
      for (const ownerId of activeInstructorIds) {
        const availability = instructorAvailabilityMap.get(ownerId);
        if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
          continue;
        }
        const intervals = maps.intervals.get(ownerId);
        if (overlaps(intervals, startMs, endMs)) continue;
        const score =
          (maps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
          (maps.starts.get(ownerId)?.has(endMs) ? 1 : 0);
        availableInstructors.push({ id: ownerId, score });
      }

      const availableVehicles: Array<{ id: string; score: number }> = [];
      for (const ownerId of activeVehicleIds) {
        const availability = vehicleAvailabilityMap.get(ownerId);
        if (!isOwnerAvailable(availability, dayOfWeek, candidateStartMinutes, candidateEndMinutes)) {
          continue;
        }
        const intervals = maps.intervals.get(ownerId);
        if (overlaps(intervals, startMs, endMs)) continue;
        const score =
          (maps.ends.get(ownerId)?.has(startMs) ? 1 : 0) +
          (maps.starts.get(ownerId)?.has(endMs) ? 1 : 0);
        availableVehicles.push({ id: ownerId, score });
      }

      if (!availableInstructors.length || !availableVehicles.length) continue;

      availableInstructors.sort((a, b) => b.score - a.score);
      availableVehicles.sort((a, b) => b.score - a.score);

      const instructorChoice = availableInstructors[0];
      const vehicleChoice = availableVehicles[0];
      const score = instructorChoice.score + vehicleChoice.score;

      if (!best || score > best.score || (score === best.score && startMs < best.start.getTime())) {
        best = {
          start,
          end,
          instructorId: instructorChoice.id,
          vehicleId: vehicleChoice.id,
          score,
        };
      }
    }
  }

  return best;
};

export async function queueOperationalRepositionForAppointment({
  prisma = defaultPrisma,
  companyId,
  appointmentId,
  reason,
  actorUserId,
  attemptNow = false,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  appointmentId: string;
  reason: string;
  actorUserId?: string | null;
  attemptNow?: boolean;
}) {
  const now = new Date();

  const appointment = await prisma.autoscuolaAppointment.findFirst({
    where: { id: appointmentId, companyId },
    select: {
      id: true,
      companyId: true,
      studentId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      instructorId: true,
      vehicleId: true,
      cancellationKind: true,
      replacedByAppointmentId: true,
      paymentRequired: true,
      paymentStatus: true,
    },
  });

  if (!appointment) {
    return {
      success: false,
      queued: false,
      message: "Appuntamento non trovato.",
    } as const;
  }

  if (!isAppointmentOperationallyRepositionable(appointment)) {
    return {
      success: false,
      queued: false,
      message: "Appuntamento non riposizionabile.",
    } as const;
  }

  const existingTask = await prisma.autoscuolaAppointmentRepositionTask.findUnique({
    where: { sourceAppointmentId: appointment.id },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationKind: "operational_reposition",
        cancellationReason: reason,
        paymentStatus: appointment.paymentRequired ? "waived" : appointment.paymentStatus,
        invoiceStatus: appointment.paymentRequired ? "not_required" : undefined,
      },
    });

    await releaseSlotsForAppointment(tx as never, {
      companyId,
      studentId: appointment.studentId,
      instructorId: appointment.instructorId,
      vehicleId: appointment.vehicleId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });

    await tx.autoscuolaAppointmentRepositionTask.upsert({
      where: { sourceAppointmentId: appointment.id },
      update: {
        status: "pending",
        reason,
        nextAttemptAt: now,
      },
      create: {
        companyId,
        sourceAppointmentId: appointment.id,
        studentId: appointment.studentId,
        status: "pending",
        reason,
        attemptCount: 0,
        nextAttemptAt: now,
        createdByUserId: actorUserId ?? null,
      },
    });
  });

  if (!existingTask) {
    await notifyOperationalCancellationPending({
      companyId,
      studentId: appointment.studentId,
      startsAt: appointment.startsAt,
      reason,
    });
  }

  let proposalCreated = false;
  let proposalStartsAt: Date | null = null;
  let taskId = existingTask?.id ?? null;

  if (attemptNow) {
    const task = await prisma.autoscuolaAppointmentRepositionTask.findUnique({
      where: { sourceAppointmentId: appointment.id },
      select: { id: true },
    });
    if (task) {
      taskId = task.id;
      const attempt = await attemptOperationalRepositionTask({
        prisma,
        taskId: task.id,
      });
      proposalCreated = Boolean(attempt.proposalCreated);
      proposalStartsAt = attempt.proposalStartsAt ?? null;
    }
  }

  await invalidateAutoscuoleCache({
    companyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
  });

  return {
    success: true,
    queued: true,
    proposalCreated,
    proposalStartsAt: proposalStartsAt ? proposalStartsAt.toISOString() : undefined,
    taskId,
  } as const;
}

export async function cancelAndQueueOperationalRepositionByResource({
  prisma = defaultPrisma,
  companyId,
  appointmentIds,
  reason,
  actorUserId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  appointmentIds: string[];
  reason: string;
  actorUserId?: string | null;
}) {
  const uniqueIds = Array.from(new Set(appointmentIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return { queued: 0 } as const;
  }

  const now = new Date();
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      id: { in: uniqueIds },
      startsAt: { gt: now },
      status: { in: Array.from(ACTIVE_REPOSITIONABLE_STATUSES) },
    },
    select: { id: true },
  });

  let queued = 0;
  for (const appointment of appointments) {
    const response = await queueOperationalRepositionForAppointment({
      prisma,
      companyId,
      appointmentId: appointment.id,
      reason,
      actorUserId,
      attemptNow: false,
    });
    if (response.success && response.queued) queued += 1;
  }

  return { queued } as const;
}

export async function attemptOperationalRepositionTask({
  prisma = defaultPrisma,
  taskId,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  taskId: string;
  now?: Date;
}) {
  const task = await prisma.autoscuolaAppointmentRepositionTask.findUnique({
    where: { id: taskId },
    include: {
      sourceAppointment: true,
    },
  });

  if (!task) {
    return { attempted: false, proposalCreated: false } as const;
  }

  if (task.status !== "pending") {
    return { attempted: false, proposalCreated: false } as const;
  }

  const source = task.sourceAppointment;
  if (!source) {
    await prisma.autoscuolaAppointmentRepositionTask.update({
      where: { id: task.id },
      data: {
        status: "cancelled",
        lastAttemptAt: now,
        nextAttemptAt: null,
      },
    });
    return { attempted: true, proposalCreated: false } as const;
  }

  if (source.replacedByAppointmentId) {
    await prisma.autoscuolaAppointmentRepositionTask.update({
      where: { id: task.id },
      data: {
        status: "matched",
        matchedAppointmentId: source.replacedByAppointmentId,
        lastAttemptAt: now,
        nextAttemptAt: null,
      },
    });
    return { attempted: true, proposalCreated: false } as const;
  }

  if (source.startsAt.getTime() <= now.getTime()) {
    await prisma.autoscuolaAppointmentRepositionTask.update({
      where: { id: task.id },
      data: {
        status: "cancelled",
        lastAttemptAt: now,
        nextAttemptAt: null,
      },
    });
    return { attempted: true, proposalCreated: false } as const;
  }

  const activeProposal = await prisma.autoscuolaAppointment.findFirst({
    where: {
      companyId: task.companyId,
      studentId: task.studentId,
      status: "proposal",
      startsAt: { gte: now },
    },
    select: { id: true },
    orderBy: { startsAt: "asc" },
  });

  if (activeProposal) {
    await prisma.autoscuolaAppointmentRepositionTask.update({
      where: { id: task.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: nextRetryAt(now),
      },
    });
    return { attempted: true, proposalCreated: false } as const;
  }

  const durationMinutes = Math.max(
    SLOT_MINUTES,
    Math.round((getAppointmentEnd(source).getTime() - source.startsAt.getTime()) / 60000),
  );
  const sourceEndsAt = getAppointmentEnd(source);
  const reason = (task.reason ?? "").trim();
  const excludeInstructor =
    reason === "instructor_cancel" ||
    reason === "instructor_inactive" ||
    reason === "directory_instructor_removed";
  const excludeVehicle = reason === "vehicle_inactive";

  const candidate = await findOperationalCandidate({
    prisma,
    companyId: task.companyId,
    studentId: task.studentId,
    durationMinutes,
    earliestStartsAt: now,
    lessonType: source.type,
    excludedStartsAt: source.startsAt,
    excludedEndsAt: sourceEndsAt,
    excludedInstructorId: excludeInstructor ? source.instructorId : null,
    excludedVehicleId: excludeVehicle ? source.vehicleId : null,
  });

  if (!candidate) {
    await prisma.autoscuolaAppointmentRepositionTask.update({
      where: { id: task.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: nextRetryAt(now),
      },
    });
    return { attempted: true, proposalCreated: false } as const;
  }

  const replacementId = randomUUID();
  const sourceCutoffDeltaMs = source.penaltyCutoffAt
    ? source.startsAt.getTime() - source.penaltyCutoffAt.getTime()
    : null;
  const replacementPenaltyCutoffAt =
    sourceCutoffDeltaMs != null
      ? new Date(candidate.start.getTime() - sourceCutoffDeltaMs)
      : source.penaltyCutoffAt;

  await prisma.$transaction(async (tx) => {
    const freshSource = await tx.autoscuolaAppointment.findUnique({
      where: { id: source.id },
      include: {
        payments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!freshSource) {
      await tx.autoscuolaAppointmentRepositionTask.update({
        where: { id: task.id },
        data: {
          status: "cancelled",
          lastAttemptAt: now,
          nextAttemptAt: null,
        },
      });
      return;
    }

    if (freshSource.replacedByAppointmentId) {
      await tx.autoscuolaAppointmentRepositionTask.update({
        where: { id: task.id },
        data: {
          status: "matched",
          matchedAppointmentId: freshSource.replacedByAppointmentId,
          lastAttemptAt: now,
          nextAttemptAt: null,
        },
      });
      return;
    }

    const transferredPaymentStatus = resolveTransferredPaymentStatus({
      paymentRequired: freshSource.paymentRequired,
      paymentStatus: freshSource.paymentStatus,
      paidAmount: freshSource.paidAmount,
      priceAmount: freshSource.priceAmount,
    });

    await tx.autoscuolaAppointment.create({
      data: {
        id: replacementId,
        companyId: freshSource.companyId,
        studentId: freshSource.studentId,
        caseId: freshSource.caseId,
        type: freshSource.type,
        startsAt: candidate.start,
        endsAt: candidate.end,
        status: "proposal",
        instructorId: candidate.instructorId,
        vehicleId: candidate.vehicleId,
        notes: freshSource.notes,
        paymentRequired: freshSource.paymentRequired,
        paymentStatus: transferredPaymentStatus,
        priceAmount: toDecimal(toCents(freshSource.priceAmount) / 100),
        penaltyAmount: toDecimal(toCents(freshSource.penaltyAmount) / 100),
        penaltyCutoffAt: replacementPenaltyCutoffAt,
        paidAmount: toDecimal(toCents(freshSource.paidAmount) / 100),
        invoiceStatus: freshSource.invoiceStatus,
        creditApplied: freshSource.creditApplied,
      },
    });

    await tx.autoscuolaAppointmentPayment.updateMany({
      where: { appointmentId: freshSource.id },
      data: { appointmentId: replacementId },
    });

    await tx.autoscuolaAppointment.update({
      where: { id: freshSource.id },
      data: {
        status: "cancelled",
        cancelledAt: freshSource.cancelledAt ?? now,
        cancellationKind: "operational_reposition",
        cancellationReason: task.reason,
        replacedByAppointmentId: replacementId,
        paymentStatus: freshSource.paymentRequired ? "waived" : freshSource.paymentStatus,
        invoiceStatus: freshSource.paymentRequired ? "not_required" : freshSource.invoiceStatus,
      },
    });

    await tx.autoscuolaAppointmentRepositionTask.update({
      where: { id: task.id },
      data: {
        status: "matched",
        matchedAppointmentId: replacementId,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: null,
      },
    });
  });

  await notifyOperationalProposal({
    companyId: task.companyId,
    studentId: task.studentId,
    appointmentId: replacementId,
    startsAt: candidate.start,
    lessonType: normalizeLessonType(source.type) || "guida",
  });

  await invalidateAutoscuoleCache({
    companyId: task.companyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
  });

  return {
    attempted: true,
    proposalCreated: true,
    proposalStartsAt: candidate.start,
    matchedAppointmentId: replacementId,
  } as const;
}

export async function processAutoscuolaPendingRepositions({
  prisma = defaultPrisma,
  now = new Date(),
  limit = 50,
}: {
  prisma?: PrismaClientLike;
  now?: Date;
  limit?: number;
}) {
  const normalizedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));

  const tasks = await prisma.autoscuolaAppointmentRepositionTask.findMany({
    where: {
      status: "pending",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    select: { id: true },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: normalizedLimit,
  });

  let attempted = 0;
  let matched = 0;
  for (const task of tasks) {
    const result = await attemptOperationalRepositionTask({
      prisma,
      taskId: task.id,
      now,
    });
    if (!result.attempted) continue;
    attempted += 1;
    if (result.proposalCreated) matched += 1;
  }

  return {
    attempted,
    matched,
  };
}
