"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { sendDynamicEmail } from "@/email";
import { sendAutoscuolaWhatsApp } from "@/lib/autoscuole/whatsapp";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import { adjustStudentLessonCredits } from "@/lib/autoscuole/payments";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { getAutoscuolaSettingsForCompany } from "@/lib/actions/autoscuole-settings.actions";
import { isStudentInManualFullCluster } from "@/lib/autoscuole/instructor-clusters";

const AUTOSCUOLA_TIMEZONE = "Europe/Rome";
const DEFAULT_SLOT_FILL_CHANNELS = ["push", "whatsapp", "email"] as const;

const normalizeChannels = (
  value: unknown,
  fallback: readonly ("push" | "whatsapp" | "email")[],
) => {
  if (!Array.isArray(value)) return [...fallback];
  const channels = value.filter(
    (item): item is "push" | "whatsapp" | "email" =>
      item === "push" || item === "whatsapp" || item === "email",
  );
  const unique = Array.from(new Set(channels));
  return unique.length ? unique : [...fallback];
};

const formatItalianDate = (date: Date) =>
  date.toLocaleDateString("it-IT", { timeZone: AUTOSCUOLA_TIMEZONE });

const formatItalianTime = (date: Date) =>
  date.toLocaleTimeString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

// ── Helpers ──────────────────────────────────────────────────────────────

type TimeRange = { startMinutes: number; endMinutes: number };
type AvailabilityRecord = { daysOfWeek: number[]; ranges: TimeRange[] };

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const getZonedParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour === "24" ? 0 : p.hour),
    minute: Number(p.minute),
    weekday: p.weekday,
  };
};

const dayOfWeekFromDate = (date: Date) => {
  const weekday = getZonedParts(date).weekday;
  return WEEKDAY_TO_INDEX[weekday] ?? date.getUTCDay();
};

const minutesFromDate = (date: Date) => {
  const parts = getZonedParts(date);
  return parts.hour * 60 + parts.minute;
};

const SLOT_MINUTES = 30;

const defaultToAvailabilityRecord = (
  record: { daysOfWeek: number[]; ranges: unknown },
): AvailabilityRecord => ({
  daysOfWeek: record.daysOfWeek,
  ranges: Array.isArray(record.ranges)
    ? record.ranges.filter(
        (r): r is TimeRange =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as TimeRange).startMinutes === "number" &&
          typeof (r as TimeRange).endMinutes === "number",
      )
    : [],
});

const isAvailabilityCovering = (
  availability: AvailabilityRecord | null | undefined,
  startsAt: Date,
  endsAt: Date | null,
) => {
  if (!availability) return false;
  const dayOfWeek = dayOfWeekFromDate(startsAt);
  if (!availability.daysOfWeek.includes(dayOfWeek)) return false;
  const startMin = minutesFromDate(startsAt);
  const endDate = endsAt ?? new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
  const endMin = minutesFromDate(endDate);
  return availability.ranges.some(
    (r) => r.endMinutes > r.startMinutes && startMin >= r.startMinutes && endMin <= r.endMinutes,
  );
};

const hasAppointmentConflict = (
  appointments: Array<{ startsAt: Date; endsAt: Date | null }>,
  startsAt: Date,
  endsAt: Date | null,
) => {
  const slotEnd = endsAt ?? new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
  return appointments.some((appointment) => {
    const appointmentEnd =
      appointment.endsAt ??
      new Date(appointment.startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
    return appointment.startsAt < slotEnd && appointmentEnd > startsAt;
  });
};

const getDayBoundsForDate = (date: Date) => {
  const zoned = getZonedParts(date);
  const dayStart = new Date(
    date.getTime() -
      (zoned.hour * 60 + zoned.minute) * 60 * 1000,
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { start: dayStart, end: dayEnd };
};

// ── Schemas ──────────────────────────────────────────────────────────────

const createSwapOfferSchema = z.object({
  appointmentId: z.string().uuid(),
});

const getSwapOffersSchema = z.object({
  studentId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional(),
});

const respondSwapOfferSchema = z.object({
  offerId: z.string().uuid(),
  studentId: z.string().uuid(),
  response: z.enum(["accept", "decline"]),
});

// ── createSwapOffer ─────────────────────────────────────────────────────

export async function createSwapOffer(
  input: z.infer<typeof createSwapOfferSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = createSwapOfferSchema.parse(input);

    const settings = await getAutoscuolaSettingsForCompany(membership.companyId);

    // Check cluster-level swap override for the requesting student
    const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import("@/lib/autoscuole/instructor-clusters");
    const companyLimits = await (async () => {
      const svc = await prisma.companyService.findFirst({
        where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      });
      return (svc?.limits ?? {}) as Record<string, unknown>;
    })();
    const companyDefaults = buildCompanyBookingDefaults(companyLimits);
    const effectiveSettings = await resolveEffectiveBookingSettings(membership.companyId, membership.userId, companyDefaults);

    if (!effectiveSettings.swapEnabled) {
      return { success: false, message: "Scambi tra allievi non abilitati." };
    }

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: {
        id: payload.appointmentId,
        companyId: membership.companyId,
      },
      include: {
        instructor: { select: { id: true, name: true, userId: true } },
        vehicle: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
      },
    });

    if (!appointment) {
      return { success: false, message: "Guida non trovata." };
    }
    if (appointment.studentId !== membership.userId) {
      return { success: false, message: "Non sei il titolare di questa guida." };
    }
    if (!["scheduled", "confirmed"].includes(appointment.status)) {
      return { success: false, message: "La guida non è in uno stato valido per lo scambio." };
    }
    if (appointment.startsAt.getTime() <= Date.now()) {
      return { success: false, message: "La guida è già passata o in corso." };
    }

    // Check no active swap offer for this appointment
    const existingOffer = await prisma.autoscuolaSwapOffer.findFirst({
      where: {
        appointmentId: appointment.id,
        status: "broadcasted",
        expiresAt: { gt: new Date() },
      },
    });
    if (existingOffer) {
      return { success: false, message: "Esiste già una richiesta di scambio attiva per questa guida." };
    }

    const expiresAt = new Date(appointment.startsAt.getTime() - 60 * 60 * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      return { success: false, message: "Troppo tardi per richiedere uno scambio (meno di 1 ora alla guida)." };
    }

    const offer = await prisma.autoscuolaSwapOffer.create({
      data: {
        companyId: membership.companyId,
        appointmentId: appointment.id,
        requestingStudentId: membership.userId,
        status: "broadcasted",
        sentAt: new Date(),
        expiresAt,
      },
    });

    // Determine recipients
    const dayBounds = getDayBoundsForDate(appointment.startsAt);

    // If requesting student is assigned to an autonomous instructor,
    // only notify students in the same cluster.
    const requestingMember = await prisma.companyMember.findFirst({
      where: { companyId: membership.companyId, userId: membership.userId, autoscuolaRole: "STUDENT" },
      select: { assignedInstructorId: true, assignedInstructor: { select: { autonomousMode: true } } },
    });
    const clusterInstructorId =
      requestingMember?.assignedInstructorId && requestingMember.assignedInstructor?.autonomousMode
        ? requestingMember.assignedInstructorId
        : null;

    const students = await prisma.companyMember.findMany({
      where: {
        companyId: membership.companyId,
        autoscuolaRole: "STUDENT",
        userId: { not: membership.userId },
        ...(clusterInstructorId ? { assignedInstructorId: clusterInstructorId } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!students.length) {
      return { success: true, data: offer };
    }

    let eligibleStudents = students;

    if (effectiveSettings.swapNotifyMode === "available_only") {
      const studentIds = students.map((s) => s.user.id);
      const [availabilities, appointments_] = await Promise.all([
        prisma.autoscuolaWeeklyAvailability.findMany({
          where: {
            companyId: membership.companyId,
            ownerType: "student",
            ownerId: { in: studentIds },
          },
        }),
        prisma.autoscuolaAppointment.findMany({
          where: {
            companyId: membership.companyId,
            studentId: { in: studentIds },
            status: { not: "cancelled" },
            startsAt: { gte: dayBounds.start, lt: dayBounds.end },
          },
          select: { studentId: true, startsAt: true, endsAt: true },
        }),
      ]);

      const availabilityByStudent = new Map<string, AvailabilityRecord>(
        availabilities.map((a) => [a.ownerId, defaultToAvailabilityRecord(a)]),
      );
      const appointmentsByStudent = new Map<string, Array<{ startsAt: Date; endsAt: Date | null }>>();
      for (const apt of appointments_) {
        const list = appointmentsByStudent.get(apt.studentId) ?? [];
        list.push({ startsAt: apt.startsAt, endsAt: apt.endsAt });
        appointmentsByStudent.set(apt.studentId, list);
      }

      eligibleStudents = students.filter((student) => {
        const availability = availabilityByStudent.get(student.user.id);
        if (!isAvailabilityCovering(availability, appointment.startsAt, appointment.endsAt)) {
          return false;
        }
        const booked = appointmentsByStudent.get(student.user.id) ?? [];
        return !hasAppointmentConflict(booked, appointment.startsAt, appointment.endsAt);
      });
    }

    if (!eligibleStudents.length) {
      return { success: true, data: offer };
    }

    // Exclude students whose assigned instructor cluster is in manual_full mode
    const manualFullFlags = await Promise.all(
      eligibleStudents.map((s) => isStudentInManualFullCluster(membership.companyId, s.user.id)),
    );
    eligibleStudents = eligibleStudents.filter((_, i) => !manualFullFlags[i]);

    if (!eligibleStudents.length) {
      return { success: true, data: offer };
    }

    // Send notifications
    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const channels = normalizeChannels(
      (service?.limits as Record<string, unknown> | null)?.slotFillChannels,
      DEFAULT_SLOT_FILL_CHANNELS,
    );

    const requesterName = appointment.student?.name ?? "Un allievo";
    const formattedDate = formatItalianDate(appointment.startsAt);
    const formattedTime = formatItalianTime(appointment.startsAt);
    const title = "Reglo Autoscuole · Richiesta sostituzione";
    const message = `${requesterName} sta cercando un sostituto per la guida di ${formattedDate} alle ${formattedTime}. Apri Reglo per accettare o rifiutare.`;

    if (channels.includes("push")) {
      const userIds = Array.from(new Set(eligibleStudents.map((s) => s.user.id)));
      if (userIds.length) {
        try {
          await sendAutoscuolaPushToUsers({
            companyId: membership.companyId,
            userIds,
            title,
            body: message,
            data: {
              kind: "swap_offer",
              offerId: offer.id,
              appointmentId: appointment.id,
              startsAt: appointment.startsAt.toISOString(),
            },
          });
        } catch (error) {
          console.error("Swap push error", error);
        }
      }
    }

    for (const student of eligibleStudents) {
      if (channels.includes("email") && student.user.email) {
        try {
          await sendDynamicEmail({
            to: student.user.email,
            subject: title,
            body: message,
          });
        } catch (error) {
          console.error("Swap email error", error);
        }
      }

      if (channels.includes("whatsapp") && student.user.phone) {
        try {
          await sendAutoscuolaWhatsApp({ to: student.user.phone, body: message });
        } catch (error) {
          console.error("Swap WhatsApp error", error);
        }
      }
    }

    return { success: true, data: offer };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getSwapOffers ───────────────────────────────────────────────────────

export async function getSwapOffers(
  input: z.infer<typeof getSwapOffersSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getSwapOffersSchema.parse(input);
    const now = new Date();
    const limit = payload.limit ?? 5;

    const student = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        autoscuolaRole: "STUDENT",
        userId: payload.studentId,
      },
      select: { userId: true },
    });
    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    // If student is in a cluster, only see offers from same cluster
    const viewerMember = await prisma.companyMember.findFirst({
      where: { companyId: membership.companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
      select: { assignedInstructorId: true, assignedInstructor: { select: { autonomousMode: true } } },
    });
    const viewerClusterInstructorId =
      viewerMember?.assignedInstructorId && viewerMember.assignedInstructor?.autonomousMode
        ? viewerMember.assignedInstructorId
        : null;

    // If locked to a cluster, only show offers from students in the same cluster
    let clusterStudentIds: string[] | null = null;
    if (viewerClusterInstructorId) {
      const clusterMembers = await prisma.companyMember.findMany({
        where: {
          companyId: membership.companyId,
          autoscuolaRole: "STUDENT",
          assignedInstructorId: viewerClusterInstructorId,
        },
        select: { userId: true },
      });
      clusterStudentIds = clusterMembers.map((m) => m.userId);
    }

    const offers = await prisma.autoscuolaSwapOffer.findMany({
      where: {
        companyId: membership.companyId,
        status: "broadcasted",
        expiresAt: { gt: now },
        requestingStudentId: clusterStudentIds
          ? { not: payload.studentId, in: clusterStudentIds }
          : { not: payload.studentId },
        appointment: {
          startsAt: { gt: now },
          status: { in: ["scheduled", "confirmed"] },
        },
      },
      include: {
        appointment: {
          include: {
            instructor: { select: { name: true } },
            vehicle: { select: { name: true } },
          },
        },
        requestingStudent: { select: { name: true } },
        responses: {
          where: { studentId: payload.studentId },
          select: { id: true },
        },
      },
      orderBy: { sentAt: "desc" },
      take: limit * 3,
    });

    // Filter: not already responded, no conflicts
    const studentAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        studentId: payload.studentId,
        status: { not: "cancelled" },
        startsAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { startsAt: true, endsAt: true },
    });

    const visible = offers
      .filter((offer) => !offer.responses.length)
      .filter(
        (offer) =>
          !hasAppointmentConflict(
            studentAppointments,
            offer.appointment.startsAt,
            offer.appointment.endsAt,
          ),
      )
      .slice(0, limit)
      .map((offer) => ({
        id: offer.id,
        companyId: offer.companyId,
        appointmentId: offer.appointmentId,
        requestingStudentId: offer.requestingStudentId,
        requestingStudentName: offer.requestingStudent.name,
        status: offer.status,
        sentAt: offer.sentAt.toISOString(),
        expiresAt: offer.expiresAt.toISOString(),
        appointment: {
          startsAt: offer.appointment.startsAt.toISOString(),
          endsAt: offer.appointment.endsAt?.toISOString() ?? null,
          type: offer.appointment.type,
          instructorName: offer.appointment.instructor?.name ?? null,
          vehicleName: offer.appointment.vehicle?.name ?? null,
        },
      }));

    return { success: true, data: visible };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── respondSwapOffer ────────────────────────────────────────────────────

export async function respondSwapOffer(
  input: z.infer<typeof respondSwapOfferSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = respondSwapOfferSchema.parse(input);

    const student = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        autoscuolaRole: "STUDENT",
        userId: payload.studentId,
      },
      select: { userId: true },
    });
    if (!student) {
      return { success: false, message: "Allievo non valido." };
    }

    const offer = await prisma.autoscuolaSwapOffer.findFirst({
      where: {
        id: payload.offerId,
        companyId: membership.companyId,
        status: "broadcasted",
        expiresAt: { gt: new Date() },
      },
      include: {
        appointment: {
          include: {
            instructor: { select: { name: true, userId: true } },
            student: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!offer) {
      return { success: false, message: "Offerta non trovata o scaduta." };
    }

    // Cluster validation: if accepting student is in a cluster, the offer must be from the same cluster
    if (payload.response === "accept") {
      const acceptingMember = await prisma.companyMember.findFirst({
        where: { companyId: membership.companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
        select: { assignedInstructorId: true, assignedInstructor: { select: { autonomousMode: true } } },
      });
      if (acceptingMember?.assignedInstructorId && acceptingMember.assignedInstructor?.autonomousMode) {
        const offerCreatorMember = await prisma.companyMember.findFirst({
          where: { companyId: membership.companyId, userId: offer.requestingStudentId, autoscuolaRole: "STUDENT" },
          select: { assignedInstructorId: true },
        });
        if (offerCreatorMember?.assignedInstructorId !== acceptingMember.assignedInstructorId) {
          return { success: false, message: "Non puoi accettare scambi da allievi di un altro gruppo." };
        }
      }
    }

    if (payload.response === "decline") {
      await prisma.autoscuolaSwapResponse.create({
        data: {
          offerId: offer.id,
          studentId: payload.studentId,
          status: "declined",
          respondedAt: new Date(),
        },
      });
      return { success: true, data: { accepted: false } };
    }

    // Accept flow — transactional
    const result = await prisma.$transaction(async (tx) => {
      // Optimistic lock
      const updated = await tx.autoscuolaSwapOffer.updateMany({
        where: { id: offer.id, status: "broadcasted" },
        data: { status: "accepted" },
      });
      if (updated.count === 0) {
        throw new Error("Offerta già accettata da un altro allievo.");
      }

      // Create response
      await tx.autoscuolaSwapResponse.create({
        data: {
          offerId: offer.id,
          studentId: payload.studentId,
          status: "accepted",
          respondedAt: new Date(),
        },
      });

      // Find new student's active case
      const newStudentCase = await tx.autoscuolaCase.findFirst({
        where: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          status: { in: ["active", "in_progress", "pending"] },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });

      // Reassign appointment
      const updatedAppointment = await tx.autoscuolaAppointment.update({
        where: { id: offer.appointmentId },
        data: {
          studentId: payload.studentId,
          caseId: newStudentCase?.id ?? null,
        },
      });

      // Credit transfer
      const settings = await getAutoscuolaSettingsForCompany(membership.companyId);
      if (settings.lessonCreditFlowEnabled && offer.appointment.creditApplied) {
        await adjustStudentLessonCredits({
          prisma: tx,
          companyId: membership.companyId,
          studentId: offer.requestingStudentId,
          delta: +1,
          reason: "swap_refund",
          appointmentId: offer.appointmentId,
        });
        await adjustStudentLessonCredits({
          prisma: tx,
          companyId: membership.companyId,
          studentId: payload.studentId,
          delta: -1,
          reason: "swap_consume",
          appointmentId: offer.appointmentId,
        });
      }

      // TODO: gestire trasferimento pagamento Stripe automatico

      return updatedAppointment;
    });

    // Post-transaction notifications (fire & forget)
    const oldStudentName = offer.appointment.student?.name ?? "Allievo";
    const newStudentName = (
      await prisma.user.findFirst({
        where: { id: payload.studentId },
        select: { name: true },
      })
    )?.name ?? "Allievo";
    const formattedDate = formatItalianDate(offer.appointment.startsAt);
    const formattedTime = formatItalianTime(offer.appointment.startsAt);

    // Notify original student
    try {
      await sendAutoscuolaPushToUsers({
        companyId: membership.companyId,
        userIds: [offer.requestingStudentId],
        title: "Affare fatto!",
        body: `${newStudentName} ti sostituirà per la guida di ${formattedDate} alle ${formattedTime}.`,
        data: {
          kind: "swap_accepted",
          acceptedByName: newStudentName,
          appointmentDate: formattedDate,
          appointmentTime: formattedTime,
          instructorName: offer.appointment.instructor?.name ?? "",
          vehicleName: (await prisma.autoscuolaAppointment.findFirst({
            where: { id: offer.appointmentId },
            include: { vehicle: { select: { name: true } } },
          }))?.vehicle?.name ?? "",
          appointmentType: offer.appointment.type,
        },
      });
    } catch (error) {
      console.error("Swap accept push (requester) error", error);
    }

    // Notify instructor
    if (offer.appointment.instructor?.userId) {
      try {
        await sendAutoscuolaPushToUsers({
          companyId: membership.companyId,
          userIds: [offer.appointment.instructor.userId],
          title: "Sostituzione allievo",
          body: `${newStudentName} ha sostituito ${oldStudentName} per la guida di ${formattedDate} alle ${formattedTime}.`,
          data: { kind: "swap_instructor_notify" },
        });
      } catch (error) {
        console.error("Swap accept push (instructor) error", error);
      }
    }

    // Invalidate caches
    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [
        AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
        AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
      ],
    });

    return { success: true, data: { accepted: true, appointment: result } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── getMyAcceptedSwaps ──────────────────────────────────────────────────

const getMyAcceptedSwapsSchema = z.object({
  studentId: z.string().uuid(),
});

export async function getMyAcceptedSwaps(
  input: z.infer<typeof getMyAcceptedSwapsSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getMyAcceptedSwapsSchema.parse(input);

    const offers = await prisma.autoscuolaSwapOffer.findMany({
      where: {
        companyId: membership.companyId,
        requestingStudentId: payload.studentId,
        status: "accepted",
      },
      include: {
        appointment: {
          include: {
            instructor: { select: { name: true } },
            vehicle: { select: { name: true } },
          },
        },
        responses: {
          where: { status: "accepted" },
          include: { student: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    const data = offers.map((offer) => ({
      id: offer.id,
      acceptedByName: offer.responses[0]?.student.name ?? "Un allievo",
      appointmentDate: formatItalianDate(offer.appointment.startsAt),
      appointmentTime: formatItalianTime(offer.appointment.startsAt),
      instructorName: offer.appointment.instructor?.name ?? "",
      vehicleName: offer.appointment.vehicle?.name ?? "",
      appointmentType: offer.appointment.type,
      acceptedAt: offer.updatedAt.toISOString(),
    }));

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
