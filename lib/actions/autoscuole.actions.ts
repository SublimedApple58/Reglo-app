"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { notifyAutoscuolaCaseStatusChange } from "@/lib/autoscuole/communications";
import { broadcastWaitlistOffer } from "@/lib/actions/autoscuole-availability.actions";
import { getOrCreateInstructorForUser } from "@/lib/autoscuole/instructors";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";

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
  type: z.string().min(1),
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

const REQUIRED_LESSONS_COUNT = 10;
const LESSON_TYPE_OPTIONS = [
  "manovre",
  "urbano",
  "extraurbano",
  "notturna",
  "autostrada",
  "parcheggio",
  "altro",
  "guida",
] as const;
const LESSON_TYPE_SET = new Set<string>(LESSON_TYPE_OPTIONS);
const INSTRUCTOR_ALLOWED_STATUSES = new Set(["checked_in", "no_show"]);
const DRIVING_LESSON_EXCLUDED_TYPES = new Set(["esame"]);

const normalizeStatus = (value: string) => value.trim().toLowerCase();
const normalizeLessonType = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();
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

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();
const normalizeEmail = (value: string | null | undefined) =>
  normalizeText(value).toLowerCase();

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

const listDirectoryStudents = async (companyId: string) => {
  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
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
    orderBy: { createdAt: "desc" },
  });

  return members.map((member) => toStudentProfile(member.user, member.createdAt));
};

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
    const students = (await listDirectoryStudents(companyId)).filter((student) =>
      matchesStudentQuery(student, search),
    );
    return { success: true, data: students };
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

  const scopedDrivingLessons = activeCase
    ? drivingLessons.filter((lesson) => lesson.caseId === activeCase.id)
    : drivingLessons;

  const completedLessons = scopedDrivingLessons.filter(
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
    const students = (await listDirectoryStudents(companyId)).filter((student) =>
      matchesStudentQuery(student, search),
    );
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
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const appointments = await prisma.autoscuolaAppointment.findMany({
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
        case: true,
        instructor: true,
        vehicle: true,
      },
      orderBy: { startsAt: "asc" },
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

export async function createAutoscuolaAppointment(
  input: z.infer<typeof createAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createAppointmentSchema.parse(input);

    const [student, instructor, vehicle] = await Promise.all([
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
        where: { id: payload.instructorId, companyId },
      }),
      prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId },
      }),
    ]);

    if (!student || !instructor || !vehicle) {
      return {
        success: false,
        message: "Seleziona allievo, istruttore e veicolo validi.",
      };
    }

    const slotTime = new Date(payload.startsAt);
    if (Number.isNaN(slotTime.getTime())) {
      return { success: false, message: "Orario di inizio non valido." };
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
          { instructorId: payload.instructorId },
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

    const appointment = await prisma.autoscuolaAppointment.create({
      data: {
        companyId,
        studentId: payload.studentId,
        caseId: payload.caseId || null,
        type: payload.type,
        startsAt: slotTime,
        endsAt: slotEnd,
        status: payload.status ?? (payload.sendProposal ? "proposal" : "scheduled"),
        instructorId: payload.instructorId,
        vehicleId: payload.vehicleId,
        notes: payload.notes ?? null,
      },
    });

    if (!payload.sendProposal) {
      return { success: true, data: appointment, message: "Appuntamento creato." };
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

    await prisma.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: { status: "cancelled" },
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
        excludeStudentIds: [appointment.studentId],
      });

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
      return { success: true, data: { rescheduled: false } };
    }

    await prisma.autoscuolaAppointment.create({
      data: {
        companyId: membership.companyId,
        studentId: appointment.studentId,
        caseId: appointment.caseId,
        type: appointment.type,
        startsAt: newStartsAt,
        status: "scheduled",
        instructorId: newInstructorId,
        vehicleId: newVehicleId,
        notes: appointment.notes,
      },
    });

    return {
      success: true,
      data: { rescheduled: true, newStartsAt },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteAutoscuolaAppointment(
  input: z.infer<typeof deleteAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin") {
      return {
        success: false,
        message: "Solo admin puo cancellare definitivamente un evento.",
      };
    }

    const payload = deleteAppointmentSchema.parse(input);
    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    if (appointment.slotId) {
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
        ownerFilters.push({
          ownerType: "vehicle",
          ownerId: appointment.vehicleId,
        });
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
    }

    await prisma.autoscuolaAppointment.delete({
      where: { id: appointment.id },
    });

    return {
      success: true,
      data: { deleted: true },
      message: "Evento cancellato definitivamente.",
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
    const updateData: { status: string; type?: string } = { status: nextStatus };

    if (nextStatus === "checked_in") {
      const resolvedLessonType = requestedLessonType || appointmentLessonType;
      if (!resolvedLessonType || !LESSON_TYPE_SET.has(resolvedLessonType)) {
        return {
          success: false,
          message: "Seleziona un tipo guida valido.",
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
      updateData.type = requestedLessonType;
    } else if (
      payload.lessonType &&
      requestedLessonType &&
      LESSON_TYPE_SET.has(requestedLessonType)
    ) {
      updateData.type = requestedLessonType;
    }

    const updated = await prisma.autoscuolaAppointment.update({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      data: updateData,
    });

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
      if (["cancelled", "completed", "no_show"].includes(appointmentStatus)) {
        return { success: false, message: "Guida non modificabile." };
      }
    }

    const updateData: { type?: string; notes?: string | null } = {};

    if (payload.lessonType !== undefined) {
      const normalizedLessonType = normalizeLessonType(payload.lessonType);
      if (!normalizedLessonType || !LESSON_TYPE_SET.has(normalizedLessonType)) {
        return { success: false, message: "Tipo guida non valido." };
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

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaInstructors() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const members = await prisma.companyMember.findMany({
      where: { companyId, autoscuolaRole: "INSTRUCTOR" },
      include: { user: true },
    });

    await Promise.all(
      members.map((member) => {
        const name =
          member.user?.name ??
          member.user?.email?.split("@")[0] ??
          "Istruttore";
        return getOrCreateInstructorForUser({
          companyId,
          userId: member.userId,
          name,
        });
      }),
    );

    const instructors = await prisma.autoscuolaInstructor.findMany({
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

    return { success: true, data: instructor };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getAutoscuolaVehicles() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const vehicles = await prisma.autoscuolaVehicle.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

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
