"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import { refundLessonCreditIfEligible } from "@/lib/autoscuole/payments";
import { isOwner } from "@/lib/autoscuole/roles";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";

const invalidateAgendaAndPaymentsCache = async (companyId: string) => {
  await invalidateAutoscuoleCache({
    companyId,
    segments: [
      AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
      AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
    ],
  });
};

// ─── Schemas ────────────────────────────────────────────────

const getHolidaysSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const createHolidaySchema = z.object({
  date: z.string().min(1),
  label: z.string().optional(),
  cancelAppointments: z.boolean(),
});

const deleteHolidaySchema = z.object({
  date: z.string().min(1),
});

// ─── Actions ────────────────────────────────────────────────

export async function getHolidays(input: z.infer<typeof getHolidaysSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getHolidaysSchema.parse(input);

    const holidays = await prisma.autoscuolaHoliday.findMany({
      where: {
        companyId: membership.companyId,
        date: { gte: new Date(payload.from), lte: new Date(payload.to) },
      },
      orderBy: { date: "asc" },
    });

    return { success: true as const, data: holidays };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function createHoliday(
  input: z.infer<typeof createHolidaySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return { success: false as const, message: "Solo il titolare può gestire i giorni festivi." };
    }

    const payload = createHolidaySchema.parse(input);
    const date = new Date(payload.date);
    date.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return { success: false as const, message: "Non puoi creare un festivo nel passato." };
    }

    // Upsert holiday (unique constraint protects duplicates)
    const holiday = await prisma.autoscuolaHoliday.upsert({
      where: {
        companyId_date: {
          companyId: membership.companyId,
          date,
        },
      },
      create: {
        companyId: membership.companyId,
        date,
        label: payload.label || null,
        createdBy: membership.userId,
      },
      update: {
        label: payload.label || null,
      },
    });

    const dateLabel = date.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Rome",
    });

    let cancelledCount = 0;

    if (payload.cancelAppointments) {
      // Find non-cancelled appointments for this day
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const appointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: { notIn: ["cancelled"] },
        },
        select: {
          id: true,
          studentId: true,
          startsAt: true,
          instructorId: true,
          status: true,
        },
      });

      // Exclude checked_in (in-progress) appointments
      const toCancelAppts = appointments.filter((a) => a.status !== "checked_in");
      cancelledCount = toCancelAppts.length;

      // Cancel each appointment and refund credits
      for (const appt of toCancelAppts) {
        await prisma.autoscuolaAppointment.update({
          where: { id: appt.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledByUserId: membership.userId,
            cancellationKind: "permanent_cancel",
            cancellationReason: "holiday",
          },
        });

        await refundLessonCreditIfEligible({
          appointmentId: appt.id,
          cancelledByAutoscuola: true,
          actorUserId: membership.userId,
        });
      }

      // Group by student for notifications (one notification per student)
      const byStudent = new Map<string, typeof toCancelAppts>();
      for (const appt of toCancelAppts) {
        const list = byStudent.get(appt.studentId) ?? [];
        list.push(appt);
        byStudent.set(appt.studentId, list);
      }

      // Send notifications
      for (const [studentId, appts] of byStudent) {
        const count = appts.length;
        const title = "Giorno festivo";
        const body =
          count === 1
            ? `L'autoscuola sarà chiusa il ${dateLabel}. La tua guida è stata cancellata.`
            : `L'autoscuola sarà chiusa il ${dateLabel}. Le tue ${count} guide sono state cancellate.`;

        try {
          await sendAutoscuolaPushToUsers({
            companyId: membership.companyId,
            userIds: [studentId],
            title,
            body,
            data: {
              kind: "holiday_declared",
              date: date.toISOString(),
              appointmentsCancelled: true,
              cancelledCount: count,
            },
          });
        } catch (error) {
          console.error("Holiday push notification error", error);
        }

        // Send email
        try {
          const studentUser = await prisma.user.findUnique({
            where: { id: studentId },
            select: { email: true },
          });
          if (studentUser?.email) {
            await sendDynamicEmail({
              to: studentUser.email,
              subject: title,
              body,
            });
          }
        } catch (error) {
          console.error("Holiday email error", error);
        }
      }
    } else {
      // Notify all students with appointments that day (without cancellation)
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const appointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: { notIn: ["cancelled"] },
        },
        select: { studentId: true },
      });

      const uniqueStudentIds = [...new Set(appointments.map((a) => a.studentId))];

      if (uniqueStudentIds.length > 0) {
        const title = "Giorno festivo";
        const body = `L'autoscuola sarà chiusa il ${dateLabel}.`;

        try {
          await sendAutoscuolaPushToUsers({
            companyId: membership.companyId,
            userIds: uniqueStudentIds,
            title,
            body,
            data: {
              kind: "holiday_declared",
              date: date.toISOString(),
              appointmentsCancelled: false,
            },
          });
        } catch (error) {
          console.error("Holiday push notification error", error);
        }
      }
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: { holiday, cancelledCount } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteHoliday(
  input: z.infer<typeof deleteHolidaySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return { success: false as const, message: "Solo il titolare può gestire i giorni festivi." };
    }

    const payload = deleteHolidaySchema.parse(input);
    const date = new Date(payload.date);
    date.setHours(0, 0, 0, 0);

    await prisma.autoscuolaHoliday.delete({
      where: {
        companyId_date: {
          companyId: membership.companyId,
          date,
        },
      },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
