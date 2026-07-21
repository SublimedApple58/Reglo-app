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

const createHolidayRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  cancelAppointments: z.boolean(),
});

const deleteHolidaySchema = z.object({
  date: z.string().min(1),
});

/**
 * Frase "quando" per le notifiche di chiusura. Giorno singolo →
 * "il lunedì 20 luglio"; intervallo → "dal 18 luglio al 22 luglio".
 */
function formatHolidayWhen(start: Date, end: Date): string {
  const full = (d: Date) =>
    d.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Rome",
    });
  if (start.getTime() === end.getTime()) return `il ${full(start)}`;
  const short = (d: Date) =>
    d.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Rome",
    });
  return `dal ${short(start)} al ${short(end)}`;
}

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
        if (!appt.studentId) continue; // studentless exam placeholder — no student to notify
        const list = byStudent.get(appt.studentId) ?? [];
        list.push(appt);
        byStudent.set(appt.studentId, list);
      }

      // Send notifications
      for (const [studentId, appts] of byStudent) {
        const count = appts.length;
        const title = "🏖️ Giorno festivo";
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

      const uniqueStudentIds = [
        ...new Set(appointments.map((a) => a.studentId).filter((id): id is string => id != null)),
      ];

      if (uniqueStudentIds.length > 0) {
        const title = "🏖️ Giorno festivo";
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

/**
 * Segna un INTERVALLO di giorni come festivo azienda (giorno singolo = from===to).
 * Espande l'intervallo in una riga per giorno (upsert idempotente), salta i giorni
 * passati, e — a differenza di N chiamate a createHoliday — invia UNA sola notifica
 * per allievo per l'intero periodo. Usato dal modale "Segna festivo" dell'agenda.
 */
export async function createHolidayRange(
  input: z.infer<typeof createHolidayRangeSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return { success: false as const, message: "Solo il titolare può gestire i giorni festivi." };
    }

    const payload = createHolidayRangeSchema.parse(input);
    // Le date arrivano come YYYY-MM-DD: normalizza a mezzanotte UTC (come la
    // colonna @db.Date e come le legge la disponibilità), così il giorno non
    // slitta col fuso del server.
    const parseYmdUTC = (s: string): Date | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (!m) return null;
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const from = parseYmdUTC(payload.from);
    const to = parseYmdUTC(payload.to);
    if (!from || !to) {
      return { success: false as const, message: "Date non valide." };
    }

    // Normalizza l'ordine e scarta la coda passata.
    let start = from.getTime() <= to.getTime() ? from : to;
    const end = from.getTime() <= to.getTime() ? to : from;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (end.getTime() < today.getTime()) {
      return { success: false as const, message: "Non puoi creare un festivo nel passato." };
    }
    if (start.getTime() < today.getTime()) start = new Date(today);

    // Un giorno alla volta: upsert idempotente (il vincolo unico protegge i doppioni).
    const days: Date[] = [];
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(new Date(d));
    }
    for (const day of days) {
      await prisma.autoscuolaHoliday.upsert({
        where: { companyId_date: { companyId: membership.companyId, date: day } },
        create: {
          companyId: membership.companyId,
          date: day,
          label: payload.label || null,
          createdBy: membership.userId,
        },
        update: { label: payload.label || null },
      });
    }

    const rangeStart = new Date(start);
    const rangeEndExclusive = new Date(end);
    rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
    const when = formatHolidayWhen(start, end);
    const title = "🏖️ Giorno festivo";

    let cancelledCount = 0;

    if (payload.cancelAppointments) {
      const appointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          startsAt: { gte: rangeStart, lt: rangeEndExclusive },
          status: { notIn: ["cancelled"] },
        },
        select: { id: true, studentId: true, status: true },
      });

      // Escludi le guide in corso (checked_in).
      const toCancelAppts = appointments.filter((a) => a.status !== "checked_in");
      cancelledCount = toCancelAppts.length;

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

      // Una notifica per allievo, con il conteggio guide su tutto il periodo.
      const countByStudent = new Map<string, number>();
      for (const appt of toCancelAppts) {
        if (!appt.studentId) continue; // placeholder esame senza allievo
        countByStudent.set(appt.studentId, (countByStudent.get(appt.studentId) ?? 0) + 1);
      }
      for (const [studentId, count] of countByStudent) {
        const body =
          count === 1
            ? `L'autoscuola sarà chiusa ${when}. La tua guida è stata cancellata.`
            : `L'autoscuola sarà chiusa ${when}. Le tue ${count} guide sono state cancellate.`;
        try {
          await sendAutoscuolaPushToUsers({
            companyId: membership.companyId,
            userIds: [studentId],
            title,
            body,
            data: {
              kind: "holiday_declared",
              date: start.toISOString(),
              appointmentsCancelled: true,
              cancelledCount: count,
            },
          });
        } catch (error) {
          console.error("Holiday push notification error", error);
        }
        try {
          const studentUser = await prisma.user.findUnique({
            where: { id: studentId },
            select: { email: true },
          });
          if (studentUser?.email) {
            await sendDynamicEmail({ to: studentUser.email, subject: title, body });
          }
        } catch (error) {
          console.error("Holiday email error", error);
        }
      }
    } else {
      // Nessuna cancellazione: avvisa una volta gli allievi con guide nel periodo.
      const appointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          startsAt: { gte: rangeStart, lt: rangeEndExclusive },
          status: { notIn: ["cancelled"] },
        },
        select: { studentId: true },
      });
      const uniqueStudentIds = [
        ...new Set(appointments.map((a) => a.studentId).filter((id): id is string => id != null)),
      ];
      if (uniqueStudentIds.length > 0) {
        const body = `L'autoscuola sarà chiusa ${when}.`;
        try {
          await sendAutoscuolaPushToUsers({
            companyId: membership.companyId,
            userIds: uniqueStudentIds,
            title,
            body,
            data: {
              kind: "holiday_declared",
              date: start.toISOString(),
              appointmentsCancelled: false,
            },
          });
        } catch (error) {
          console.error("Holiday push notification error", error);
        }
      }
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return {
      success: true as const,
      data: { daysCount: days.length, cancelledCount },
    };
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
