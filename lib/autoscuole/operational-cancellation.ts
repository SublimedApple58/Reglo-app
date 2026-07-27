"use server";

import { prisma as defaultPrisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { refundLessonCreditIfEligible, adjustStudentLessonCredits } from "@/lib/autoscuole/payments";

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
    case "instructor_vacation":
      return "🌴 Guida annullata — istruttore in ferie";
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
    case "instructor_vacation":
      return `🌴 La guida di ${slotLabel}${instrLabel} è stata annullata perché l'istruttore è in ferie. ${tail}`;
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
 * "Rimuovi dallo storico": il titolare toglie una guida dallo storico
 * dell'allievo e dall'agenda. Marcatore dedicato `cancellationKind =
 * "record_cleanup"` → la guida è filtrata fuori dallo storico, dall'agenda e
 * dalla vista "guide annullate" del mobile. Due opzioni decise dal titolare in
 * fase di rimozione:
 *  - `keepInHours`: se true, lo stato resta invariato (es. "completed") → la
 *    guida CONTINUA a contare nelle ore dell'istruttore (l'ha comunque svolta);
 *    se false (default) lo stato diventa "cancelled" → esce anche dalle ore, e
 *    gli slot futuri vengono liberati.
 *  - `refundCredit`: se true e la guida era coperta da un credito non ancora
 *    reso, restituisce 1 credito all'allievo.
 * Esami e guide di gruppo hanno flussi dedicati → esclusi.
 */
export async function removeAppointmentFromRecord({
  prisma = defaultPrisma,
  companyId,
  appointmentId,
  actorUserId,
  keepInHours = false,
  refundCredit = false,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  appointmentId: string;
  actorUserId?: string | null;
  keepInHours?: boolean;
  refundCredit?: boolean;
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
      type: true,
      instructorId: true,
      vehicleId: true,
      cancellationKind: true,
      creditApplied: true,
      creditRefundedAt: true,
    },
  });

  if (!appointment) {
    return { success: false, message: "Guida non trovata." };
  }
  if (appointment.type === "esame" || appointment.type === "group_lesson") {
    return {
      success: false,
      message: "Questo tipo di evento non può essere rimosso da qui.",
    };
  }
  if (appointment.cancellationKind === "record_cleanup") {
    return { success: false, message: "Guida già rimossa dallo storico." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        // record_cleanup = marcatore "fuori dallo storico" (indipendente dallo stato).
        cancellationKind: "record_cleanup",
        cancellationReason: "record_cleanup",
        cancelledByUserId: actorUserId ?? null,
        // keepInHours: lo stato resta invariato → continua a contare nelle ore.
        // Altrimenti "cancelled" → fuori da ore + storico, con cancelledAt.
        ...(keepInHours ? {} : { status: "cancelled", cancelledAt: now }),
      },
    });

    if (!keepInHours) {
      await releaseSlotsForAppointment(tx as never, {
        id: appointment.id,
        companyId,
        studentId: appointment.studentId,
        instructorId: appointment.instructorId,
        vehicleId: appointment.vehicleId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
      });
    }

    if (
      refundCredit &&
      appointment.studentId &&
      appointment.creditApplied &&
      appointment.creditRefundedAt === null
    ) {
      await adjustStudentLessonCredits({
        prisma: tx as never,
        companyId,
        studentId: appointment.studentId,
        delta: 1,
        reason: "cancel_refund",
        actorUserId: actorUserId ?? null,
        appointmentId: appointment.id,
      });
      await tx.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: { creditRefundedAt: now },
      });
    }
  });

  await invalidateAutoscuoleCache({
    companyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
  });

  return { success: true };
}

/**
 * "Annulla guida" (guide FUTURE) — azione unica che sostituisce i due bottoni
 * confusi Annulla/Cancella dell'agenda. Annulla la guida (status "cancelled",
 * `manual_cancel`), libera gli slot, notifica l'allievo; poi gestisce l'esito
 * economico in base a copertura (credito / denaro / niente) e tempistica:
 *  - NEI TEMPI (annullamento prima del cutoff di preavviso): nessuna penale →
 *    credito reso, importo azzerato.
 *  - TARDIVO: serve la scelta del titolare (`lateOutcome`):
 *      · "waive"    → condona: credito reso / non addebitato (lateCancellationAction=dismissed)
 *      · "penalize" → applica: credito trattenuto / guida da pagare (lateCancellationAction=charged)
 *      · "defer"    → decidi dopo: lasciata in coda "Cancellazioni tardive" (null)
 * Esami e guide di gruppo hanno flussi dedicati → esclusi.
 */
export async function annulFutureAppointment({
  prisma = defaultPrisma,
  companyId,
  appointmentId,
  actorUserId,
  lateOutcome,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  appointmentId: string;
  actorUserId?: string | null;
  lateOutcome?: "penalize" | "waive" | "defer";
}): Promise<{
  success: boolean;
  message?: string;
  data?: {
    isLate: boolean;
    coverage: "credit" | "money" | "none";
    lateCancellationAction: "charged" | "dismissed" | null;
    refundedCredit: boolean;
  };
}> {
  const now = new Date();

  const appointment = await prisma.autoscuolaAppointment.findFirst({
    where: { id: appointmentId, companyId },
    select: {
      id: true,
      companyId: true,
      studentId: true,
      instructorId: true,
      vehicleId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      type: true,
      creditApplied: true,
      creditRefundedAt: true,
      penaltyCutoffAt: true,
      paymentRequired: true,
      paymentStatus: true,
    },
  });

  if (!appointment) {
    return { success: false, message: "Guida non trovata." };
  }
  if (appointment.type === "esame" || appointment.type === "group_lesson") {
    return {
      success: false,
      message: "Esami e guide di gruppo si annullano dai loro flussi dedicati.",
    };
  }
  if (!isAppointmentOperationallyCancellable(appointment)) {
    return {
      success: false,
      message: "Puoi annullare solo guide future non ancora svolte.",
    };
  }

  const isLate =
    appointment.penaltyCutoffAt != null &&
    now.getTime() > appointment.penaltyCutoffAt.getTime();
  const coverage: "credit" | "money" | "none" = appointment.creditApplied
    ? "credit"
    : appointment.paymentRequired
      ? "money"
      : "none";

  // Deriva gli effetti su credito/penale.
  let refundCredit = false;
  let lateCancellationAction: "charged" | "dismissed" | null = null;
  let waivePayment = false; // azzera l'importo dovuto
  let chargeMoney = false; // segna la guida come da pagare (penale denaro)

  if (!isLate) {
    // Nei tempi: nessuna penale.
    refundCredit = coverage === "credit";
    waivePayment = coverage === "money";
  } else if (coverage !== "none") {
    const outcome = lateOutcome ?? "defer";
    if (outcome === "waive") {
      refundCredit = coverage === "credit";
      waivePayment = coverage === "money";
      lateCancellationAction = "dismissed";
    } else if (outcome === "penalize") {
      // credito: trattenuto (nessun rimborso). denaro: da pagare.
      chargeMoney = coverage === "money";
      lateCancellationAction = "charged";
    } else {
      // defer → resta in coda "Cancellazioni tardive" (lateCancellationAction null)
      lateCancellationAction = null;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: actorUserId ?? null,
        cancellationKind: "manual_cancel",
        cancellationReason: "manual_cancel",
        lateCancellationAction,
        ...(waivePayment && appointment.paymentRequired
          ? { paymentStatus: "waived", invoiceStatus: "not_required", manualPaymentStatus: null }
          : {}),
        ...(chargeMoney ? { manualPaymentStatus: "unpaid" } : {}),
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

    if (
      refundCredit &&
      appointment.studentId &&
      appointment.creditApplied &&
      appointment.creditRefundedAt === null
    ) {
      await adjustStudentLessonCredits({
        prisma: tx as never,
        companyId,
        studentId: appointment.studentId,
        delta: 1,
        reason: "cancel_refund",
        actorUserId: actorUserId ?? null,
        appointmentId: appointment.id,
      });
      await tx.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: { creditRefundedAt: now },
      });
    }
  });

  await notifyOperationalCancellation({
    companyId,
    studentId: appointment.studentId,
    startsAt: appointment.startsAt,
    reason: "owner_delete",
    instructorId: appointment.instructorId,
  });

  await invalidateAutoscuoleCache({
    companyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
  });

  return {
    success: true,
    data: { isLate, coverage, lateCancellationAction, refundedCredit: refundCredit },
  };
}

/**
 * Bulk "pulizia storico" di tutte le guide future ancora attive di un allievo
 * (l'azione "Cancella tutte" dal dettaglio allievo). Esami e guide di gruppo
 * sono esclusi. Ritorna quante guide sono state rimosse.
 */
export async function hardCleanupAppointmentsByStudent({
  prisma = defaultPrisma,
  companyId,
  studentId,
  actorUserId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
  actorUserId?: string | null;
}): Promise<{ success: boolean; removed: number }> {
  const now = new Date();

  const candidates = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId,
      status: { in: [...ACTIVE_CANCELLABLE_STATUSES] },
      startsAt: { gt: now },
      type: { notIn: ["esame", "group_lesson"] },
    },
    select: { id: true },
  });

  let removed = 0;
  for (const candidate of candidates) {
    const res = await removeAppointmentFromRecord({
      prisma,
      companyId,
      appointmentId: candidate.id,
      actorUserId,
    });
    if (res.success) removed += 1;
  }

  return { success: true, removed };
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
