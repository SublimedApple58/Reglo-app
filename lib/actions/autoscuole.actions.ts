"use server";

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { notifyAutoscuolaCaseStatusChange } from "@/lib/autoscuole/communications";
import { broadcastWaitlistOffer } from "@/lib/actions/autoscuole-availability.actions";

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
});

const updateCaseStatusSchema = z.object({
  caseId: z.string().uuid(),
  status: z.string().min(1),
});

const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
});

const updateAppointmentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.string().min(1),
});

const createInstructorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
});

const createVehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
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
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });

    const items = cases.flatMap((item) => {
      const deadlines = [
        { type: "PINK_SHEET_EXPIRES", date: item.pinkSheetExpiresAt },
        { type: "MEDICAL_EXPIRES", date: item.medicalExpiresAt },
      ].filter((entry) => entry.date);

      return deadlines.map((entry) => {
        const deadlineDate = entry.date as Date;
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
          studentName: `${item.student.firstName} ${item.student.lastName}`,
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
        instructor: true,
        vehicle: true,
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

    const [instructor, vehicle] = await Promise.all([
      prisma.autoscuolaInstructor.findFirst({
        where: { id: payload.instructorId, companyId },
      }),
      prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId },
      }),
    ]);

    if (!instructor || !vehicle) {
      return {
        success: false,
        message: "Seleziona istruttore e veicolo validi.",
      };
    }

    const slotTime = new Date(payload.startsAt);
    const conflict = await prisma.autoscuolaAppointment.findFirst({
      where: {
        companyId,
        startsAt: slotTime,
        status: { notIn: ["cancelled"] },
        OR: [
          { instructorId: payload.instructorId },
          { vehicleId: payload.vehicleId },
        ],
      },
    });
    if (conflict) {
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
        endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
        status: payload.status ?? "scheduled",
        instructorId: payload.instructorId,
        vehicleId: payload.vehicleId,
        notes: payload.notes ?? null,
      },
    });

    return { success: true, data: appointment };
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

      await prisma.autoscuolaAvailabilitySlot.updateMany({
        where: {
          companyId: membership.companyId,
          startsAt: appointment.startsAt,
          status: "booked",
        },
        data: { status: "open" },
      });

      await broadcastWaitlistOffer({
        companyId: membership.companyId,
        slotId: appointment.slotId,
        startsAt: appointment.startsAt,
        expiresAt,
      });

      return {
        success: true,
        data: { rescheduled: false, broadcasted: true },
      };
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

export async function updateAutoscuolaAppointmentStatus(
  input: z.infer<typeof updateAppointmentStatusSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateAppointmentStatusSchema.parse(input);

    const updated = await prisma.autoscuolaAppointment.update({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      data: { status: payload.status },
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

    const instructors = await prisma.autoscuolaInstructor.findMany({
      where: { companyId },
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

    const instructor = await prisma.autoscuolaInstructor.create({
      data: {
        companyId,
        name: payload.name,
        phone: payload.phone || null,
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
