"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { notifyAutoscuolaCaseStatusChange } from "@/lib/autoscuole/communications";

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
  instructorName: z.string().optional(),
  notes: z.string().optional(),
});

const updateCaseStatusSchema = z.object({
  caseId: z.string().uuid(),
  status: z.string().min(1),
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
      prisma.autoscuolaStudent.count({ where: { companyId } }),
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

export async function getAutoscuolaStudents(search?: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const query = search?.trim();

    const students = await prisma.autoscuolaStudent.findMany({
      where: {
        companyId,
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: students };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaStudent(input: z.infer<typeof createStudentSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createStudentSchema.parse(input);

    const student = await prisma.autoscuolaStudent.create({
      data: {
        companyId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email || null,
        phone: payload.phone || null,
        status: payload.status ?? "active",
        notes: payload.notes,
      },
    });

    return { success: true, data: student };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function importAutoscuolaStudents(input: z.infer<typeof importStudentsSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = importStudentsSchema.parse(input);

    if (!payload.rows.length) {
      return { success: false, message: "Nessuna riga valida da importare." };
    }

    const data = payload.rows.map((row) => ({
      companyId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email || null,
      phone: row.phone || null,
      status: row.status ?? "active",
      notes: row.notes ?? null,
    }));

    const created = await prisma.autoscuolaStudent.createMany({
      data,
    });

    return { success: true, data: { count: created.count } };
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
        student: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: cases };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaCase(input: z.infer<typeof createCaseSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createCaseSchema.parse(input);

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
        student: true,
        case: true,
      },
      orderBy: { startsAt: "asc" },
    });

    return { success: true, data: appointments };
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

    const appointment = await prisma.autoscuolaAppointment.create({
      data: {
        companyId,
        studentId: payload.studentId,
        caseId: payload.caseId || null,
        type: payload.type,
        startsAt: new Date(payload.startsAt),
        endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
        status: payload.status ?? "scheduled",
        instructorName: payload.instructorName ?? null,
        notes: payload.notes ?? null,
      },
    });

    return { success: true, data: appointment };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
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
      include: { student: true },
    });

    await notifyAutoscuolaCaseStatusChange({
      companyId: membership.companyId,
      caseId: updated.id,
      status: updated.status,
      student: {
        id: updated.student.id,
        firstName: updated.student.firstName,
        lastName: updated.student.lastName,
        email: updated.student.email,
        phone: updated.student.phone,
      },
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
