"use server";

import { prisma as defaultPrisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { refundLessonCreditIfEligible } from "@/lib/autoscuole/payments";

// Operational cancellation. When a lesson can no longer take place for an
// organizational reason (owner deletes it, the instructor/vehicle is made
// inactive, an availability change, sick leave, …) it is simply CANCELLED:
// slots are released, the student's credit is refunded if the lesson was still
// upcoming, and the student is notified. The student then re-books from the app
// or via the school. (Automatic repositioning / "proposal" appointments were
// retired — this module no longer generates replacement lessons.)

type PrismaClientLike = typeof defaultPrisma;

const SLOT_MINUTES = 30;
const AUTOSCUOLA_TIMEZONE = "Europe/Rome";

// Statuses a still-active lesson can be in to be eligible for cancellation.
const ACTIVE_CANCELLABLE_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "checked_in",
]);

const normalizeStatus = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const formatCancellationTitle = (value: string) => {
  switch ((value ?? "").trim()) {
    case "instructor_cancel":
      return "Guida annullata dall'istruttore";
    case "vehicle_inactive":
    case "instructor_inactive":
    case "availability_changed":
    case "directory_instructor_removed":
      return "Guida annullata";
    case "owner_delete":
      return "Guida annullata dalla segreteria";
    case "instructor_sick":
      return "🤒 Guida annullata — istruttore in malattia";
    default:
      return "Guida annullata";
  }
};

const formatCancellationBody = (value: string, slotLabel: string, instrLabel: string) => {
  const tail = "Contatta la segreteria per riprenotarla.";
  switch ((value ?? "").trim()) {
    case "instructor_cancel":
      return `La guida di ${slotLabel}${instrLabel} è stata annullata dall'istruttore. ${tail}`;
    case "vehicle_inactive":
      return `La guida di ${slotLabel}${instrLabel} è stata annullata perché il veicolo non è più disponibile. ${tail}`;
    case "instructor_inactive":
      return `La guida di ${slotLabel}${instrLabel} è stata annullata perché l'istruttore non è al momento disponibile. ${tail}`;
    case "availability_changed":
      return `La guida di ${slotLabel}${instrLabel} è stata annullata per una variazione di disponibilità. ${tail}`;
    case "owner_delete":
      return `La guida di ${slotLabel}${instrLabel} è stata annullata dalla segreteria. ${tail}`;
    case "directory_instructor_removed":
      return `La guida di ${slotLabel}${instrLabel} è stata annullata per un cambio istruttore. ${tail}`;
    case "instructor_sick":
      return `🤒 La guida di ${slotLabel}${instrLabel} è stata annullata perché l'istruttore è in malattia. ${tail}`;
    default:
      return `La guida di ${slotLabel}${instrLabel} è stata annullata per motivi organizzativi. ${tail}`;
  }
};

const getSlotEnd = (start: Date, durationMinutes: number) =>
  new Date(start.getTime() + durationMinutes * 60 * 1000);

const getAppointmentEnd = (appointment: { startsAt: Date; endsAt: Date | null }) =>
  appointment.endsAt ?? getSlotEnd(appointment.startsAt, SLOT_MINUTES);

const isAppointmentOperationallyCancellable = (appointment: {
  status: string;
  startsAt: Date;
}) => {
  const status = normalizeStatus(appointment.status);
  return ACTIVE_CANCELLABLE_STATUSES.has(status) && appointment.startsAt.getTime() > Date.now();
};

const releaseSlotsForAppointment = async (
  prisma: PrismaClientLike,
  appointment: {
    id: string;
    companyId: string;
    // Null only for studentless exam placeholders — no student slot to release.
    studentId: string | null;
    instructorId: string | null;
    vehicleId: string | null;
    startsAt: Date;
    endsAt: Date | null;
  },
) => {
  const rangeEnd = getAppointmentEnd(appointment);
  const ownerFilters = appointment.studentId
    ? [{ ownerType: "student", ownerId: appointment.studentId }]
    : [];
  if (appointment.instructorId) {
    ownerFilters.push({ ownerType: "instructor", ownerId: appointment.instructorId });
  }
  if (appointment.vehicleId) {
    ownerFilters.push({ ownerType: "vehicle", ownerId: appointment.vehicleId });
  }
  // Release the slot rows of every linked vehicle too (follow car, extra motos).
  const linkedVehicles = await prisma.autoscuolaAppointmentVehicle.findMany({
    where: { appointmentId: appointment.id },
    select: { vehicleId: true },
  });
  for (const link of linkedVehicles) {
    if (link.vehicleId !== appointment.vehicleId) {
      ownerFilters.push({ ownerType: "vehicle", ownerId: link.vehicleId });
    }
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

const notifyOperationalCancellation = async ({
  companyId,
  studentId,
  startsAt,
  reason,
  instructorId,
}: {
  companyId: string;
  // Null only for studentless exam placeholders — nobody to notify.
  studentId: string | null;
  startsAt: Date;
  reason: string;
  instructorId?: string | null;
}) => {
  if (!studentId) return;
  const [studentUser, instructor] = await Promise.all([
    defaultPrisma.user.findUnique({
      where: { id: studentId },
      select: { email: true },
    }),
    instructorId
      ? defaultPrisma.autoscuolaInstructor.findFirst({
          where: { id: instructorId, companyId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const dateLabel = startsAt.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: AUTOSCUOLA_TIMEZONE,
  });
  const timeLabel = startsAt.toLocaleTimeString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  const slotLabel = `${dateLabel} alle ${timeLabel}`;
  const instrLabel = instructor?.name ? ` con ${instructor.name}` : "";

  const title = formatCancellationTitle(reason);
  const body = formatCancellationBody(reason, slotLabel, instrLabel);

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

/**
 * Cancel a single lesson for an organizational reason: release the slots,
 * refund the student's credit if the lesson was still upcoming, and notify the
 * student. No replacement lesson is generated.
 */
export async function operationallyCancelAppointment({
  prisma = defaultPrisma,
  companyId,
  appointmentId,
  reason,
  actorUserId,
  notify = true,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  appointmentId: string;
  reason: string;
  actorUserId?: string | null;
  /** Set false to skip the student notification (e.g. the account is being deleted). */
  notify?: boolean;
}): Promise<{ success: boolean; message?: string }> {
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
      paymentRequired: true,
      paymentStatus: true,
    },
  });

  if (!appointment) {
    return { success: false, message: "Appuntamento non trovato." };
  }

  if (!isAppointmentOperationallyCancellable(appointment)) {
    return { success: false, message: "Appuntamento non annullabile." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: actorUserId ?? null,
        cancellationKind: "operational_cancel",
        cancellationReason: reason,
        paymentStatus: appointment.paymentRequired ? "waived" : appointment.paymentStatus,
        invoiceStatus: appointment.paymentRequired ? "not_required" : undefined,
      },
    });

    await releaseSlotsForAppointment(tx as never, {
      id: appointment.id,
      companyId,
      studentId: appointment.studentId,
      instructorId: appointment.instructorId,
      vehicleId: appointment.vehicleId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });
  });

  // Refund the lesson credit unless the lesson is already in the past.
  if (appointment.startsAt.getTime() > now.getTime()) {
    await refundLessonCreditIfEligible({
      prisma,
      appointmentId: appointment.id,
      cancelledByAutoscuola: true,
      actorUserId,
      now,
    });
  }

  if (notify) {
    await notifyOperationalCancellation({
      companyId,
      studentId: appointment.studentId,
      startsAt: appointment.startsAt,
      reason,
      instructorId: appointment.instructorId,
    });
  }

  await invalidateAutoscuoleCache({
    companyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
  });

  return { success: true };
}

/**
 * Cancel every future, still-active lesson tied to a set of appointment ids
 * (e.g. when an instructor or vehicle is deactivated). Returns the count of
 * lessons actually cancelled.
 */
export async function operationallyCancelAppointmentsByResource({
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
}): Promise<{ cancelled: number }> {
  const uniqueIds = Array.from(new Set(appointmentIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return { cancelled: 0 };
  }

  const now = new Date();
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      id: { in: uniqueIds },
      startsAt: { gt: now },
      status: { in: Array.from(ACTIVE_CANCELLABLE_STATUSES) },
    },
    select: { id: true },
  });

  let cancelled = 0;
  for (const appointment of appointments) {
    const response = await operationallyCancelAppointment({
      prisma,
      companyId,
      appointmentId: appointment.id,
      reason,
      actorUserId,
    });
    if (response.success) cancelled += 1;
  }

  return { cancelled };
}

/**
 * Cancel every still-open lesson of a student whose account is being deleted /
 * anonymised, across ALL their companies. Without this the lessons stay pinned
 * to the now-"Account eliminato" user and clutter the agenda (and keep the slot
 * booked). Covers BOTH future bookings and "da confermare" lessons (past start,
 * still scheduled/confirmed). The student is NOT notified — the account is gone.
 *
 * Future lessons go through the full operational cancel (slots freed, credit
 * refunded, cache invalidated); already-elapsed "da confermare" lessons are just
 * flipped to cancelled (no slot to free, no refund on a past lesson).
 */
export async function cancelOpenLessonsForDeletedStudent({
  prisma = defaultPrisma,
  studentId,
  actorUserId,
}: {
  prisma?: PrismaClientLike;
  studentId: string;
  actorUserId?: string | null;
}): Promise<{ cancelled: number }> {
  const now = new Date();
  const lessons = await prisma.autoscuolaAppointment.findMany({
    where: {
      studentId,
      status: { in: Array.from(ACTIVE_CANCELLABLE_STATUSES) },
    },
    select: { id: true, companyId: true, startsAt: true },
  });

  let cancelled = 0;
  const pastCompanies = new Set<string>();

  for (const lesson of lessons) {
    if (lesson.startsAt.getTime() > now.getTime()) {
      const res = await operationallyCancelAppointment({
        prisma,
        companyId: lesson.companyId,
        appointmentId: lesson.id,
        reason: "student_account_deleted",
        actorUserId,
        notify: false,
      });
      if (res.success) cancelled += 1;
    } else {
      await prisma.autoscuolaAppointment.update({
        where: { id: lesson.id },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancelledByUserId: actorUserId ?? null,
          cancellationKind: "operational_cancel",
          cancellationReason: "student_account_deleted",
        },
      });
      cancelled += 1;
      pastCompanies.add(lesson.companyId);
    }
  }

  // Future lessons already invalidated the cache inside operationallyCancelAppointment;
  // do it for the companies that only had past "da confermare" lessons.
  for (const companyId of pastCompanies) {
    await invalidateAutoscuoleCache({
      companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
    });
  }

  return { cancelled };
}
