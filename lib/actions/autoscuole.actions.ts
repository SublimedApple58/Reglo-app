"use server";

import { randomUUID } from "crypto";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { notifyAutoscuolaCaseStatusChange } from "@/lib/autoscuole/communications";
import { broadcastWaitlistOffer, buildAvailabilityResolver, getStudentBookingBlockStatus } from "@/lib/actions/autoscuole-availability.actions";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  getBookingGovernanceForCompany,
  isInstructorAppBookingEnabled,
  isStudentAppBookingEnabled,
} from "@/lib/autoscuole/booking-governance";
import {
  cancelAndQueueOperationalRepositionByResource,
  queueOperationalRepositionForAppointment,
} from "@/lib/autoscuole/repositioning";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  processAutoscuolaAppointmentSettlementNow,
  adjustStudentLessonCredits,
  getAutoscuolaPaymentAppointmentLogs,
  getAutoscuolaPaymentsAppointments,
  getAutoscuolaPaymentsOverview,
  getAutoscuolaPaymentConfig,
  getStudentLessonCredits,
  prepareAppointmentPaymentSnapshot,
  refundLessonCreditIfEligible,
  applyLessonCreditToExistingAppointment,
} from "@/lib/autoscuole/payments";
import { generateAndUploadReceipt } from "@/lib/autoscuole/receipt";
import {
  LESSON_ALL_ALLOWED_TYPES,
  getCompatibleLessonTypesForInterval,
  getLessonPolicyTypeLabel,
  getStudentLessonPolicyCoverage,
  isLessonAllowedType,
  isLessonPolicyType,
  isLessonTypeAllowedForInterval,
  isLessonTypesAllowedForInterval,
  validateLessonTypes,
  normalizeLessonType as normalizeLessonTypeFromPolicy,
  parseLessonPolicyFromLimits,
} from "@/lib/autoscuole/lesson-policy";

const createStudentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const createCaseSchema = z.object({
  studentId: z.string().uuid(),
  category: z.string().optional(),
  status: z.string().optional(),
  theoryExamAt: z.string().optional(),
  drivingExamAt: z.string().optional(),
  pinkSheetExpiresAt: z.string().optional(),
  medicalExpiresAt: z.string().optional(),
});

const createAppointmentSchema = z.object({
  studentId: z.string().uuid(),
  caseId: z.string().uuid().optional().nullable(),
  type: z.string().optional(),
  types: z.array(z.string()).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  status: z.string().optional(),
  instructorId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  notes: z.string().optional(),
  sendProposal: z.boolean().optional().default(false),
  skipWeeklyLimitCheck: z.boolean().optional(),
  skipConflictCheck: z.boolean().optional(),
});

const updateCaseStatusSchema = z.object({
  caseId: z.string().uuid(),
  status: z.string().min(1),
});

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
});

const deleteAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
});

const repositionAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().min(1).max(120).optional(),
});

const updateAppointmentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.string().min(1),
  lessonType: z.string().min(1).optional(),
  lessonTypes: z.array(z.string()).optional(),
});

const updateAppointmentDetailsSchema = z.object({
  appointmentId: z.string().uuid(),
  lessonType: z.string().optional(),
  lessonTypes: z.array(z.string()).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createInstructorSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
});

const createVehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
});

const updateInstructorSchema = z.object({
  instructorId: z.string().uuid(),
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  status: z.string().optional(),
  userId: z.string().uuid().optional(),
});

const updateVehicleSchema = z.object({
  vehicleId: z.string().uuid(),
  name: z.string().min(1).optional(),
  plate: z.string().optional().nullable(),
  status: z.string().optional(),
});

const adjustStudentLessonCreditsSchema = z.object({
  studentId: z.string().uuid(),
  delta: z.number().int().refine((value) => value !== 0, {
    message: "Delta crediti non valido.",
  }),
  reason: z.enum(["manual_grant", "manual_revoke"]),
});

const importStudentsSchema = z.object({
  rows: z.array(
    z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().optional(),
      phone: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
});

const ensureAutoscuolaRole = (
  membership: { role: string; autoscuolaRole: string | null },
  allowed: string[],
) => {
  if (membership.role === "admin") return;
  if (!membership.autoscuolaRole || !allowed.includes(membership.autoscuolaRole)) {
    throw new Error("Operazione non consentita.");
  }
};

const canManageStudentCredits = (membership: {
  role: string;
  autoscuolaRole: string | null;
}) =>
  membership.role === "admin" ||
  membership.autoscuolaRole === "OWNER";

const getOwnInstructorProfile = async (companyId: string, userId: string) =>
  prisma.autoscuolaInstructor.findFirst({
    where: {
      companyId,
      userId,
      status: { not: "inactive" },
    },
    select: { id: true },
  });

const REQUIRED_LESSONS_COUNT = 10;
const LESSON_TYPE_OPTIONS = LESSON_ALL_ALLOWED_TYPES;
const LESSON_TYPE_SET = new Set<string>(LESSON_TYPE_OPTIONS);
const INSTRUCTOR_ALLOWED_STATUSES = new Set(["checked_in", "no_show"]);
const DRIVING_LESSON_EXCLUDED_TYPES = new Set(["esame"]);
const OPERATIONAL_REPOSITIONABLE_STATUSES = [
  "scheduled",
  "confirmed",
  "proposal",
  "checked_in",
] as const;

const normalizeStatus = (value: string) => value.trim().toLowerCase();
const normalizeLessonType = (value: string | null | undefined) =>
  normalizeLessonTypeFromPolicy(value);
const normalizeOptionalFilter = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") return null;
  return normalized;
};
const toValidDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const isDrivingLessonType = (value: string | null | undefined) => {
  const normalized = normalizeLessonType(value);
  if (!normalized) return false;
  return !DRIVING_LESSON_EXCLUDED_TYPES.has(normalized);
};

const isActiveCaseStatus = (status: string | null | undefined) => {
  const normalized = normalizeStatus(status ?? "");
  return ![
    "archived",
    "closed",
    "chiusa",
    "completed",
    "completata",
    "cancelled",
    "annullata",
  ].includes(normalized);
};

const computeAppointmentEnd = (appointment: {
  startsAt: Date;
  endsAt: Date | null;
}) => appointment.endsAt ?? new Date(appointment.startsAt.getTime() + 30 * 60 * 1000);

const isWithinInstructorStatusWindow = (
  appointment: { startsAt: Date; endsAt: Date | null },
  now: Date,
) => {
  const startsAt = appointment.startsAt;
  const startsWindow = new Date(startsAt.getTime() - 10 * 60 * 1000);
  const dayEnd = new Date(startsAt);
  dayEnd.setHours(23, 59, 59, 999);
  if (now < startsWindow) return false;
  if (now > dayEnd) return false;
  return true;
};

const getInstructorWindowOpenTimeLabel = (startsAt: Date) =>
  new Date(startsAt.getTime() - 10 * 60 * 1000).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

const isWithinInstructorDetailsWindow = (
  appointment: { startsAt: Date },
  now: Date,
) => {
  const dayEnd = new Date(appointment.startsAt);
  dayEnd.setHours(23, 59, 59, 999);
  return now <= dayEnd;
};

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();
const normalizeEmail = (value: string | null | undefined) =>
  normalizeText(value).toLowerCase();

const getLessonPolicyForCompany = async (companyId: string) => {
  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  return parseLessonPolicyFromLimits((service?.limits ?? {}) as Record<string, unknown>);
};

const formatLessonTypesList = (types: string[]) =>
  types.length
    ? types.map((type) => getLessonPolicyTypeLabel(type)).join(", ")
    : "nessun tipo disponibile";

const notifyStudentAppointmentCancelled = async ({
  companyId,
  actorUserId,
  appointment,
  cancellationKind,
  actorRole,
}: {
  companyId: string;
  actorUserId: string;
  appointment: {
    id: string;
    studentId: string;
    startsAt: Date;
    instructorId: string | null;
  };
  cancellationKind: "manual_cancel" | "permanent_cancel";
  actorRole: "instructor" | "owner" | "admin";
}) => {
  if (actorUserId === appointment.studentId) return;

  const [studentUser, instructor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: appointment.studentId },
      select: { email: true },
    }),
    appointment.instructorId
      ? prisma.autoscuolaInstructor.findFirst({
          where: { id: appointment.instructorId, companyId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const dateLabel = appointment.startsAt.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  });
  const timeLabel = appointment.startsAt.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  const slotLabel = `${dateLabel} alle ${timeLabel}`;
  const instrLabel = instructor?.name ? ` con ${instructor.name}` : "";

  let title: string;
  let body: string;

  if (cancellationKind === "permanent_cancel") {
    title = "Guida annullata definitivamente";
    if (actorRole === "instructor") {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dall'istruttore. Prenota una nuova guida dall'app quando vuoi.`;
    } else {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dalla segreteria. Prenota una nuova guida dall'app quando vuoi.`;
    }
  } else {
    title = "Guida annullata";
    if (actorRole === "instructor") {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dall'istruttore. Prenota una nuova guida dall'app quando vuoi.`;
    } else {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dalla segreteria. Prenota una nuova guida dall'app quando vuoi.`;
    }
  }

  try {
    await sendAutoscuolaPushToUsers({
      companyId,
      userIds: [appointment.studentId],
      title,
      body,
      data: {
        kind: "appointment_cancelled",
        appointmentId: appointment.id,
        startsAt: appointment.startsAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Appointment cancellation push error", error);
  }

  if (studentUser?.email) {
    try {
      await sendDynamicEmail({
        to: studentUser.email,
        subject: title,
        body,
      });
    } catch (error) {
      console.error("Appointment cancellation email error", error);
    }
  }
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

const parseNameParts = (name: string | null, email: string) => {
  const cleanName = normalizeText(name).replace(/\s+/g, " ");
  if (cleanName) {
    const [firstName, ...rest] = cleanName.split(" ");
    const lastName = rest.join(" ").trim();
    return {
      firstName: firstName || "Allievo",
      lastName: lastName || "Reglo",
    };
  }

  const localPart = email.split("@")[0] || "allievo";
  return {
    firstName: localPart.slice(0, 1).toUpperCase() + localPart.slice(1),
    lastName: "Reglo",
  };
};

const matchesStudentQuery = (
  student: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  },
  query?: string,
) => {
  const term = normalizeText(query).toLowerCase();
  if (!term) return true;
  return (
    normalizeText(student.firstName).toLowerCase().includes(term) ||
    normalizeText(student.lastName).toLowerCase().includes(term) ||
    normalizeText(student.email).toLowerCase().includes(term) ||
    normalizeText(student.phone).toLowerCase().includes(term)
  );
};

type UserSnapshot = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
};

const toStudentProfile = (user: UserSnapshot, createdAt: Date) => {
  const email = normalizeEmail(user.email);
  const nameParts = parseNameParts(user.name, email);
  return {
    id: user.id,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: email || null,
    phone: user.phone ?? null,
    status: "active",
    createdAt,
  };
};

const STUDENT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
} as const;

const listDirectoryStudents = async (companyId: string) => {
  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
    },
    include: { user: { select: STUDENT_USER_SELECT } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return members.map((member) => toStudentProfile(member.user, member.createdAt));
};

const buildStudentSearchWhere = (companyId: string, search?: string) => {
  const term = (search ?? "").trim();
  return {
    companyId,
    autoscuolaRole: "STUDENT" as const,
    ...(term
      ? {
          user: {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term } },
            ],
          },
        }
      : {}),
  };
};

const listAutoscuolaInstructorsReadOnly = async (companyId: string) =>
  prisma.autoscuolaInstructor.findMany({
    where: {
      companyId,
      userId: { not: null },
      user: {
        companyMembers: {
          some: { companyId, autoscuolaRole: "INSTRUCTOR" },
        },
      },
    },
    orderBy: { name: "asc" },
  });

const listAutoscuolaVehiclesReadOnly = async (companyId: string) =>
  prisma.autoscuolaVehicle.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
  });

const mapCaseStudent = (student: UserSnapshot) => {
  const email = normalizeEmail(student.email);
  const nameParts = parseNameParts(student.name, email);
  return {
    id: student.id,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: email || null,
    phone: student.phone ?? null,
  };
};

export async function getAutoscuolaOverview() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const now = new Date();
    const inSevenDays = new Date(now);
    inSevenDays.setDate(inSevenDays.getDate() + 7);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const [
      studentsCount,
      todayAppointmentsCount,
      upcomingAppointmentsCount,
      activeInstructorsCount,
    ] = await Promise.all([
      prisma.companyMember.count({
        where: {
          companyId,
          autoscuolaRole: "STUDENT",
        },
      }),
      prisma.autoscuolaAppointment.count({
        where: {
          companyId,
          startsAt: { gte: todayStart, lt: todayEnd },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.autoscuolaAppointment.count({
        where: {
          companyId,
          startsAt: { gte: now, lte: inSevenDays },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.autoscuolaInstructor.count({
        where: {
          companyId,
          status: "active",
          userId: { not: null },
          user: {
            companyMembers: {
              some: { companyId, autoscuolaRole: "INSTRUCTOR" },
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        studentsCount,
        todayAppointmentsCount,
        upcomingAppointmentsCount,
        activeInstructorsCount,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaAgendaBootstrapAction(input: {
  from: string | Date;
  to: string | Date;
  instructorId?: string | null;
  vehicleId?: string | null;
  status?: string | null;
  type?: string | null;
  limit?: number | null;
}, options?: { companyId?: string }) {
  try {
    const companyId =
      options?.companyId ?? (await requireServiceAccess("AUTOSCUOLE")).membership.companyId;
    const from = toValidDate(input.from);
    const to = toValidDate(input.to);
    if (!from || !to || to <= from) {
      return { success: false, message: "Intervallo agenda non valido." };
    }

    const normalizedStatus = normalizeOptionalFilter(input.status);
    const normalizedType = normalizeOptionalFilter(input.type);
    const limit =
      typeof input.limit === "number" && Number.isFinite(input.limit)
        ? Math.max(1, Math.min(600, Math.trunc(input.limit)))
        : 500;

    const [appointments, students, instructors, vehicles, instructorBlocks, holidays] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          startsAt: { gte: from, lt: to },
          ...(input.instructorId ? { instructorId: input.instructorId } : {}),
          ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
          ...(normalizedType ? { type: normalizedType } : {}),
        },
        select: {
          id: true,
          companyId: true,
          studentId: true,
          caseId: true,
          slotId: true,
          type: true,
          types: true,
          rating: true,
          notes: true,
          status: true,
          startsAt: true,
          endsAt: true,
          instructorId: true,
          vehicleId: true,
          cancellationKind: true,
          cancellationReason: true,
          replacedByAppointmentId: true,
          createdAt: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          instructor: {
            select: {
              id: true,
              name: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
        take: limit,
      }),
      listDirectoryStudents(companyId),
      listAutoscuolaInstructorsReadOnly(companyId),
      listAutoscuolaVehiclesReadOnly(companyId),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          startsAt: { lt: to },
          endsAt: { gt: from },
          ...(input.instructorId ? { instructorId: input.instructorId } : {}),
        },
        select: {
          id: true,
          companyId: true,
          instructorId: true,
          startsAt: true,
          endsAt: true,
          reason: true,
          recurrenceGroupId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.autoscuolaHoliday.findMany({
        where: {
          companyId,
          date: { gte: from, lte: to },
        },
        select: {
          date: true,
          label: true,
        },
        orderBy: { date: "asc" },
      }),
    ]);

    return {
      success: true,
      data: {
        appointments: appointments.map((appointment) => ({
          ...appointment,
          case: null,
          student: mapCaseStudent(appointment.student),
        })),
        students,
        instructors,
        vehicles,
        instructorBlocks,
        holidays: holidays.map((h) => ({
          date: h.date.toISOString(),
          label: h.label,
        })),
        meta: {
          from,
          to,
          generatedAt: new Date(),
          count: appointments.length,
        },
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getInstructorAvailabilityForAgenda(input: {
  from: string;
  to: string;
}): Promise<{
  success: boolean;
  data?: Array<{
    instructorId: string;
    instructorName: string;
    days: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
  }>;
  message?: string;
}> {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const fromDate = toValidDate(input.from);
    const toDate = toValidDate(input.to);
    if (!fromDate || !toDate) {
      return { success: false, message: "Date non valide." };
    }

    const instructors = await prisma.autoscuolaInstructor.findMany({
      where: {
        companyId,
        status: { not: "inactive" },
        userId: { not: null },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (!instructors.length) {
      return { success: true, data: [] };
    }

    const instructorIds = instructors.map((i) => i.id);

    const resolver = await buildAvailabilityResolver(
      companyId,
      "instructor",
      instructorIds,
      fromDate,
      toDate,
    );

    const DOW_MAP: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dowFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "Europe/Rome",
    });

    // Build list of dates in range
    const dates: Date[] = [];
    const cursor = new Date(fromDate);
    while (cursor < toDate) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const data: Array<{
      instructorId: string;
      instructorName: string;
      days: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
    }> = [];

    for (const instructor of instructors) {
      const days: Record<string, Array<{ startMinutes: number; endMinutes: number }>> = {};

      for (const date of dates) {
        const record = resolver.resolve(instructor.id, date);
        if (!record) continue;

        const romeDow = dowFormatter.format(date);
        const dayOfWeek = DOW_MAP[romeDow] ?? date.getDay();
        if (!record.daysOfWeek.includes(dayOfWeek)) continue;

        if (record.ranges.length > 0) {
          const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          days[ymd] = record.ranges.map((r) => ({
            startMinutes: r.startMinutes,
            endMinutes: r.endMinutes,
          }));
        }
      }

      data.push({
        instructorId: instructor.id,
        instructorName: instructor.name,
        days,
      });
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaDeadlines() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const now = new Date();
    const soonThreshold = new Date(now);
    soonThreshold.setDate(soonThreshold.getDate() + 30);

    const cases = await prisma.autoscuolaCase.findMany({
      where: {
        companyId,
        OR: [
          { pinkSheetExpiresAt: { not: null } },
          { medicalExpiresAt: { not: null } },
        ],
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const items = cases.flatMap((item) => {
      const deadlines = [
        { type: "PINK_SHEET_EXPIRES", date: item.pinkSheetExpiresAt },
        { type: "MEDICAL_EXPIRES", date: item.medicalExpiresAt },
      ].filter((entry) => entry.date);

      return deadlines.map((entry) => {
        const deadlineDate = entry.date as Date;
        const studentProfile = mapCaseStudent(item.student);
        const status =
          deadlineDate < now
            ? "overdue"
            : deadlineDate <= soonThreshold
              ? "soon"
              : "ok";
        return {
          id: `${item.id}-${entry.type}`,
          caseId: item.id,
          studentId: item.studentId,
          studentName: `${studentProfile.firstName} ${studentProfile.lastName}`,
          deadlineType: entry.type,
          deadlineDate,
          status,
          caseStatus: item.status,
        };
      });
    });

    items.sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime());

    return { success: true, data: items };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaStudents(search?: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const members = await prisma.companyMember.findMany({
      where: buildStudentSearchWhere(companyId, search),
      include: { user: { select: STUDENT_USER_SELECT } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return { success: true, data: members.map((m) => toStudentProfile(m.user, m.createdAt)) };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

type DrivingRegisterCaseRow = {
  id: string;
  studentId: string;
  status: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DrivingRegisterLessonRow = {
  id: string;
  studentId: string;
  caseId: string | null;
  type: string;
  types?: string[];
  rating?: number | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  instructor?: { name: string } | null;
  vehicle?: { name: string } | null;
};

const buildDrivingRegisterData = ({
  cases,
  lessons,
}: {
  cases: DrivingRegisterCaseRow[];
  lessons: DrivingRegisterLessonRow[];
}) => {
  const activeCase =
    [...cases]
      .filter((item) => isActiveCaseStatus(item.status))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;

  const drivingLessons = [...lessons]
    .filter((lesson) => isDrivingLessonType(lesson.type))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  // Progress must reflect the student's real completed lessons, even when
  // appointments are not linked to the currently active case (legacy/null caseId).
  const completedLessons = drivingLessons.filter(
    (lesson) => normalizeStatus(lesson.status) === "completed",
  );

  const byLessonTypeMap = new Map<string, number>();
  for (const lesson of completedLessons) {
    const allTypes = lesson.types?.length ? lesson.types : [lesson.type];
    for (const t of allTypes) {
      const normalizedType = normalizeLessonType(t) || "altro";
      byLessonTypeMap.set(
        normalizedType,
        (byLessonTypeMap.get(normalizedType) ?? 0) + 1,
      );
    }
  }

  const byLessonType = Array.from(byLessonTypeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  const summaryCount = completedLessons.length;

  return {
    activeCase: activeCase
      ? {
          id: activeCase.id,
          status: activeCase.status,
          category: activeCase.category,
        }
      : null,
    summary: {
      completedLessons: summaryCount,
      requiredLessons: REQUIRED_LESSONS_COUNT,
      remaining: Math.max(0, REQUIRED_LESSONS_COUNT - summaryCount),
      isCompleted: summaryCount >= REQUIRED_LESSONS_COUNT,
    },
    byLessonType,
    lessons: drivingLessons.map((lesson) => {
      const end = computeAppointmentEnd({
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
      });
      const resolvedTypes = lesson.types?.length
        ? lesson.types.map((t) => normalizeLessonType(t) || "altro")
        : [normalizeLessonType(lesson.type) || "altro"];
      return {
        id: lesson.id,
        caseId: lesson.caseId,
        type: resolvedTypes[0],
        types: resolvedTypes,
        rating: lesson.rating ?? null,
        status: normalizeStatus(lesson.status),
        startsAt: lesson.startsAt,
        endsAt: end,
        durationMinutes: Math.max(
          30,
          Math.round((end.getTime() - lesson.startsAt.getTime()) / 60000),
        ),
        instructorName: lesson.instructor?.name ?? null,
        vehicleName: lesson.vehicle?.name ?? null,
      };
    }),
  };
};

export async function getAutoscuolaStudentsWithProgress(search?: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const members = await prisma.companyMember.findMany({
      where: buildStudentSearchWhere(companyId, search),
      include: { user: { select: STUDENT_USER_SELECT } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const students = members.map((m) => toStudentProfile(m.user, m.createdAt));
    if (!students.length) return { success: true, data: [] };

    const bookingBlockedMap = new Map<string, boolean>();
    for (const m of members) {
      bookingBlockedMap.set(m.userId, m.bookingBlocked);
    }

    const studentIds = students.map((student) => student.id);

    const [cases, lessons] = await Promise.all([
      prisma.autoscuolaCase.findMany({
        where: {
          companyId,
          studentId: { in: studentIds },
        },
        select: {
          id: true,
          studentId: true,
          status: true,
          category: true,
          createdAt: true,
          updatedAt: true,
        },
        take: 2000,
      }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: { in: studentIds },
        },
        select: {
          id: true,
          studentId: true,
          caseId: true,
          type: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
        take: 5000,
      }),
    ]);

    const casesByStudent = new Map<string, DrivingRegisterCaseRow[]>();
    for (const item of cases) {
      const current = casesByStudent.get(item.studentId) ?? [];
      current.push(item);
      casesByStudent.set(item.studentId, current);
    }

    const lessonsByStudent = new Map<string, DrivingRegisterLessonRow[]>();
    for (const item of lessons) {
      const current = lessonsByStudent.get(item.studentId) ?? [];
      current.push(item);
      lessonsByStudent.set(item.studentId, current);
    }

    const rows = students.map((student) => {
      const register = buildDrivingRegisterData({
        cases: casesByStudent.get(student.id) ?? [],
        lessons: lessonsByStudent.get(student.id) ?? [],
      });
      return {
        ...student,
        bookingBlocked: bookingBlockedMap.get(student.id) ?? false,
        activeCase: register.activeCase,
        summary: register.summary,
      };
    });

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function sendBroadcastPush(input: {
  title: string;
  body: string;
  role?: "OWNER" | "INSTRUCTOR" | "STUDENT" | null;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const where: Record<string, unknown> = { companyId: membership.companyId };
    if (input.role) where.autoscuolaRole = input.role;
    const members = await prisma.companyMember.findMany({
      where,
      select: { userId: true },
    });
    if (!members.length) {
      return { success: false, message: "Nessun utente trovato." };
    }
    const result = await sendAutoscuolaPushToUsers({
      companyId: membership.companyId,
      userIds: members.map((m) => m.userId),
      title: input.title,
      body: input.body,
      data: { kind: "broadcast" },
    });
    return { success: true, data: { ...result, targeted: members.length } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function clearPushDevices() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const userIds = (await prisma.companyMember.findMany({
      where: { companyId: membership.companyId },
      select: { userId: true },
    })).map((m) => m.userId);
    const deleted = await prisma.mobilePushDevice.deleteMany({
      where: { userId: { in: userIds } },
    });
    return { success: true, data: { deleted: deleted.count } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function sendTestPushToStudent(studentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const student = await prisma.companyMember.findFirst({
      where: { companyId: membership.companyId, userId: studentId },
      include: { user: { select: { name: true } } },
    });
    if (!student) {
      return { success: false, message: "Allievo non trovato." };
    }
    const result = await sendAutoscuolaPushToUsers({
      companyId: membership.companyId,
      userIds: [studentId],
      title: "Test notifica Reglo",
      body: "Se vedi questo messaggio, le notifiche push funzionano correttamente!",
      data: { kind: "test_push" },
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaStudentDrivingRegister(studentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const studentMembership = await prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: studentId,
        autoscuolaRole: "STUDENT",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!studentMembership) {
      return { success: false, message: "Allievo non trovato." };
    }

    const [cases, lessons] = await Promise.all([
      prisma.autoscuolaCase.findMany({
        where: { companyId, studentId },
        select: {
          id: true,
          studentId: true,
          status: true,
          category: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: { companyId, studentId },
        select: {
          id: true,
          studentId: true,
          caseId: true,
          type: true,
          types: true,
          rating: true,
          status: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          cancellationKind: true,
          cancellationReason: true,
          paymentRequired: true,
          manualPaymentStatus: true,
          creditApplied: true,
          lateCancellationAction: true,
          notes: true,
          createdAt: true,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
        },
        orderBy: { startsAt: "desc" },
      }),
    ]);

    const register = buildDrivingRegisterData({ cases, lessons });
    const student = toStudentProfile(studentMembership.user, studentMembership.createdAt);

    // Exam priority info
    const { getExamPriorityInfo } = await import("@/lib/autoscuole/exam-priority");
    const examPriorityInfo = await getExamPriorityInfo(companyId, studentId);

    const now = new Date();
    const booked = lessons.length;
    const completed = lessons.filter((l) => normalizeStatus(l.status) === "completed").length;
    const cancelled = lessons.filter((l) => normalizeStatus(l.status) === "cancelled").length;
    const upcoming = lessons.filter(
      (l) =>
        ["scheduled", "confirmed"].includes(normalizeStatus(l.status)) &&
        l.startsAt > now,
    ).length;
    const manualUnpaid = lessons.filter(
      (l) =>
        (normalizeStatus(l.status) === "completed" &&
          l.manualPaymentStatus === "unpaid") ||
        (["cancelled", "no_show"].includes(normalizeStatus(l.status)) &&
          l.lateCancellationAction === "charged" &&
          l.manualPaymentStatus === "unpaid"),
    ).length;

    return {
      success: true,
      data: {
        student,
        bookingBlocked: studentMembership.bookingBlocked,
        weeklyBookingLimitExempt: studentMembership.weeklyBookingLimitExempt,
        examPriorityOverride: studentMembership.examPriorityOverride,
        examPriorityActive: examPriorityInfo.active,
        examDate: examPriorityInfo.examDate,
        activeCase: register.activeCase,
        summary: register.summary,
        extendedSummary: { booked, completed, cancelled, upcoming, manualUnpaid },
        byLessonType: register.byLessonType,
        lessons: register.lessons.map((lesson) => {
          const raw = lessons.find((l) => l.id === lesson.id);
          return {
            ...lesson,
            cancelledAt: raw?.cancelledAt ?? null,
            cancellationKind: raw?.cancellationKind ?? null,
            cancellationReason: raw?.cancellationReason ?? null,
            paymentRequired: raw?.paymentRequired ?? false,
            manualPaymentStatus: raw?.manualPaymentStatus ?? null,
            creditApplied: raw?.creditApplied ?? false,
            lateCancellationAction: raw?.lateCancellationAction ?? null,
            notes: raw?.notes ?? null,
            createdAt: raw?.createdAt ?? null,
          };
        }),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaStudentLessonCredits(studentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const studentMembership = await prisma.companyMember.findFirst({
      where: {
        companyId,
        autoscuolaRole: "STUDENT",
        userId: studentId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!studentMembership) {
      return { success: false, message: "Allievo non trovato." };
    }

    const credits = await getStudentLessonCredits({
      companyId,
      studentId,
      limit: 30,
    });

    return {
      success: true,
      data: {
        student: toStudentProfile(studentMembership.user, studentMembership.createdAt),
        availableCredits: credits.availableCredits,
        ledger: credits.ledger.map((entry) => ({
          ...entry,
          actorName: entry.actor?.name ?? null,
        })),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function adjustAutoscuolaStudentLessonCredits(
  input: z.infer<typeof adjustStudentLessonCreditsSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }

    const payload = adjustStudentLessonCreditsSchema.parse(input);
    const studentMembership = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        autoscuolaRole: "STUDENT",
        userId: payload.studentId,
      },
      select: {
        userId: true,
      },
    });

    if (!studentMembership) {
      return { success: false, message: "Allievo non trovato." };
    }

    const normalizedDelta = payload.reason === "manual_grant"
      ? Math.abs(payload.delta)
      : -Math.abs(payload.delta);

    const result = await adjustStudentLessonCredits({
      companyId: membership.companyId,
      studentId: payload.studentId,
      delta: normalizedDelta,
      reason: payload.reason,
      actorUserId: membership.userId,
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [
        AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
        AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
      ],
    });

    return {
      success: true,
      data: {
        availableCredits: result.availableCredits,
        appliedDelta: result.appliedDelta,
      },
      message:
        result.appliedDelta === 0 && payload.reason === "manual_revoke"
          ? "Nessun credito disponibile da stornare."
          : payload.reason === "manual_grant"
            ? "Crediti assegnati."
            : "Crediti stornati.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaStudent(input: z.infer<typeof createStudentSchema>) {
  try {
    await requireServiceAccess("AUTOSCUOLE");
    createStudentSchema.parse(input);
    return {
      success: false,
      message:
        "Gli allievi vengono gestiti dalla Directory utenti. Imposta il ruolo Allievo in Directory.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function importAutoscuolaStudents(input: z.infer<typeof importStudentsSchema>) {
  try {
    await requireServiceAccess("AUTOSCUOLE");
    importStudentsSchema.parse(input);
    return {
      success: false,
      message:
        "Import CSV disattivato: gli allievi si gestiscono dalla Directory utenti (ruolo Allievo).",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaCases() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const cases = await prisma.autoscuolaCase.findMany({
      where: { companyId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return {
      success: true,
      data: cases.map((item) => ({
        ...item,
        student: mapCaseStudent(item.student),
      })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaCase(input: z.infer<typeof createCaseSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createCaseSchema.parse(input);
    const studentMember = await prisma.companyMember.findFirst({
      where: {
        companyId,
        autoscuolaRole: "STUDENT",
        userId: payload.studentId,
      },
      select: { userId: true },
    });
    if (!studentMember) {
      return { success: false, message: "Allievo non valido per questa company." };
    }

    const newCase = await prisma.autoscuolaCase.create({
      data: {
        companyId,
        studentId: payload.studentId,
        category: payload.category ?? null,
        status: payload.status ?? "iscritto",
        theoryExamAt: payload.theoryExamAt ? new Date(payload.theoryExamAt) : null,
        drivingExamAt: payload.drivingExamAt ? new Date(payload.drivingExamAt) : null,
        pinkSheetExpiresAt: payload.pinkSheetExpiresAt
          ? new Date(payload.pinkSheetExpiresAt)
          : null,
        medicalExpiresAt: payload.medicalExpiresAt
          ? new Date(payload.medicalExpiresAt)
          : null,
      },
    });

    return { success: true, data: newCase };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaAppointments() {
  return getAutoscuolaAppointmentsFiltered();
}

export async function getAutoscuolaAppointmentsFiltered(input?: {
  from?: string | Date | null;
  to?: string | Date | null;
  studentId?: string | null;
  instructorId?: string | null;
  status?: string | null;
  type?: string | null;
  limit?: number | null;
  light?: boolean | null;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const from = toValidDate(input?.from);
    const to = toValidDate(input?.to);
    const statusFilter = normalizeOptionalFilter(input?.status);
    const typeFilter = normalizeOptionalFilter(input?.type);
    const limit =
      typeof input?.limit === "number" && Number.isFinite(input.limit)
        ? Math.max(1, Math.min(500, Math.trunc(input.limit)))
        : 300; // safe default — prevents unbounded fetches when caller omits limit

    const where: {
      companyId: string;
      startsAt?: { gte?: Date; lt?: Date };
      studentId?: string;
      instructorId?: string;
      status?: string;
      type?: string;
    } = { companyId };

    if (from || to) {
      where.startsAt = {};
      if (from) where.startsAt.gte = from;
      if (to) where.startsAt.lt = to;
    }
    if (input?.studentId) where.studentId = input.studentId;
    if (input?.instructorId) where.instructorId = input.instructorId;
    if (statusFilter) where.status = statusFilter;
    if (typeFilter) where.type = typeFilter;

    if (input?.light) {
      const appointments = await prisma.autoscuolaAppointment.findMany({
        where,
        select: {
          id: true,
          companyId: true,
          studentId: true,
          caseId: true,
          slotId: true,
          type: true,
          types: true,
          rating: true,
          startsAt: true,
          endsAt: true,
          status: true,
          instructorId: true,
          vehicleId: true,
          notes: true,
          cancellationKind: true,
          cancellationReason: true,
          replacedByAppointmentId: true,
          createdAt: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          instructor: {
            select: {
              id: true,
              companyId: true,
              userId: true,
              name: true,
              phone: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              companyId: true,
              name: true,
              plate: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
        ...(limit ? { take: limit } : {}),
      });

      return {
        success: true,
        data: appointments.map((item) => ({
          ...item,
          case: null,
          student: mapCaseStudent(item.student),
        })),
      };
    }

    const appointments = await prisma.autoscuolaAppointment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        case: true,
        instructor: true,
        vehicle: true,
      },
      orderBy: { startsAt: "asc" },
      ...(limit ? { take: limit } : {}),
    });

    return {
      success: true,
      data: appointments.map((item) => ({
        ...item,
        student: mapCaseStudent(item.student),
      })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaLatestStudentAppointmentNote(input: {
  studentId?: string | null;
  before?: string | Date | null;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const studentId = (input.studentId ?? "").trim();
    if (!studentId) {
      return { success: false, message: "Allievo non valido." };
    }
    const before = toValidDate(input.before) ?? new Date();

    const latestWithNote = await prisma.autoscuolaAppointment.findFirst({
      where: {
        companyId,
        studentId,
        startsAt: { lt: before },
        status: { not: "cancelled" },
        NOT: [{ notes: null }, { notes: "" }],
      },
      select: {
        id: true,
        startsAt: true,
        notes: true,
      },
      orderBy: { startsAt: "desc" },
    });

    return {
      success: true,
      data: latestWithNote
        ? {
            appointmentId: latestWithNote.id,
            startsAt: latestWithNote.startsAt,
            note: (latestWithNote.notes ?? "").trim(),
          }
        : null,
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaAppointment(
  input: z.infer<typeof createAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createAppointmentSchema.parse(input);
    const requestedType = normalizeLessonType(payload.type);
    const requestedTypes = payload.types?.map(normalizeLessonType).filter(Boolean) ?? [];
    const governance = await getBookingGovernanceForCompany(companyId);

    const isInstructorActor =
      membership.autoscuolaRole === "INSTRUCTOR" && membership.role !== "admin";
    const isStudentActor =
      membership.autoscuolaRole === "STUDENT" && membership.role !== "admin";
    const isOwnerOrAdminActor =
      membership.role === "admin" || membership.autoscuolaRole === "OWNER";

    let resolvedInstructorId = payload.instructorId;
    if (isStudentActor) {
      if (!isStudentAppBookingEnabled(governance)) {
        return {
          success: false,
          message: "La prenotazione da app è abilitata solo per istruttori.",
        };
      }
      if (payload.studentId !== membership.userId) {
        return {
          success: false,
          message: "Puoi prenotare solo per il tuo profilo allievo.",
        };
      }
    } else if (isInstructorActor) {
      if (!isInstructorAppBookingEnabled(governance)) {
        return {
          success: false,
          message: "La prenotazione da app è abilitata solo per allievi.",
        };
      }
      const ownInstructor = await getOwnInstructorProfile(
        companyId,
        membership.userId,
      );
      if (!ownInstructor) {
        return {
          success: false,
          message: "Profilo istruttore non trovato per questo account.",
        };
      }
      resolvedInstructorId = ownInstructor.id;
    } else if (!isOwnerOrAdminActor) {
      return { success: false, message: "Operazione non consentita." };
    }

    // Booking block enforcement
    const studentBlocked = await getStudentBookingBlockStatus(companyId, payload.studentId);
    if (studentBlocked) {
      if (isStudentActor || isInstructorActor) {
        return {
          success: false,
          message:
            "Le tue prenotazioni sono temporaneamente sospese. Contatta la segreteria.",
        };
      }
      // Owner/Admin: soft warning — don't block, just flag
    }

    // Weekly booking limit enforcement
    const weeklyLimitSettings = await (async () => {
      const svc = await prisma.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      });
      const lim = (svc?.limits ?? {}) as Record<string, unknown>;
      const enabled = lim.weeklyBookingLimitEnabled === true;
      const limit = typeof lim.weeklyBookingLimit === "number" && lim.weeklyBookingLimit >= 1
        ? lim.weeklyBookingLimit
        : 3;
      const examPriorityEnabled = lim.examPriorityEnabled === true;
      const examPriorityLimit =
        typeof lim.examPriorityLimit === "number" && lim.examPriorityLimit >= 1
          ? lim.examPriorityLimit
          : 5;
      return { enabled, limit, examPriorityEnabled, examPriorityLimit };
    })();

    if (weeklyLimitSettings.enabled && !payload.skipWeeklyLimitCheck) {
      // Check if student is exempt
      const memberRecord = await prisma.companyMember.findFirst({
        where: { companyId, userId: payload.studentId },
        select: { weeklyBookingLimitExempt: true },
      });
      const isExempt = memberRecord?.weeklyBookingLimitExempt === true;

      if (!isExempt) {
        // Determine effective limit (exam priority may raise it)
        let effectiveLimit = weeklyLimitSettings.limit;
        if (weeklyLimitSettings.examPriorityEnabled) {
          const { hasExamPriority } = await import("@/lib/autoscuole/exam-priority");
          const hasPriority = await hasExamPriority(companyId, payload.studentId);
          if (hasPriority) {
            effectiveLimit = weeklyLimitSettings.examPriorityLimit;
          }
        }

        // Calculate current ISO week bounds (Monday-Sunday) for the slot being booked
        const slotDate = new Date(payload.startsAt);
        const dayOfWeek = slotDate.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(slotDate);
        weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
        weekStart.setUTCHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

        const weekCount = await prisma.autoscuolaAppointment.count({
          where: {
            companyId,
            studentId: payload.studentId,
            status: { notIn: ["cancelled"] },
            startsAt: { gte: weekStart, lt: weekEnd },
          },
        });

        if (weekCount >= effectiveLimit) {
          if (isStudentActor) {
            return {
              success: false,
              message: `Hai raggiunto il limite massimo di ${effectiveLimit} guide settimanali. Non puoi prenotare altre guide per questa settimana.`,
              code: "WEEKLY_LIMIT_REACHED" as const,
            };
          }
          // Instructor or Admin: return warning but don't block (unless skipWeeklyLimitCheck is false and they haven't confirmed)
          if (isInstructorActor || isOwnerOrAdminActor) {
            return {
              success: false,
              message: `L'allievo ha già raggiunto il limite di ${effectiveLimit} guide settimanali (${weekCount} prenotate). Vuoi procedere comunque?`,
              code: "WEEKLY_LIMIT_CONFIRM" as const,
              weeklyLimitData: { current: weekCount, limit: effectiveLimit },
            };
          }
        }
      }
    }

    const shouldSendProposal =
      payload.sendProposal ||
      (isInstructorActor && governance.instructorBookingMode === "guided_proposal");
    const appointmentStatus = shouldSendProposal
      ? "proposal"
      : payload.status ?? "scheduled";

    const [student, instructor, vehicle, lessonPolicy] = await Promise.all([
      prisma.companyMember.findFirst({
        where: {
          companyId,
          autoscuolaRole: "STUDENT",
          userId: payload.studentId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.autoscuolaInstructor.findFirst({
        where: { id: resolvedInstructorId, companyId },
      }),
      prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId },
      }),
      getLessonPolicyForCompany(companyId),
    ]);

    if (!student || !instructor || !vehicle) {
      return {
        success: false,
        message: "Seleziona allievo, istruttore e veicolo validi.",
      };
    }

    if (lessonPolicy.lessonPolicyEnabled && !requestedType && !requestedTypes.length) {
      return {
        success: false,
        message: "Con policy attiva devi selezionare il tipo guida.",
      };
    }

    if (requestedType && !isLessonAllowedType(requestedType)) {
      return {
        success: false,
        message: "Tipo guida non valido.",
      };
    }
    if (requestedTypes.length && !requestedTypes.every(isLessonAllowedType)) {
      return {
        success: false,
        message: "Uno o più tipi guida non validi.",
      };
    }
    const resolvedType = requestedType || requestedTypes[0] || "guida";
    const resolvedTypes = requestedTypes.length ? requestedTypes : [resolvedType];

    const slotTime = new Date(payload.startsAt);
    if (Number.isNaN(slotTime.getTime())) {
      return { success: false, message: "Orario di inizio non valido." };
    }
    if (slotTime.getTime() < Date.now()) {
      return {
        success: false,
        message: "Non puoi prenotare una guida nel passato.",
      };
    }
    const slotEnd = payload.endsAt
      ? new Date(payload.endsAt)
      : new Date(slotTime.getTime() + 30 * 60 * 1000);
    if (Number.isNaN(slotEnd.getTime()) || slotEnd <= slotTime) {
      return {
        success: false,
        message: "Orario di fine non valido.",
      };
    }
    const warnings: string[] = [];
    if (studentBlocked && isOwnerOrAdminActor) {
      warnings.push("Attenzione: l'allievo ha le prenotazioni bloccate.");
    }
    if (
      lessonPolicy.lessonPolicyEnabled &&
      lessonPolicy.lessonRequiredTypesEnabled &&
      lessonPolicy.lessonRequiredTypes.length
    ) {
      const coverage = await getStudentLessonPolicyCoverage({
        companyId,
        studentId: payload.studentId,
        policy: lessonPolicy,
      });
      const selectedPolicyTypes = resolvedTypes.filter(isLessonPolicyType);
      const coversAnyMissing = selectedPolicyTypes.some((t) => coverage.missingRequiredTypes.includes(t));
      if (
        coverage.missingRequiredTypes.length &&
        !coversAnyMissing
      ) {
        warnings.push(
          `Tipo guida non prioritario rispetto ai tipi ancora mancanti (${formatLessonTypesList(
            coverage.missingRequiredTypes,
          )}).`,
        );
      }
    }
    if (lessonPolicy.lessonPolicyEnabled) {
      const policyTypes = resolvedTypes.filter(isLessonPolicyType);
      const disallowed = policyTypes.filter(
        (t) => !isLessonTypeAllowedForInterval({ policy: lessonPolicy, lessonType: t, startsAt: slotTime, endsAt: slotEnd }),
      );
      if (disallowed.length) {
        warnings.push("Il tipo guida selezionato è fuori dalla finestra configurata.");
      }
    }

    const scanStart = new Date(slotTime);
    scanStart.setDate(scanStart.getDate() - 1);
    const scanEnd = new Date(slotEnd);
    scanEnd.setDate(scanEnd.getDate() + 1);

    const conflicts = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        startsAt: { gte: scanStart, lt: scanEnd },
        status: { notIn: ["cancelled"] },
        OR: [
          { instructorId: resolvedInstructorId },
          { vehicleId: payload.vehicleId },
        ],
      },
    });
    const hasConflict = conflicts.some((item) => {
      const start = item.startsAt;
      const end = item.endsAt ?? new Date(start.getTime() + 30 * 60 * 1000);
      return start < slotEnd && end > slotTime;
    });
    if (hasConflict && !payload.skipConflictCheck) {
      return {
        success: false,
        message: "Slot non disponibile per istruttore o veicolo.",
      };
    }

    const appointmentId = randomUUID();
    const appointment = await prisma.$transaction(async (tx) => {
      const paymentSnapshot = await prepareAppointmentPaymentSnapshot({
        prisma: tx as never,
        companyId,
        studentId: payload.studentId,
        startsAt: slotTime,
        endsAt: slotEnd,
        appointmentId,
        actorUserId: membership.userId,
      });

        return tx.autoscuolaAppointment.create({
          data: {
            id: appointmentId,
            companyId,
            studentId: payload.studentId,
            caseId: payload.caseId || null,
            type: resolvedTypes[0],
            types: resolvedTypes,
            startsAt: slotTime,
            endsAt: slotEnd,
            status: appointmentStatus,
            instructorId: resolvedInstructorId,
            vehicleId: payload.vehicleId,
          notes: payload.notes ?? null,
          paymentRequired: paymentSnapshot.paymentRequired,
          paymentStatus: paymentSnapshot.paymentStatus,
          priceAmount: paymentSnapshot.priceAmount,
          penaltyAmount: paymentSnapshot.penaltyAmount,
          penaltyCutoffAt: paymentSnapshot.penaltyCutoffAt,
          paidAmount: paymentSnapshot.paidAmount,
          invoiceStatus: paymentSnapshot.invoiceStatus,
          creditApplied: paymentSnapshot.creditApplied,
          manualPaymentStatus: paymentSnapshot.manualPaymentStatus ?? null,
        },
      });
    });

    await invalidateAgendaAndPaymentsCache(companyId);

    // Serialize Decimal fields for client component compatibility
    const serializedAppointment = {
      ...appointment,
      priceAmount: Number(appointment.priceAmount),
      penaltyAmount: Number(appointment.penaltyAmount),
      paidAmount: Number(appointment.paidAmount),
    };

    if (!shouldSendProposal) {
      return {
        success: true,
        data: serializedAppointment,
        message: "Appuntamento creato.",
        ...(warnings.length ? { warnings } : {}),
      };
    }

    let notificationSent = false;
    let pushSummary:
      | {
          sent: number;
          failed: number;
          skipped: number;
          invalidated: number;
          errorCodes?: string[];
          errorMessages?: string[];
        }
      | null = null;
    const userIds = [student.user.id];
    if (userIds.length) {
      const when = slotTime.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      try {
        const pushResult = await sendAutoscuolaPushToUsers({
          companyId,
          userIds,
          title: "Reglo Autoscuole · Nuova proposta guida",
          body: `Hai ricevuto una proposta per il ${when}. Apri Reglo per i dettagli.`,
          data: {
            kind: "appointment_proposal",
            appointmentId: appointment.id,
            startsAt: appointment.startsAt.toISOString(),
            type: appointment.type,
          },
        });
        pushSummary = pushResult;
        notificationSent = pushResult.sent > 0;
      } catch (error) {
        console.error("Appointment proposal push error", error);
      }
    }

    const pushMessage = notificationSent
      ? "Proposta creata e notifica inviata all'allievo."
      : pushSummary?.errorCodes?.includes("InvalidCredentials")
        ? "Proposta creata. Push non configurate: credenziali APNs mancanti o non valide su Expo."
      : pushSummary && pushSummary.sent === 0 && pushSummary.failed === 0
        ? "Proposta creata. Nessun dispositivo push registrato per l'allievo."
        : "Proposta creata. Invio push non riuscito.";

    return {
      success: true,
      data: serializedAppointment,
      message: pushMessage,
      ...(warnings.length ? { warnings } : {}),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function cancelAutoscuolaAppointment(
  input: z.infer<typeof cancelAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = cancelAppointmentSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    if (membership.role !== "admin" && membership.autoscuolaRole === "INSTRUCTOR") {
      const ownInstructor = await getOwnInstructorProfile(
        membership.companyId,
        membership.userId,
      );
      if (!ownInstructor || appointment.instructorId !== ownInstructor.id) {
        return {
          success: false,
          message: "Puoi annullare solo le tue guide.",
        };
      }
      const governance = await getBookingGovernanceForCompany(membership.companyId);
      if (!isInstructorAppBookingEnabled(governance)) {
        return {
          success: false,
          message: "La prenotazione da app è abilitata solo per allievi.",
        };
      }
      if (governance.instructorBookingMode !== "manual_full") {
        return {
          success: false,
          message: "In questa modalità usa 'Cancella e riposiziona'.",
        };
      }
    }

    await prisma.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationKind: "manual_cancel",
        cancellationReason: "manual_cancel",
      },
    });

    await refundLessonCreditIfEligible({
      appointmentId: appointment.id,
      cancelledByAutoscuola: false,
      actorUserId: membership.userId,
    });

    await notifyStudentAppointmentCancelled({
      companyId: membership.companyId,
      actorUserId: membership.userId,
      appointment: {
        id: appointment.id,
        studentId: appointment.studentId,
        startsAt: appointment.startsAt,
        instructorId: appointment.instructorId,
      },
      cancellationKind: "manual_cancel",
      actorRole: membership.autoscuolaRole === "INSTRUCTOR" ? "instructor" : membership.role === "admin" ? "admin" : "owner",
    });

    if (appointment.slotId) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

      const rangeEnd =
        appointment.endsAt ??
        new Date(appointment.startsAt.getTime() + 30 * 60 * 1000);
      const ownerFilters = [
        { ownerType: "student", ownerId: appointment.studentId },
      ];
      if (appointment.instructorId) {
        ownerFilters.push({
          ownerType: "instructor",
          ownerId: appointment.instructorId,
        });
      }
      if (appointment.vehicleId) {
        ownerFilters.push({ ownerType: "vehicle", ownerId: appointment.vehicleId });
      }

      await prisma.autoscuolaAvailabilitySlot.updateMany({
        where: {
          companyId: membership.companyId,
          status: "booked",
          startsAt: { gte: appointment.startsAt, lt: rangeEnd },
          OR: ownerFilters,
        },
        data: { status: "open" },
      });

      await broadcastWaitlistOffer({
        companyId: membership.companyId,
        slotId: appointment.slotId,
        startsAt: appointment.startsAt,
        expiresAt,
        excludeStudentIds: [appointment.studentId, membership.userId],
      });

      await invalidateAgendaAndPaymentsCache(membership.companyId);

      return {
        success: true,
        data: { rescheduled: false, broadcasted: true },
      };
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true, data: { rescheduled: false } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function permanentlyCancelAutoscuolaAppointment(
  input: z.infer<typeof cancelAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = cancelAppointmentSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    await prisma.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationKind: "permanent_cancel",
        cancellationReason: "permanent_cancel",
      },
    });

    await refundLessonCreditIfEligible({
      appointmentId: appointment.id,
      cancelledByAutoscuola: true,
      actorUserId: membership.userId,
    });

    await notifyStudentAppointmentCancelled({
      companyId: membership.companyId,
      actorUserId: membership.userId,
      appointment: {
        id: appointment.id,
        studentId: appointment.studentId,
        startsAt: appointment.startsAt,
        instructorId: appointment.instructorId,
      },
      cancellationKind: "permanent_cancel",
      actorRole: membership.autoscuolaRole === "INSTRUCTOR" ? "instructor" : membership.role === "admin" ? "admin" : "owner",
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true, message: "Guida eliminata definitivamente." };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function cancelAndRepositionAutoscuolaAppointment(
  input: z.infer<typeof repositionAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = repositionAppointmentSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      select: {
        id: true,
        startsAt: true,
        instructorId: true,
        status: true,
      },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    if (membership.autoscuolaRole === "INSTRUCTOR" && membership.role !== "admin") {
      const governance = await getBookingGovernanceForCompany(membership.companyId);
      if (!isInstructorAppBookingEnabled(governance)) {
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

      if (!ownInstructor || appointment.instructorId !== ownInstructor.id) {
        return {
          success: false,
          message: "Puoi riposizionare solo le tue guide future.",
        };
      }
    } else if (
      membership.role !== "admin" &&
      membership.autoscuolaRole !== "OWNER"
    ) {
      return {
        success: false,
        message: "Operazione non consentita.",
      };
    }

    if (appointment.startsAt.getTime() <= Date.now()) {
      return {
        success: false,
        message: "Puoi riposizionare solo appuntamenti futuri.",
      };
    }

    const normalizedStatus = normalizeStatus(appointment.status);
    if (["cancelled", "completed", "no_show"].includes(normalizedStatus)) {
      return {
        success: false,
        message: "Appuntamento già chiuso.",
      };
    }

    const reason =
      payload.reason?.trim() ||
      (membership.autoscuolaRole === "INSTRUCTOR"
        ? "instructor_cancel"
        : "owner_delete");

    const response = await queueOperationalRepositionForAppointment({
      companyId: membership.companyId,
      appointmentId: appointment.id,
      reason,
      actorUserId: membership.userId,
      attemptNow: true,
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message ?? "Impossibile avviare il riposizionamento.",
      };
    }

    return {
      success: true,
      data: {
        queued: true,
        proposalCreated: response.proposalCreated,
        proposalStartsAt: response.proposalStartsAt,
        taskId: response.taskId ?? undefined,
      },
      message: response.proposalCreated
        ? "Guida cancellata e nuova proposta inviata all'allievo."
        : "Guida cancellata. Ricerca nuovo slot in corso.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaPaymentsOverviewAction() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const data = await getAutoscuolaPaymentsOverview({
      companyId: membership.companyId,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaPaymentsAppointmentsAction(input?: {
  limit?: number;
  cursor?: string | null;
  paymentAttemptsLimit?: number;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const data = await getAutoscuolaPaymentsAppointments({
      companyId: membership.companyId,
      limit: input?.limit ?? 100,
      cursor: input?.cursor ?? null,
      paymentAttemptsLimit: input?.paymentAttemptsLimit ?? 5,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaPaymentAppointmentLogsAction(appointmentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const data = await getAutoscuolaPaymentAppointmentLogs({
      companyId: membership.companyId,
      appointmentId,
    });

    if (!data) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteAutoscuolaAppointment(
  input: z.infer<typeof deleteAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const canDelete =
      membership.role === "admin" || membership.autoscuolaRole === "OWNER";
    if (!canDelete) {
      return {
        success: false,
        message: "Solo admin o titolare possono cancellare e riposizionare un evento.",
      };
    }

    const payload = deleteAppointmentSchema.parse(input);
    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }
    const response = await queueOperationalRepositionForAppointment({
      companyId: membership.companyId,
      appointmentId: appointment.id,
      reason: "owner_delete",
      actorUserId: membership.userId,
      attemptNow: true,
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message ?? "Impossibile cancellare e riposizionare.",
      };
    }

    return {
      success: true,
      data: {
        deleted: false,
        queued: true,
        proposalCreated: response.proposalCreated,
        proposalStartsAt: response.proposalStartsAt,
        taskId: response.taskId ?? undefined,
      },
      message: response.proposalCreated
        ? "Evento cancellato e nuova proposta inviata all'allievo."
        : "Evento cancellato. Ricerca nuovo slot in corso.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaAppointmentStatus(
  input: z.infer<typeof updateAppointmentStatusSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateAppointmentStatusSchema.parse(input);
    const nextStatus = normalizeStatus(payload.status);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      include: {
        instructor: { select: { id: true, userId: true } },
      },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    const currentStatus = normalizeStatus(appointment.status);

    // Block check-in / no-show on proposals — the student must accept first
    if (
      currentStatus === "proposal" &&
      (nextStatus === "checked_in" || nextStatus === "no_show")
    ) {
      return {
        success: false,
        message: "Non puoi segnare check-in o no-show su una guida proposta. L'allievo deve prima accettarla.",
      };
    }

    // Block check-in / no-show on cancelled appointments
    if (
      currentStatus === "cancelled" &&
      (nextStatus === "checked_in" || nextStatus === "no_show")
    ) {
      return {
        success: false,
        message: "Non puoi segnare check-in o assente su una guida già annullata.",
      };
    }

    if (membership.autoscuolaRole === "INSTRUCTOR" && membership.role !== "admin") {
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

      if (appointment.instructorId !== ownInstructor.id) {
        return {
          success: false,
          message: "Puoi aggiornare solo le tue guide.",
        };
      }

      if (!INSTRUCTOR_ALLOWED_STATUSES.has(nextStatus)) {
        return {
          success: false,
          message: "Come istruttore puoi segnare solo check-in o no-show.",
        };
      }
      const now = new Date();
      // pending_review lessons can be acted on at any time (no time window)
      if (currentStatus !== "pending_review" && !isWithinInstructorStatusWindow(appointment, now)) {
        if (now < new Date(appointment.startsAt.getTime() - 10 * 60 * 1000)) {
          return {
            success: false,
            message: `Azione disponibile dalle ${getInstructorWindowOpenTimeLabel(
              appointment.startsAt,
            )}.`,
          };
        }
        return {
          success: false,
          message: "Azione non disponibile oltre la fine della giornata guida.",
        };
      }
    }

    const requestedLessonType = normalizeLessonType(payload.lessonType);
    const requestedLessonTypes = payload.lessonTypes?.map(normalizeLessonType).filter(Boolean) ?? [];
    const appointmentLessonType = normalizeLessonType(appointment.type);
    const appointmentEnd = computeAppointmentEnd({
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });
    let enforceRequiredTypeSelection = false;
    let compatibleMissingTypes: string[] = [];

    if (membership.autoscuolaRole === "INSTRUCTOR" && membership.role !== "admin") {
      const lessonPolicy = await getLessonPolicyForCompany(membership.companyId);
      if (
        lessonPolicy.lessonPolicyEnabled &&
        lessonPolicy.lessonRequiredTypesEnabled &&
        lessonPolicy.lessonRequiredTypes.length
      ) {
        const coverage = await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: appointment.studentId,
          policy: lessonPolicy,
        });
        if (coverage.missingRequiredTypes.length) {
          enforceRequiredTypeSelection = true;
          compatibleMissingTypes = getCompatibleLessonTypesForInterval({
            policy: lessonPolicy,
            startsAt: appointment.startsAt,
            endsAt: appointmentEnd,
            candidateTypes: coverage.missingRequiredTypes,
          });
        }
      }
    }
    const updateData: {
      status: string;
      type?: string;
      types?: string[];
      cancelledAt?: Date | null;
      cancellationKind?: string | null;
      cancellationReason?: string | null;
    } = {
      status: nextStatus,
    };
    const isOwnerPresetType =
      appointmentLessonType.length > 0 && appointmentLessonType !== "guida";
    const isInstructorTypeAllowed = (type: string) => {
      if (!enforceRequiredTypeSelection) return true;
      if (compatibleMissingTypes.includes(type)) return true;
      return isOwnerPresetType && type === appointmentLessonType;
    };

    // Resolve types array: prefer lessonTypes[], fallback to single lessonType
    const resolveTypes = (): string[] => {
      if (requestedLessonTypes.length) return requestedLessonTypes;
      if (requestedLessonType) return [requestedLessonType];
      return [];
    };

    if (nextStatus === "checked_in") {
      const types = resolveTypes();
      const resolvedLessonType = types[0] || appointmentLessonType;
      if (!resolvedLessonType || !LESSON_TYPE_SET.has(resolvedLessonType)) {
        return {
          success: false,
          message: "Seleziona un tipo guida valido.",
        };
      }
      for (const t of (types.length ? types : [resolvedLessonType])) {
        if (!LESSON_TYPE_SET.has(t)) {
          return { success: false, message: "Uno o più tipi guida non validi." };
        }
        if (!isInstructorTypeAllowed(t)) {
          return {
            success: false,
            message: `Seleziona un tipo guida compatibile (${formatLessonTypesList(
              compatibleMissingTypes,
            )}).`,
          };
        }
      }
      const finalTypes = types.length ? types : [resolvedLessonType];
      updateData.type = finalTypes[0];
      updateData.types = finalTypes;
    } else if (nextStatus === "no_show") {
      const types = resolveTypes();
      if (types.length) {
        for (const t of types) {
          if (!LESSON_TYPE_SET.has(t)) {
            return { success: false, message: "Tipo guida non valido." };
          }
          if (!isInstructorTypeAllowed(t)) {
            return {
              success: false,
              message: `Tipo guida non compatibile (${formatLessonTypesList(
                compatibleMissingTypes,
              )}).`,
            };
          }
        }
        updateData.type = types[0];
        updateData.types = types;
      }
    } else {
      const types = resolveTypes();
      if (types.length) {
        for (const t of types) {
          if (!LESSON_TYPE_SET.has(t)) {
            return { success: false, message: "Tipo guida non valido." };
          }
          if (!isInstructorTypeAllowed(t)) {
            return {
              success: false,
              message: `Tipo guida non compatibile (${formatLessonTypesList(
                compatibleMissingTypes,
              )}).`,
            };
          }
        }
        updateData.type = types[0];
        updateData.types = types;
      }
    }

    // Auto-complete if marking checked_in on a past lesson
    if (nextStatus === "checked_in") {
      const endTime = appointment.endsAt ?? new Date(appointment.startsAt.getTime() + 60 * 60 * 1000);
      if (new Date() >= endTime) {
        updateData.status = "completed";
      }
    }

    const wasCancelled = normalizeStatus(appointment.status) === "cancelled";
    if (nextStatus === "cancelled") {
      updateData.cancelledAt = appointment.cancelledAt ?? new Date();
      updateData.cancellationKind = "manual_cancel";
      updateData.cancellationReason = "manual_cancel";
    }

    const updated = await prisma.autoscuolaAppointment.update({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      data: updateData,
    });

    if (nextStatus === "checked_in") {
      // Try to apply lesson credit for appointments created without credits (optional credits flow)
      try {
        await applyLessonCreditToExistingAppointment({
          appointmentId: updated.id,
          actorUserId: membership.userId,
        });
      } catch (error) {
        console.error("Autoscuola credit apply at check-in error", error);
      }

      try {
        await processAutoscuolaAppointmentSettlementNow({
          appointmentId: updated.id,
        });
      } catch (error) {
        console.error("Autoscuola immediate settlement error", error);
      }
    }

    if (nextStatus === "cancelled" && !wasCancelled) {
      const cancelledByAutoscuola =
        membership.role === "admin" ||
        membership.autoscuolaRole === "OWNER" ||
        membership.autoscuolaRole === "INSTRUCTOR";
      await refundLessonCreditIfEligible({
        appointmentId: updated.id,
        cancelledByAutoscuola,
        actorUserId: membership.userId,
      });

      await notifyStudentAppointmentCancelled({
        companyId: membership.companyId,
        actorUserId: membership.userId,
        appointment: {
          id: updated.id,
          studentId: updated.studentId,
          startsAt: updated.startsAt,
          instructorId: updated.instructorId ?? null,
        },
        cancellationKind: "manual_cancel",
        actorRole: membership.autoscuolaRole === "INSTRUCTOR" ? "instructor" : membership.role === "admin" ? "admin" : "owner",
      });
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaAppointmentDetails(
  input: z.infer<typeof updateAppointmentDetailsSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateAppointmentDetailsSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    if (membership.autoscuolaRole === "INSTRUCTOR" && membership.role !== "admin") {
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

      if (appointment.instructorId !== ownInstructor.id) {
        return {
          success: false,
          message: "Puoi modificare solo le tue guide.",
        };
      }

      const appointmentStatus = normalizeStatus(appointment.status);
      if (appointmentStatus === "cancelled") {
        return { success: false, message: "Guida non modificabile." };
      }

      if (
        ["completed", "no_show", "checked_in"].includes(appointmentStatus) &&
        !isWithinInstructorDetailsWindow(appointment, new Date())
      ) {
        return {
          success: false,
          message: "Puoi modificare questa guida solo fino a fine giornata.",
        };
      }
    }

    const updateData: { type?: string; types?: string[]; rating?: number | null; notes?: string | null } = {};
    const appointmentLessonType = normalizeLessonType(appointment.type);
    const appointmentEnd = computeAppointmentEnd({
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });
    let enforceRequiredTypeSelection = false;
    let compatibleMissingTypes: string[] = [];
    const isInstructorRole =
      membership.autoscuolaRole === "INSTRUCTOR" && membership.role !== "admin";

    if (isInstructorRole) {
      const lessonPolicy = await getLessonPolicyForCompany(membership.companyId);
      if (
        lessonPolicy.lessonPolicyEnabled &&
        lessonPolicy.lessonRequiredTypesEnabled &&
        lessonPolicy.lessonRequiredTypes.length
      ) {
        const coverage = await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: appointment.studentId,
          policy: lessonPolicy,
        });
        if (coverage.missingRequiredTypes.length) {
          enforceRequiredTypeSelection = true;
          compatibleMissingTypes = getCompatibleLessonTypesForInterval({
            policy: lessonPolicy,
            startsAt: appointment.startsAt,
            endsAt: appointmentEnd,
            candidateTypes: coverage.missingRequiredTypes,
          });
        }
      }
    }
    const isOwnerPresetType =
      appointmentLessonType.length > 0 && appointmentLessonType !== "guida";
    const isInstructorTypeAllowed = (type: string) => {
      if (!enforceRequiredTypeSelection) return true;
      if (compatibleMissingTypes.includes(type)) return true;
      return isOwnerPresetType && type === appointmentLessonType;
    };

    // Handle types: prefer lessonTypes[], fallback to lessonType
    const requestedTypes = payload.lessonTypes?.map(normalizeLessonType).filter(Boolean) ?? [];
    if (requestedTypes.length) {
      for (const t of requestedTypes) {
        if (!LESSON_TYPE_SET.has(t)) {
          return { success: false, message: "Uno o più tipi guida non validi." };
        }
        if (isInstructorRole && !isInstructorTypeAllowed(t)) {
          return {
            success: false,
            message: `Tipo guida non compatibile (${formatLessonTypesList(
              compatibleMissingTypes,
            )}).`,
          };
        }
      }
      updateData.type = requestedTypes[0];
      updateData.types = requestedTypes;
    } else if (payload.lessonType !== undefined) {
      const normalizedLessonType = normalizeLessonType(payload.lessonType);
      if (!normalizedLessonType || !LESSON_TYPE_SET.has(normalizedLessonType)) {
        return { success: false, message: "Tipo guida non valido." };
      }
      if (isInstructorRole && !isInstructorTypeAllowed(normalizedLessonType)) {
        return {
          success: false,
          message: `Tipo guida non compatibile (${formatLessonTypesList(
            compatibleMissingTypes,
          )}).`,
        };
      }
      updateData.type = normalizedLessonType;
      updateData.types = [normalizedLessonType];
    }

    // Handle rating
    if (payload.rating !== undefined) {
      const appointmentStatus = normalizeStatus(appointment.status);
      if (!["checked_in", "completed", "no_show"].includes(appointmentStatus)) {
        return { success: false, message: "Puoi valutare solo guide già effettuate." };
      }
      updateData.rating = payload.rating;
    }

    if (payload.notes !== undefined) {
      const normalizedNotes = normalizeText(payload.notes);
      updateData.notes = normalizedNotes || null;
    }

    if (!Object.keys(updateData).length) {
      return { success: false, message: "Nessuna modifica da salvare." };
    }

    const updated = await prisma.autoscuolaAppointment.update({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      data: updateData,
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaInstructors() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const instructors = await listAutoscuolaInstructorsReadOnly(membership.companyId);

    return { success: true, data: instructors };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaInstructorsDashboard() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const [instructors, todayAppointments, blocks] = await Promise.all([
      listAutoscuolaInstructorsReadOnly(companyId),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          startsAt: { gte: todayStart, lt: todayEnd },
          status: { notIn: ["cancelled"] },
        },
        select: {
          instructorId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          student: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        select: { instructorId: true, reason: true },
      }),
    ]);

    const blockedSet = new Map(blocks.map((b) => [b.instructorId, b.reason]));

    const data = instructors.map((inst) => {
      const myAppointments = todayAppointments.filter((a) => a.instructorId === inst.id);
      const current = myAppointments.find(
        (a) => a.startsAt <= now && a.endsAt != null && a.endsAt > now,
      );
      const next = myAppointments.find((a) => a.startsAt > now);
      const blockReason = blockedSet.get(inst.id) ?? null;

      let liveStatus: "busy" | "blocked" | "free" | "inactive" = "free";
      if (inst.status === "inactive") liveStatus = "inactive";
      else if (current) liveStatus = "busy";
      else if (blockReason !== null) liveStatus = "blocked";

      return {
        id: inst.id,
        name: inst.name,
        status: inst.status,
        liveStatus,
        blockReason,
        currentLesson: current
          ? {
              studentName: current.student?.name ?? null,
              endsAt: current.endsAt?.toISOString() ?? "",
            }
          : null,
        nextLesson: next
          ? {
              studentName: next.student?.name ?? null,
              startsAt: next.startsAt.toISOString(),
            }
          : null,
        todayCount: myAppointments.length,
      };
    });

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaInstructor(
  input: z.infer<typeof createInstructorSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createInstructorSchema.parse(input);

    const member = await prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: payload.userId,
        autoscuolaRole: "INSTRUCTOR",
      },
      include: { user: true },
    });
    if (!member) {
      return {
        success: false,
        message: "Seleziona un utente con ruolo istruttore.",
      };
    }

    const name =
      payload.name?.trim() ||
      member.user?.name ||
      member.user?.email?.split("@")[0] ||
      "Istruttore";

    const instructor = await prisma.autoscuolaInstructor.upsert({
      where: {
        companyId_userId: {
          companyId,
          userId: payload.userId,
        },
      },
      update: {
        name,
        phone: payload.phone ?? null,
        status: "active",
      },
      create: {
        companyId,
        userId: payload.userId,
        name,
        phone: payload.phone ?? null,
      },
    });

    await invalidateAutoscuoleCache({
      companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true, data: instructor };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaVehicles() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const vehicles = await listAutoscuolaVehiclesReadOnly(membership.companyId);

    return { success: true, data: vehicles };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaVehicle(
  input: z.infer<typeof createVehicleSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createVehicleSchema.parse(input);

    const vehicle = await prisma.autoscuolaVehicle.create({
      data: {
        companyId,
        name: payload.name,
        plate: payload.plate || null,
      },
    });

    await invalidateAutoscuoleCache({
      companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true, data: vehicle };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaInstructor(
  input: z.infer<typeof updateInstructorSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    ensureAutoscuolaRole(membership, ["OWNER"]);
    const payload = updateInstructorSchema.parse(input);

    if (payload.userId) {
      const member = await prisma.companyMember.findFirst({
        where: {
          companyId: membership.companyId,
          userId: payload.userId,
          autoscuolaRole: "INSTRUCTOR",
        },
      });
      if (!member) {
        return {
          success: false,
          message: "Utente non valido per ruolo istruttore.",
        };
      }
    }

    const existing = await prisma.autoscuolaInstructor.findFirst({
      where: { id: payload.instructorId, companyId: membership.companyId },
    });
    if (!existing) {
      return { success: false, message: "Istruttore non trovato." };
    }

    const updated = await prisma.autoscuolaInstructor.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        phone: payload.phone ?? undefined,
        status: payload.status,
        userId: payload.userId ?? undefined,
      },
    });

    const shouldReposition =
      (existing.status !== "inactive" && updated.status === "inactive") ||
      (payload.userId !== undefined && payload.userId !== existing.userId);

    if (shouldReposition) {
      const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          instructorId: existing.id,
          startsAt: { gt: new Date() },
          status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
        },
        select: { id: true },
      });

      await cancelAndQueueOperationalRepositionByResource({
        companyId: membership.companyId,
        appointmentIds: impactedAppointments.map((item) => item.id),
        reason: updated.status === "inactive" ? "instructor_inactive" : "directory_instructor_removed",
        actorUserId: membership.userId,
      });
    }

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaVehicle(
  input: z.infer<typeof updateVehicleSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    ensureAutoscuolaRole(membership, ["OWNER", "INSTRUCTOR"]);
    const payload = updateVehicleSchema.parse(input);

    const existing = await prisma.autoscuolaVehicle.findFirst({
      where: { id: payload.vehicleId, companyId: membership.companyId },
    });
    if (!existing) {
      return { success: false, message: "Veicolo non trovato." };
    }

    const updated = await prisma.autoscuolaVehicle.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        plate: payload.plate ?? undefined,
        status: payload.status,
      },
    });

    const shouldReposition =
      existing.status !== "inactive" && updated.status === "inactive";

    if (shouldReposition) {
      const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          vehicleId: existing.id,
          startsAt: { gt: new Date() },
          status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
        },
        select: { id: true },
      });

      await cancelAndQueueOperationalRepositionByResource({
        companyId: membership.companyId,
        appointmentIds: impactedAppointments.map((item) => item.id),
        reason: "vehicle_inactive",
        actorUserId: membership.userId,
      });
    }

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deactivateAutoscuolaVehicle(vehicleId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    ensureAutoscuolaRole(membership, ["OWNER", "INSTRUCTOR"]);

    const existing = await prisma.autoscuolaVehicle.findFirst({
      where: { id: vehicleId, companyId: membership.companyId },
    });
    if (!existing) {
      return { success: false, message: "Veicolo non trovato." };
    }

    const updated = await prisma.autoscuolaVehicle.update({
      where: { id: existing.id },
      data: { status: "inactive" },
    });

    const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        vehicleId: existing.id,
        startsAt: { gt: new Date() },
        status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
      },
      select: { id: true },
    });

    await cancelAndQueueOperationalRepositionByResource({
      companyId: membership.companyId,
      appointmentIds: impactedAppointments.map((item) => item.id),
      reason: "vehicle_inactive",
      actorUserId: membership.userId,
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

function slotKey(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export async function updateAutoscuolaCaseStatus(
  input: z.infer<typeof updateCaseStatusSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateCaseStatusSchema.parse(input);

    const updated = await prisma.autoscuolaCase.update({
      where: { id: payload.caseId, companyId: membership.companyId },
      data: { status: payload.status },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    const studentProfile = mapCaseStudent(updated.student);

    await notifyAutoscuolaCaseStatusChange({
      companyId: membership.companyId,
      caseId: updated.id,
      status: updated.status,
      student: {
        id: studentProfile.id,
        firstName: studentProfile.firstName,
        lastName: studentProfile.lastName,
        email: studentProfile.email,
        phone: studentProfile.phone,
      },
    });

    return {
      success: true,
      data: {
        ...updated,
        student: studentProfile,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getVoiceCallbackTasks(status?: "pending" | "done" | "all") {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const statusFilter =
      !status || status === "all"
        ? undefined
        : status === "done"
          ? { in: ["done", "cancelled"] }
          : { notIn: ["done", "cancelled"] };

    const tasks = await prisma.autoscuolaVoiceCallbackTask.findMany({
      where: {
        companyId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        student: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      success: true,
      data: tasks.map((t) => ({
        id: t.id,
        phoneNumber: t.phoneNumber,
        reason: t.reason,
        status: t.status,
        attemptCount: t.attemptCount,
        nextAttemptAt: t.nextAttemptAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        student: t.student
          ? { id: t.student.id, name: t.student.name, email: t.student.email, phone: t.student.phone }
          : null,
      })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function markVoiceCallbackTaskDone(taskId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    await prisma.autoscuolaVoiceCallbackTask.updateMany({
      where: { id: taskId, companyId: membership.companyId },
      data: { status: "done" },
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ─── Instructor weekly availability helpers ───────────────────────────────────

export async function getAutoscuolaInstructorWeeklyAvailabilities() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const availabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId: membership.companyId,
        ownerType: "instructor",
      },
    });
    const map: Record<string, { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }> }> =
      {};
    for (const availability of availabilities) {
      const ranges = Array.isArray(availability.ranges)
        ? (availability.ranges as Array<{ startMinutes: number; endMinutes: number }>)
        : undefined;
      map[availability.ownerId] = {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
        ...(ranges?.length ? { ranges } : {}),
      };
    }
    return { success: true as const, data: map };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const timeRangeSchema = z.object({
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
});

const setInstructorWeeklyAvailabilitySchema = z.object({
  instructorId: z.string().uuid(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startMinutes: z.number().int().min(0).max(1410),
  endMinutes: z.number().int().min(30).max(1440),
  ranges: z.array(timeRangeSchema).optional(),
});

export async function setAutoscuolaInstructorWeeklyAvailability(
  input: z.infer<typeof setInstructorWeeklyAvailabilitySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = setInstructorWeeklyAvailabilitySchema.parse(input);
    const companyId = membership.companyId;

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: payload.instructorId, companyId },
    });
    if (!instructor) {
      return { success: false as const, message: "Istruttore non trovato." };
    }

    const daysOfWeek = Array.from(new Set(payload.daysOfWeek)).sort((a, b) => a - b);
    if (!daysOfWeek.length) {
      return { success: false as const, message: "Seleziona almeno un giorno." };
    }
    if (payload.endMinutes <= payload.startMinutes) {
      return { success: false as const, message: "Intervallo orario non valido." };
    }

    const rangesJson = payload.ranges?.length
      ? payload.ranges
      : [{ startMinutes: payload.startMinutes, endMinutes: payload.endMinutes }];

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId,
          ownerType: "instructor",
          ownerId: payload.instructorId,
        },
      },
      update: { daysOfWeek, startMinutes: payload.startMinutes, endMinutes: payload.endMinutes, ranges: rangesJson },
      create: {
        companyId,
        ownerType: "instructor",
        ownerId: payload.instructorId,
        daysOfWeek,
        startMinutes: payload.startMinutes,
        endMinutes: payload.endMinutes,
        ranges: rangesJson,
      },
    });

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        instructorId: payload.instructorId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const, data: { daysOfWeek: availability.daysOfWeek, startMinutes: availability.startMinutes, endMinutes: availability.endMinutes } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteAutoscuolaInstructorWeeklyAvailability(instructorId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: instructorId, companyId },
    });
    if (!instructor) {
      return { success: false as const, message: "Istruttore non trovato." };
    }

    await prisma.autoscuolaWeeklyAvailability.deleteMany({
      where: { companyId, ownerType: "instructor", ownerId: instructorId },
    });

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        instructorId,
        startsAt: { gt: new Date() },
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

// ─── Vehicle weekly availability helpers ──────────────────────────────────────

export async function getAutoscuolaVehicleWeeklyAvailabilities() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const availabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
      where: {
        companyId: membership.companyId,
        ownerType: "vehicle",
      },
    });
    const map: Record<string, { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }> }> =
      {};
    for (const availability of availabilities) {
      const ranges = Array.isArray(availability.ranges)
        ? (availability.ranges as Array<{ startMinutes: number; endMinutes: number }>)
        : undefined;
      map[availability.ownerId] = {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
        ...(ranges?.length ? { ranges } : {}),
      };
    }
    return { success: true as const, data: map };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const setVehicleWeeklyAvailabilitySchema = z.object({
  vehicleId: z.string().uuid(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startMinutes: z.number().int().min(0).max(1410),
  endMinutes: z.number().int().min(30).max(1440),
  ranges: z.array(timeRangeSchema).optional(),
});

export async function setAutoscuolaVehicleWeeklyAvailability(
  input: z.infer<typeof setVehicleWeeklyAvailabilitySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = setVehicleWeeklyAvailabilitySchema.parse(input);
    const companyId = membership.companyId;

    const vehicle = await prisma.autoscuolaVehicle.findFirst({
      where: { id: payload.vehicleId, companyId },
    });
    if (!vehicle) {
      return { success: false as const, message: "Veicolo non trovato." };
    }

    const daysOfWeek = Array.from(new Set(payload.daysOfWeek)).sort((a, b) => a - b);
    if (!daysOfWeek.length) {
      return { success: false as const, message: "Seleziona almeno un giorno." };
    }
    if (payload.endMinutes <= payload.startMinutes) {
      return { success: false as const, message: "Intervallo orario non valido." };
    }

    const rangesJson = payload.ranges?.length
      ? payload.ranges
      : [{ startMinutes: payload.startMinutes, endMinutes: payload.endMinutes }];

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId,
          ownerType: "vehicle",
          ownerId: payload.vehicleId,
        },
      },
      update: { daysOfWeek, startMinutes: payload.startMinutes, endMinutes: payload.endMinutes, ranges: rangesJson },
      create: {
        companyId,
        ownerType: "vehicle",
        ownerId: payload.vehicleId,
        daysOfWeek,
        startMinutes: payload.startMinutes,
        endMinutes: payload.endMinutes,
        ranges: rangesJson,
      },
    });

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        vehicleId: payload.vehicleId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    return { success: true as const, data: { daysOfWeek: availability.daysOfWeek, startMinutes: availability.startMinutes, endMinutes: availability.endMinutes } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteAutoscuolaVehicleWeeklyAvailability(vehicleId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const vehicle = await prisma.autoscuolaVehicle.findFirst({
      where: { id: vehicleId, companyId },
    });
    if (!vehicle) {
      return { success: false as const, message: "Veicolo non trovato." };
    }

    await prisma.autoscuolaWeeklyAvailability.deleteMany({
      where: { companyId, ownerType: "vehicle", ownerId: vehicleId },
    });

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        vehicleId,
        startsAt: { gt: new Date() },
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

// ─── Test receipt helpers ─────────────────────────────────────────────────────

export async function getAutoscuolaStudentsList() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const members = await prisma.companyMember.findMany({
      where: { companyId: membership.companyId, role: { not: "admin" } },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return {
      success: true as const,
      data: members
        .filter((m) => m.user != null)
        .map((m) => ({
          id: m.user!.id,
          name: m.user!.name ?? m.user!.email ?? "Senza nome",
          email: m.user!.email ?? "",
        })),
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const generateTestPaymentReceiptSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(9999),
  lessonType: z.string().min(1).max(50).default("urbano"),
});

export async function generateTestPaymentReceipt(
  input: z.infer<typeof generateTestPaymentReceiptSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = generateTestPaymentReceiptSchema.parse(input);
    const companyId = membership.companyId;

    const [student, company] = await Promise.all([
      prisma.user.findFirst({
        where: { id: payload.studentId },
        select: { name: true, email: true },
      }),
      prisma.company.findFirst({
        where: { id: companyId },
        select: { name: true },
      }),
    ]);

    if (!student) throw new Error("Allievo non trovato.");
    if (!company) throw new Error("Autoscuola non trovata.");

    const startsAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const appointmentId = randomUUID();

    // Create a test appointment so the student sees it in the mobile app
    await prisma.$transaction(async (tx) => {
      await tx.autoscuolaAppointment.create({
        data: {
          id: appointmentId,
          companyId,
          studentId: payload.studentId,
          type: payload.lessonType,
          startsAt,
          endsAt,
          status: "completed",
          paymentRequired: true,
          paymentStatus: "paid",
          priceAmount: payload.amount,
          penaltyAmount: 0,
          paidAmount: payload.amount,
          invoiceStatus: "issued_stripe",
          notes: "[TEST] Ricevuta di prova generata dall'admin",
        },
      });
      await tx.autoscuolaAppointmentPayment.create({
        data: {
          companyId,
          studentId: payload.studentId,
          appointmentId,
          phase: "settlement",       // mapped to "Saldo" in the mobile app
          status: "succeeded",
          amount: payload.amount,    // Decimal in EUR, not cents
          paidAt: new Date(),
        },
      });
    });

    const receiptUrl = await generateAndUploadReceipt({
      appointmentId,
      companyName: company.name,
      studentName: student.name ?? student.email ?? "Studente",
      studentEmail: student.email ?? "",
      lessonType: payload.lessonType,
      startsAt,
      paidAmount: payload.amount,
      paidAt: new Date(),
    });

    return { success: true as const, data: { receiptUrl, appointmentId } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function getCompanyInviteCode() {
  try {
    const { activeCompanyId } = await requireServiceAccess("AUTOSCUOLE");
    const company = await prisma.company.findUnique({
      where: { id: activeCompanyId },
      select: { inviteCode: true },
    });
    return { success: true as const, data: company?.inviteCode ?? null };
  } catch (error) {
    return { success: false as const, message: formatError(error), data: null };
  }
}

// ─── Instructor Blocks ──────────────────────────────────────────────────────

const createInstructorBlockSchema = z.object({
  instructorId: z.string().uuid().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  reason: z.string().optional(),
  recurring: z.boolean().optional(),
  recurringWeeks: z.number().int().min(2).max(52).optional(),
});

export async function createInstructorBlock(
  input: z.infer<typeof createInstructorBlockSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = createInstructorBlockSchema.parse(input);
    const isOwnerOrAdmin = membership.role === "admin" || membership.autoscuolaRole === "OWNER";

    let resolvedInstructorId = payload.instructorId;

    if (!resolvedInstructorId) {
      // Instructor creating block for themselves
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: {
          companyId: membership.companyId,
          userId: membership.userId,
          status: { not: "inactive" },
        },
        select: { id: true },
      });
      if (!instructor) {
        return { success: false as const, message: "Profilo istruttore non trovato." };
      }
      resolvedInstructorId = instructor.id;
    } else if (!isOwnerOrAdmin) {
      return { success: false as const, message: "Solo il titolare può creare blocchi per altri istruttori." };
    }

    // Verify the instructor exists in this company
    const targetInstructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: resolvedInstructorId, companyId: membership.companyId, status: { not: "inactive" } },
      select: { id: true },
    });
    if (!targetInstructor) {
      return { success: false as const, message: "Istruttore non trovato." };
    }

    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);
    const weeks = payload.recurring ? Math.min(52, payload.recurringWeeks ?? 12) : 1;
    const recurrenceGroupId = payload.recurring ? randomUUID() : null;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const blocks = await prisma.$transaction(
      Array.from({ length: weeks }, (_, i) =>
        prisma.autoscuolaInstructorBlock.create({
          data: {
            companyId: membership.companyId,
            instructorId: targetInstructor.id,
            startsAt: new Date(startsAt.getTime() + i * WEEK_MS),
            endsAt: new Date(endsAt.getTime() + i * WEEK_MS),
            reason: payload.reason ?? null,
            recurrenceGroupId,
          },
        }),
      ),
    );

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: blocks[0], count: blocks.length };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteInstructorBlock(blockId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const isOwnerOrAdmin = membership.role === "admin" || membership.autoscuolaRole === "OWNER";

    const block = await prisma.autoscuolaInstructorBlock.findFirst({
      where: {
        id: blockId,
        companyId: membership.companyId,
      },
    });

    if (!block) {
      return { success: false as const, message: "Blocco non trovato." };
    }

    // Instructors can only delete their own blocks
    if (!isOwnerOrAdmin) {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId: membership.companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instructor || block.instructorId !== instructor.id) {
        return { success: false as const, message: "Non puoi eliminare blocchi di altri istruttori." };
      }
    }

    await prisma.autoscuolaInstructorBlock.delete({
      where: { id: blockId },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: { deleted: true } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteInstructorBlockRecurrence(recurrenceGroupId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const result = await prisma.autoscuolaInstructorBlock.deleteMany({
      where: {
        companyId: membership.companyId,
        recurrenceGroupId,
        startsAt: { gte: new Date() },
      },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: { deleted: result.count } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Booking block management
// ---------------------------------------------------------------------------

const toggleStudentBookingBlockSchema = z.object({
  studentId: z.string().uuid(),
  blocked: z.boolean(),
});

export async function toggleStudentBookingBlock(
  input: z.infer<typeof toggleStudentBookingBlockSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = toggleStudentBookingBlockSchema.parse(input);

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { bookingBlocked: payload.blocked },
    });

    return {
      success: true,
      data: { bookingBlocked: payload.blocked },
      message: payload.blocked
        ? "Prenotazioni bloccate per l'allievo."
        : "Prenotazioni riattivate per l'allievo.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Exam events
// ---------------------------------------------------------------------------

const createExamEventSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  instructorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function createExamEvent(
  input: z.infer<typeof createExamEventSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Solo il titolare può creare esami." };
    }
    const payload = createExamEventSchema.parse(input);
    const companyId = membership.companyId;
    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return { success: false as const, message: "Orario non valido." };
    }

    // Validate instructor if provided
    if (payload.instructorId) {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { id: payload.instructorId, companyId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Istruttore non trovato." };
    }

    // Validate all students belong to this company
    const members = await prisma.companyMember.findMany({
      where: { companyId, userId: { in: payload.studentIds }, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    const validIds = new Set(members.map((m) => m.userId));
    const invalidIds = payload.studentIds.filter((id) => !validIds.has(id));
    if (invalidIds.length) {
      return { success: false as const, message: `${invalidIds.length} allievi non trovati.` };
    }

    // Create one appointment per student
    const appointments = await prisma.$transaction(
      payload.studentIds.map((studentId) =>
        prisma.autoscuolaAppointment.create({
          data: {
            companyId,
            studentId,
            type: "esame",
            startsAt,
            endsAt,
            status: "scheduled",
            instructorId: payload.instructorId ?? null,
            vehicleId: null,
            notes: payload.notes ?? null,
            paymentRequired: false,
          },
        }),
      ),
    );

    await invalidateAgendaAndPaymentsCache(companyId);

    return { success: true as const, data: { count: appointments.length } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const addExamStudentSchema = z.object({
  studentId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  instructorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function addExamStudent(
  input: z.infer<typeof addExamStudentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = addExamStudentSchema.parse(input);
    const companyId = membership.companyId;

    const member = await prisma.companyMember.findFirst({
      where: { companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    if (!member) return { success: false as const, message: "Allievo non trovato." };

    const appointment = await prisma.autoscuolaAppointment.create({
      data: {
        companyId,
        studentId: payload.studentId,
        type: "esame",
        startsAt: new Date(payload.startsAt),
        endsAt: new Date(payload.endsAt),
        status: "scheduled",
        instructorId: payload.instructorId ?? null,
        vehicleId: null,
        notes: payload.notes ?? null,
        paymentRequired: false,
      },
    });

    await invalidateAgendaAndPaymentsCache(companyId);
    return { success: true as const, data: { appointmentId: appointment.id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function removeExamStudent(appointmentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const appt = await prisma.autoscuolaAppointment.findFirst({
      where: { id: appointmentId, companyId: membership.companyId, type: "esame" },
      select: { id: true },
    });
    if (!appt) return { success: false as const, message: "Appuntamento esame non trovato." };

    await prisma.autoscuolaAppointment.delete({ where: { id: appointmentId } });
    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updateExamEventSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1),
  instructorId: z.string().uuid().optional().nullable(),
});

export async function updateExamInstructor(
  input: z.infer<typeof updateExamEventSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = updateExamEventSchema.parse(input);

    await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: payload.appointmentIds }, companyId: membership.companyId, type: "esame" },
      data: { instructorId: payload.instructorId ?? null },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function cancelExamEvent(appointmentIds: string[]) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }

    await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: appointmentIds }, companyId: membership.companyId, type: "esame" },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Weekly booking limit exemption
// ---------------------------------------------------------------------------

const toggleWeeklyBookingLimitExemptSchema = z.object({
  studentId: z.string().uuid(),
  exempt: z.boolean(),
});

export async function toggleWeeklyBookingLimitExempt(
  input: z.infer<typeof toggleWeeklyBookingLimitExemptSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = toggleWeeklyBookingLimitExemptSchema.parse(input);

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { weeklyBookingLimitExempt: payload.exempt },
    });

    return {
      success: true,
      data: { weeklyBookingLimitExempt: payload.exempt },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Exam priority override
// ---------------------------------------------------------------------------

const setExamPriorityOverrideSchema = z.object({
  studentId: z.string().uuid(),
  override: z.boolean().nullable(),
});

export async function setExamPriorityOverride(
  input: z.infer<typeof setExamPriorityOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = setExamPriorityOverrideSchema.parse(input);

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { examPriorityOverride: payload.override },
    });

    return {
      success: true,
      data: { examPriorityOverride: payload.override },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Manual payment tracking
// ---------------------------------------------------------------------------

const setManualPaymentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(["unpaid", "paid"]).nullable(),
});

export async function setManualPaymentStatus(
  input: z.infer<typeof setManualPaymentStatusSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = setManualPaymentStatusSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      select: { id: true, paymentRequired: true },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }
    if (appointment.paymentRequired) {
      return {
        success: false,
        message:
          "Questo appuntamento usa pagamenti automatici. Usa la sezione Pagamenti.",
      };
    }

    await prisma.autoscuolaAppointment.update({
      where: { id: payload.appointmentId },
      data: { manualPaymentStatus: payload.status },
    });

    return {
      success: true,
      data: { manualPaymentStatus: payload.status },
      message:
        payload.status === "paid"
          ? "Guida segnata come pagata."
          : payload.status === "unpaid"
            ? "Guida segnata come da pagare."
            : "Stato pagamento rimosso.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Payment mode helper
// ---------------------------------------------------------------------------

export async function getPaymentMode() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const config = await getAutoscuolaPaymentConfig({
      companyId: membership.companyId,
    });
    return {
      success: true,
      data: {
        autoPaymentsEnabled: config.enabled,
        lessonCreditFlowEnabled: config.lessonCreditFlowEnabled,
        lessonCreditsRequired: config.lessonCreditsRequired,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Late cancellations
// ---------------------------------------------------------------------------

export async function getLateCancellations() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const cancellations = await prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        startsAt: Date;
        cancelledAt: Date | null;
        createdAt: Date;
        penaltyCutoffAt: Date | null;
        studentId: string;
        studentName: string | null;
        instructorName: string | null;
        type: string;
        endsAt: Date | null;
      }>
    >`
      SELECT
        a.id,
        a.status,
        a."startsAt",
        a."cancelledAt",
        a."createdAt",
        a."penaltyCutoffAt",
        a."studentId",
        u.name AS "studentName",
        i.name AS "instructorName",
        a.type,
        a."endsAt"
      FROM "AutoscuolaAppointment" a
      JOIN "User" u ON u.id = a."studentId"
      LEFT JOIN "AutoscuolaInstructor" i ON i.id = a."instructorId"
      WHERE a."companyId" = ${companyId}::uuid
        AND a."lateCancellationAction" IS NULL
        AND (
          -- Late cancellations
          (a.status = 'cancelled'
           AND a."cancelledAt" IS NOT NULL
           AND a."penaltyCutoffAt" IS NOT NULL
           AND a."cancelledAt" > a."penaltyCutoffAt"
           AND a."cancellationKind" = 'manual_cancel')
          OR
          -- No-shows
          (a.status = 'no_show')
        )
      ORDER BY COALESCE(a."cancelledAt", a."startsAt") DESC
      LIMIT 200
    `;

    // Compute per-student late cancellation count (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const studentIds = [...new Set(cancellations.map((c) => c.studentId))];
    const lateCounts = new Map<string, number>();
    if (studentIds.length) {
      const counts = await prisma.$queryRaw<
        Array<{ studentId: string; cnt: bigint }>
      >`
        SELECT a."studentId", COUNT(*)::bigint AS cnt
        FROM "AutoscuolaAppointment" a
        WHERE a."companyId" = ${companyId}::uuid
          AND a."studentId" = ANY(${studentIds}::uuid[])
          AND (
            (a.status = 'cancelled'
             AND a."cancelledAt" IS NOT NULL
             AND a."penaltyCutoffAt" IS NOT NULL
             AND a."cancelledAt" > a."penaltyCutoffAt"
             AND a."cancellationKind" = 'manual_cancel'
             AND a."cancelledAt" >= ${fourWeeksAgo})
            OR
            (a.status = 'no_show'
             AND a."startsAt" >= ${fourWeeksAgo})
          )
        GROUP BY a."studentId"
      `;
      for (const row of counts) {
        lateCounts.set(row.studentId, Number(row.cnt));
      }
    }

    const config = await getAutoscuolaPaymentConfig({ companyId });

    const data = cancellations.map((c) => {
      const isNoShow = c.status === "no_show";
      const startsAt = new Date(c.startsAt);
      const cancelledAt = c.cancelledAt ? new Date(c.cancelledAt) : null;
      const endsAt = c.endsAt ? new Date(c.endsAt) : new Date(startsAt.getTime() + 30 * 60 * 1000);
      const durationMinutes = Math.max(
        30,
        Math.round((endsAt.getTime() - startsAt.getTime()) / 60000),
      );
      const timeDeltaMinutes = cancelledAt
        ? Math.round((startsAt.getTime() - cancelledAt.getTime()) / 60000)
        : null;
      return {
        id: c.id,
        kind: isNoShow ? ("no_show" as const) : ("late_cancellation" as const),
        startsAt: c.startsAt,
        cancelledAt: c.cancelledAt,
        createdAt: c.createdAt,
        timeDeltaMinutes,
        penaltyCutoffHours: config.penaltyCutoffHours,
        studentName: c.studentName,
        studentId: c.studentId,
        instructorName: c.instructorName,
        lessonType: c.type,
        durationMinutes,
        studentLateCancellationsCount: lateCounts.get(c.studentId) ?? 0,
      };
    });

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Resolve late cancellation
// ---------------------------------------------------------------------------

const resolveLateCancellationSchema = z.object({
  appointmentId: z.string().uuid(),
  action: z.enum(["charge", "dismiss"]),
});

export async function resolveLateCancellation(
  input: z.infer<typeof resolveLateCancellationSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = resolveLateCancellationSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: {
        id: payload.appointmentId,
        companyId: membership.companyId,
        status: { in: ["cancelled", "no_show"] },
        lateCancellationAction: null,
      },
      select: {
        id: true,
        studentId: true,
        creditApplied: true,
        creditRefundedAt: true,
      },
    });
    if (!appointment) {
      return { success: false, message: "Cancellazione non trovata o già gestita." };
    }

    if (payload.action === "dismiss") {
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: { lateCancellationAction: "dismissed" },
      });
      return {
        success: true,
        data: { action: "dismissed" },
        message: "Cancellazione tardiva archiviata senza addebito.",
      };
    }

    // action === "charge"
    const config = await getAutoscuolaPaymentConfig({
      companyId: membership.companyId,
    });

    if (config.enabled) {
      // TODO: implementare addebito Stripe per cancellazioni tardive
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: { lateCancellationAction: "charged" },
      });
    } else if (config.lessonCreditFlowEnabled) {
      // Credit flow: re-deduct 1 credit if it was refunded
      if (
        appointment.creditApplied &&
        appointment.creditRefundedAt !== null
      ) {
        await adjustStudentLessonCredits({
          companyId: membership.companyId,
          studentId: appointment.studentId,
          delta: -1,
          reason: "manual_revoke",
          actorUserId: membership.userId,
          appointmentId: appointment.id,
        });
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { lateCancellationAction: "charged" },
        });
      } else if (!appointment.creditApplied) {
        // Optional credits flow: try to consume a credit for this late cancellation
        const applied = await applyLessonCreditToExistingAppointment({
          appointmentId: appointment.id,
          actorUserId: membership.userId,
        });
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: {
            lateCancellationAction: "charged",
            ...(applied.applied ? {} : { manualPaymentStatus: "unpaid" }),
          },
        });
      } else {
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { lateCancellationAction: "charged" },
        });
      }
    } else {
      // Manual mode: mark as unpaid for the student
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          lateCancellationAction: "charged",
          manualPaymentStatus: "unpaid",
        },
      });
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return {
      success: true,
      data: { action: "charged" },
      message: "Cancellazione tardiva addebitata.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
