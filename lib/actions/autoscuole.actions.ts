"use server";

import { randomUUID } from "crypto";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { notifyAutoscuolaCaseStatusChange } from "@/lib/autoscuole/communications";
import { broadcastWaitlistOffer } from "@/lib/actions/autoscuole-availability.actions";
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
  getStudentLessonCredits,
  prepareAppointmentPaymentSnapshot,
  refundLessonCreditIfEligible,
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
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  status: z.string().optional(),
  instructorId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  notes: z.string().optional(),
  sendProposal: z.boolean().optional().default(false),
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
});

const updateAppointmentDetailsSchema = z.object({
  appointmentId: z.string().uuid(),
  lessonType: z.string().optional(),
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
}: {
  companyId: string;
  actorUserId: string;
  appointment: {
    id: string;
    studentId: string;
    startsAt: Date;
    instructorId: string | null;
  };
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
    timeZone: "Europe/Rome",
  });
  const timeLabel = appointment.startsAt.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = "Reglo Autoscuole · Guida annullata";
  const body = `La guida del ${dateLabel} alle ${timeLabel}${
    instructor?.name ? ` con ${instructor.name}` : ""
  } e stata annullata dall'autoscuola.`;

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

    const [
      studentsCount,
      activeCasesCount,
      upcomingAppointmentsCount,
      overdueInstallmentsCount,
    ] = await Promise.all([
      prisma.companyMember.count({
        where: {
          companyId,
          autoscuolaRole: "STUDENT",
        },
      }),
      prisma.autoscuolaCase.count({
        where: { companyId, status: { not: "archived" } },
      }),
      prisma.autoscuolaAppointment.count({
        where: {
          companyId,
          startsAt: { gte: now, lte: inSevenDays },
        },
      }),
      prisma.autoscuolaPaymentInstallment.count({
        where: {
          plan: { companyId },
          status: { in: ["pending", "overdue"] },
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        studentsCount,
        activeCasesCount,
        upcomingAppointmentsCount,
        overdueInstallmentsCount,
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

    const [appointments, students, instructors, vehicles] = await Promise.all([
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
    const normalizedType = normalizeLessonType(lesson.type) || "altro";
    byLessonTypeMap.set(
      normalizedType,
      (byLessonTypeMap.get(normalizedType) ?? 0) + 1,
    );
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
      return {
        id: lesson.id,
        caseId: lesson.caseId,
        type: normalizeLessonType(lesson.type) || "altro",
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
        activeCase: register.activeCase,
        summary: register.summary,
      };
    });

    return { success: true, data: rows };
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
          status: true,
          startsAt: true,
          endsAt: true,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
        },
        orderBy: { startsAt: "desc" },
      }),
    ]);

    const register = buildDrivingRegisterData({ cases, lessons });
    const student = toStudentProfile(studentMembership.user, studentMembership.createdAt);

    return {
      success: true,
      data: {
        student,
        activeCase: register.activeCase,
        summary: register.summary,
        byLessonType: register.byLessonType,
        lessons: register.lessons,
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

    const shouldSendProposal = payload.sendProposal || isInstructorActor;
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

    if (lessonPolicy.lessonPolicyEnabled && !requestedType) {
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
    const resolvedType = requestedType || "guida";

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
      const selectedPolicyType = isLessonPolicyType(resolvedType) ? resolvedType : null;
      if (
        coverage.missingRequiredTypes.length &&
        (!selectedPolicyType || !coverage.missingRequiredTypes.includes(selectedPolicyType))
      ) {
        warnings.push(
          `Tipo guida non prioritario rispetto ai tipi ancora mancanti (${formatLessonTypesList(
            coverage.missingRequiredTypes,
          )}).`,
        );
      }
    }
    if (
      lessonPolicy.lessonPolicyEnabled &&
      isLessonPolicyType(resolvedType) &&
      !isLessonTypeAllowedForInterval({
        policy: lessonPolicy,
        lessonType: resolvedType,
        startsAt: slotTime,
        endsAt: slotEnd,
      })
    ) {
      warnings.push("Il tipo guida selezionato è fuori dalla finestra configurata.");
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
    if (hasConflict) {
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
            type: resolvedType,
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
        },
      });
    });

    await invalidateAgendaAndPaymentsCache(companyId);

    if (!shouldSendProposal) {
      return {
        success: true,
        data: appointment,
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
      data: appointment,
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

    const cancelledByAutoscuola =
      membership.role === "admin" ||
      membership.autoscuolaRole === "OWNER" ||
      membership.autoscuolaRole === "INSTRUCTOR";

    await refundLessonCreditIfEligible({
      appointmentId: appointment.id,
      cancelledByAutoscuola,
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

    const canAutoReschedule =
      membership.role === "admin" ||
      membership.autoscuolaRole === "OWNER" ||
      membership.autoscuolaRole === "INSTRUCTOR";

    if (!canAutoReschedule || appointment.status === "proposal") {
      await invalidateAgendaAndPaymentsCache(membership.companyId);
      return { success: true, data: { rescheduled: false } };
    }

    const slotMinutes = 30;
    const startHour = 7;
    const endHour = 21;
    const scanStart = new Date(appointment.startsAt);
    scanStart.setMinutes(scanStart.getMinutes() + slotMinutes);
    const scanEnd = new Date(appointment.startsAt);
    scanEnd.setDate(scanEnd.getDate() + 7);

    const [existing, instructors, vehicles] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          startsAt: { gte: scanStart, lte: scanEnd },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.autoscuolaInstructor.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        orderBy: { name: "asc" },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: membership.companyId, status: { not: "inactive" } },
        orderBy: { name: "asc" },
      }),
    ]);

    if (!instructors.length || !vehicles.length) {
      await invalidateAgendaAndPaymentsCache(membership.companyId);
      return { success: true, data: { rescheduled: false } };
    }

    const busy = new Map<
      string,
      { instructors: Set<string>; vehicles: Set<string> }
    >();
    for (const item of existing) {
      const key = slotKey(item.startsAt);
      const entry =
        busy.get(key) ?? { instructors: new Set<string>(), vehicles: new Set<string>() };
      if (item.instructorId) entry.instructors.add(item.instructorId);
      if (item.vehicleId) entry.vehicles.add(item.vehicleId);
      busy.set(key, entry);
    }

    let newStartsAt: Date | null = null;
    let newInstructorId: string | null = null;
    let newVehicleId: string | null = null;
    for (let day = new Date(scanStart); day <= scanEnd; day.setDate(day.getDate() + 1)) {
      for (let hour = startHour; hour < endHour; hour += 1) {
        for (let minutes = 0; minutes < 60; minutes += slotMinutes) {
          const candidate = new Date(day);
          candidate.setHours(hour, minutes, 0, 0);
          if (candidate <= scanStart) continue;
          if (candidate > scanEnd) break;
          const key = slotKey(candidate);
          const occupied = busy.get(key);
          const busyInstructors = occupied?.instructors ?? new Set<string>();
          const busyVehicles = occupied?.vehicles ?? new Set<string>();
          const availableInstructor = instructors.find(
            (item) => !busyInstructors.has(item.id),
          );
          if (!availableInstructor) continue;
          const availableVehicle = vehicles.find(
            (item) => !busyVehicles.has(item.id),
          );
          if (!availableVehicle) continue;
          newStartsAt = candidate;
          newInstructorId = availableInstructor.id;
          newVehicleId = availableVehicle.id;
          break;
        }
        if (newStartsAt) break;
      }
      if (newStartsAt) break;
    }

    if (!newStartsAt || !newInstructorId || !newVehicleId) {
      await invalidateAgendaAndPaymentsCache(membership.companyId);
      return { success: true, data: { rescheduled: false } };
    }

    const originalDurationMs = Math.max(
      30 * 60 * 1000,
      (appointment.endsAt?.getTime() ?? appointment.startsAt.getTime() + 30 * 60 * 1000) -
        appointment.startsAt.getTime(),
    );
    const newEndsAt = new Date(newStartsAt.getTime() + originalDurationMs);
    const newAppointmentId = randomUUID();
    await prisma.$transaction(async (tx) => {
      const paymentSnapshot = await prepareAppointmentPaymentSnapshot({
        prisma: tx as never,
        companyId: membership.companyId,
        studentId: appointment.studentId,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
        appointmentId: newAppointmentId,
        actorUserId: membership.userId,
      });

      await tx.autoscuolaAppointment.create({
        data: {
          id: newAppointmentId,
          companyId: membership.companyId,
          studentId: appointment.studentId,
          caseId: appointment.caseId,
          type: appointment.type,
          startsAt: newStartsAt,
          endsAt: newEndsAt,
          status: "scheduled",
          instructorId: newInstructorId,
          vehicleId: newVehicleId,
          notes: appointment.notes,
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

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return {
      success: true,
      data: { rescheduled: true, newStartsAt },
    };
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
      if (!isWithinInstructorStatusWindow(appointment, now)) {
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

    if (nextStatus === "checked_in") {
      const resolvedLessonType = requestedLessonType || appointmentLessonType;
      if (!resolvedLessonType || !LESSON_TYPE_SET.has(resolvedLessonType)) {
        return {
          success: false,
          message: "Seleziona un tipo guida valido.",
        };
      }
      if (!isInstructorTypeAllowed(resolvedLessonType)) {
        return {
          success: false,
          message: `Seleziona un tipo guida compatibile (${formatLessonTypesList(
            compatibleMissingTypes,
          )}).`,
        };
      }
      updateData.type = resolvedLessonType;
    } else if (nextStatus === "no_show" && requestedLessonType) {
      if (!LESSON_TYPE_SET.has(requestedLessonType)) {
        return {
          success: false,
          message: "Tipo guida non valido.",
        };
      }
      if (!isInstructorTypeAllowed(requestedLessonType)) {
        return {
          success: false,
          message: `Tipo guida non compatibile (${formatLessonTypesList(
            compatibleMissingTypes,
          )}).`,
        };
      }
      updateData.type = requestedLessonType;
    } else if (
      payload.lessonType &&
      requestedLessonType &&
      LESSON_TYPE_SET.has(requestedLessonType)
    ) {
      if (!isInstructorTypeAllowed(requestedLessonType)) {
        return {
          success: false,
          message: `Tipo guida non compatibile (${formatLessonTypesList(
            compatibleMissingTypes,
          )}).`,
        };
      }
      updateData.type = requestedLessonType;
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

    const updateData: { type?: string; notes?: string | null } = {};
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

    if (payload.lessonType !== undefined) {
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
    const map: Record<string, { daysOfWeek: number[]; startMinutes: number; endMinutes: number }> =
      {};
    for (const availability of availabilities) {
      map[availability.ownerId] = {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
      };
    }
    return { success: true as const, data: map };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const setInstructorWeeklyAvailabilitySchema = z.object({
  instructorId: z.string().uuid(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startMinutes: z.number().int().min(0).max(1410),
  endMinutes: z.number().int().min(30).max(1440),
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

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId,
          ownerType: "instructor",
          ownerId: payload.instructorId,
        },
      },
      update: { daysOfWeek, startMinutes: payload.startMinutes, endMinutes: payload.endMinutes },
      create: {
        companyId,
        ownerType: "instructor",
        ownerId: payload.instructorId,
        daysOfWeek,
        startMinutes: payload.startMinutes,
        endMinutes: payload.endMinutes,
      },
    });

    // Reposition appointments now outside the new availability window
    const SLOT_MINUTES = 30;
    const futureAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        instructorId: payload.instructorId,
        startsAt: { gt: new Date() },
        status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    const impactedIds = futureAppointments
      .filter((appointment) => {
        const end =
          appointment.endsAt ??
          new Date(appointment.startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
        const aptDayOfWeek = appointment.startsAt.getDay();
        if (!daysOfWeek.includes(aptDayOfWeek)) return true;
        const aptStartMinutes = appointment.startsAt.getHours() * 60 + appointment.startsAt.getMinutes();
        const aptEndMinutes = end.getHours() * 60 + end.getMinutes();
        return aptStartMinutes < payload.startMinutes || aptEndMinutes > payload.endMinutes;
      })
      .map((a) => a.id);

    if (impactedIds.length) {
      await cancelAndQueueOperationalRepositionByResource({
        companyId,
        appointmentIds: impactedIds,
        reason: "availability_changed",
        actorUserId: membership.userId,
      });
    }

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

    const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        instructorId,
        startsAt: { gt: new Date() },
        status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
      },
      select: { id: true },
    });

    if (impactedAppointments.length) {
      await cancelAndQueueOperationalRepositionByResource({
        companyId,
        appointmentIds: impactedAppointments.map((a) => a.id),
        reason: "availability_changed",
        actorUserId: membership.userId,
      });
    }

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
    const map: Record<string, { daysOfWeek: number[]; startMinutes: number; endMinutes: number }> =
      {};
    for (const availability of availabilities) {
      map[availability.ownerId] = {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
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

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId,
          ownerType: "vehicle",
          ownerId: payload.vehicleId,
        },
      },
      update: { daysOfWeek, startMinutes: payload.startMinutes, endMinutes: payload.endMinutes },
      create: {
        companyId,
        ownerType: "vehicle",
        ownerId: payload.vehicleId,
        daysOfWeek,
        startMinutes: payload.startMinutes,
        endMinutes: payload.endMinutes,
      },
    });

    // Reposition appointments now outside the new availability window
    const futureAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        vehicleId: payload.vehicleId,
        startsAt: { gt: new Date() },
        status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    const SLOT_MINUTES = 30;
    const impactedIds = futureAppointments
      .filter((appointment) => {
        const end =
          appointment.endsAt ??
          new Date(appointment.startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
        const aptDayOfWeek = appointment.startsAt.getDay();
        if (!daysOfWeek.includes(aptDayOfWeek)) return true;
        const aptStartMinutes = appointment.startsAt.getHours() * 60 + appointment.startsAt.getMinutes();
        const aptEndMinutes = end.getHours() * 60 + end.getMinutes();
        return aptStartMinutes < payload.startMinutes || aptEndMinutes > payload.endMinutes;
      })
      .map((a) => a.id);

    if (impactedIds.length) {
      await cancelAndQueueOperationalRepositionByResource({
        companyId,
        appointmentIds: impactedIds,
        reason: "availability_changed",
        actorUserId: membership.userId,
      });
    }

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

    // Reposition all future appointments for this vehicle
    const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        vehicleId,
        startsAt: { gt: new Date() },
        status: { in: [...OPERATIONAL_REPOSITIONABLE_STATUSES] },
      },
      select: { id: true },
    });

    if (impactedAppointments.length) {
      await cancelAndQueueOperationalRepositionByResource({
        companyId,
        appointmentIds: impactedAppointments.map((a) => a.id),
        reason: "availability_changed",
        actorUserId: membership.userId,
      });
    }

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
