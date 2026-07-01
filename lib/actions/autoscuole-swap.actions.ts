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
import { vehicleServesLicense } from "@/lib/autoscuole/license";
import {
  appointmentSwapBlockReason,
  SWAP_BLOCK_MESSAGES,
} from "@/lib/autoscuole/swap-rules";
import {
  isStudentInManualFullCluster,
  resolveEffectiveBookingSettings,
  buildCompanyBookingDefaults,
} from "@/lib/autoscuole/instructor-clusters";
import { hasExamPriority } from "@/lib/autoscuole/exam-priority";
import { BOOKING_SOURCE } from "@/lib/autoscuole/booking-source";
import { isInstructor, isOwner } from "@/lib/autoscuole/roles";

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

const getMySwapOffersSchema = z.object({
  studentId: z.string().uuid(),
});

const cancelSwapOfferSchema = z.object({
  offerId: z.string().uuid(),
  studentId: z.string().uuid(),
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
        vehicle: { select: { id: true, name: true, licenseCategory: true, transmission: true } },
        student: { select: { id: true, name: true } },
        appointmentVehicles: { where: { role: "follow" }, select: { vehicleId: true } },
      },
    });

    if (!appointment) {
      return { success: false, message: "Guida non trovata." };
    }
    // Non-swappable kinds (shared rule, see swap-rules.ts):
    // - group-lesson seats bypass the group flow's opt-in/license/seat rules
    //   (real incident: a non-opted-in student entered a group lesson via swap);
    //   freeing a seat goes through "Ritira iscrizione" instead.
    // - exams are personal.
    // - auto al seguito reserves two vehicles (phase-1 decision #5).
    const blockReason = appointmentSwapBlockReason({
      type: appointment.type,
      groupLessonId: appointment.groupLessonId,
      hasFollowCar: appointment.appointmentVehicles.length > 0,
    });
    if (blockReason) {
      return { success: false, message: SWAP_BLOCK_MESSAGES[blockReason] };
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

    // License gate (Vehicles module): only notify students whose pursued license
    // matches the offered slot's vehicle — others could never take it.
    const swapVehicle = appointment.vehicle;
    let eligibleStudents =
      settings.vehiclesEnabled && swapVehicle
        ? students.filter((student) =>
            vehicleServesLicense(swapVehicle, {
              licenseCategory: student.licenseCategory,
              transmission: student.transmission,
            }),
          )
        : students;

    if (!eligibleStudents.length) {
      return { success: true, data: offer };
    }

    if (effectiveSettings.swapNotifyMode === "available_only") {
      const studentIds = eligibleStudents.map((s) => s.user.id);
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

      eligibleStudents = eligibleStudents.filter((student) => {
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
    const title = "🔁 Richiesta sostituzione";
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
      select: {
        assignedInstructorId: true,
        assignedInstructor: { select: { autonomousMode: true } },
        licenseCategory: true,
        transmission: true,
      },
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
          // Group-lesson seats and exams are not swappable — hide any stale
          // offer created before the createSwapOffer guard existed.
          groupLessonId: null,
          type: { notIn: ["group_lesson", "esame"] },
        },
      },
      include: {
        appointment: {
          include: {
            instructor: { select: { name: true } },
            vehicle: { select: { name: true, licenseCategory: true, transmission: true } },
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

    // License gate (Vehicles module): hide offers whose vehicle does not serve
    // the viewer's pursued license — they could not actually take the slot.
    const swapSettings = await getAutoscuolaSettingsForCompany(membership.companyId);
    const viewerLicense = {
      licenseCategory: viewerMember?.licenseCategory,
      transmission: viewerMember?.transmission,
    };

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
      .filter(
        (offer) =>
          !swapSettings.vehiclesEnabled ||
          !offer.appointment.vehicle ||
          vehicleServesLicense(offer.appointment.vehicle, viewerLicense),
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
            vehicle: { select: { licenseCategory: true, transmission: true } },
          },
        },
      },
    });

    if (!offer) {
      return { success: false, message: "Offerta non trovata o scaduta." };
    }

    // Defense in depth: never let a swap move a group-lesson seat or an exam,
    // even for offers created before this guard existed (see createSwapOffer).
    if (
      offer.appointment.groupLessonId ||
      ["group_lesson", "esame"].includes(offer.appointment.type)
    ) {
      return { success: false, message: "Questa guida non è scambiabile." };
    }

    // Cluster validation: if accepting student is in a cluster, the offer must be from the same cluster
    if (payload.response === "accept") {
      const acceptingMember = await prisma.companyMember.findFirst({
        where: { companyId: membership.companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
        select: {
          assignedInstructorId: true,
          assignedInstructor: { select: { autonomousMode: true } },
          licenseCategory: true,
          transmission: true,
          weeklyBookingLimitExempt: true,
        },
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

      // License validation (Vehicles module): the taker can only inherit a slot
      // whose vehicle serves their pursued license (a moto student can't take a
      // car slot and vice versa). The swap keeps the original instructor+vehicle.
      const swapSettings = await getAutoscuolaSettingsForCompany(membership.companyId);
      if (
        swapSettings.vehiclesEnabled &&
        offer.appointment.vehicle &&
        !vehicleServesLicense(offer.appointment.vehicle, {
          licenseCategory: acceptingMember?.licenseCategory,
          transmission: acceptingMember?.transmission,
        })
      ) {
        return {
          success: false,
          message: "Questo scambio usa un veicolo non compatibile con la tua patente.",
        };
      }

      // Weekly booking limit: accepting a swap reassigns the slot to this student,
      // i.e. +1 lesson in the slot's ISO week. Like any booking it must respect
      // the student's weekly cap — a hard block (students have no "proceed anyway").
      // Exemptions match the booking flow: per-member exempt + exam priority. The
      // swapped appointment is always a normal guida (group/exam are non-swappable),
      // so no type carve-out is needed. slot_fill etc. don't go through swaps.
      {
        const svc = await prisma.companyService.findFirst({
          where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
          select: { limits: true },
        });
        const limits = (svc?.limits ?? {}) as Record<string, unknown>;
        const effective = await resolveEffectiveBookingSettings(
          membership.companyId,
          payload.studentId,
          buildCompanyBookingDefaults(limits),
        );
        if (
          effective.weeklyBookingLimitEnabled &&
          acceptingMember?.weeklyBookingLimitExempt !== true
        ) {
          let bypass = false;
          if (limits.examPriorityEnabled === true) {
            const daysBeforeExam =
              typeof limits.examPriorityDaysBeforeExam === "number" &&
              limits.examPriorityDaysBeforeExam >= 1
                ? limits.examPriorityDaysBeforeExam
                : 14;
            bypass = await hasExamPriority(
              membership.companyId,
              payload.studentId,
              daysBeforeExam,
            );
          }
          if (!bypass) {
            const startsAt = offer.appointment.startsAt;
            const dayOfWeek = startsAt.getUTCDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(startsAt);
            weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
            weekStart.setUTCHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
            const weekCount = await prisma.autoscuolaAppointment.count({
              where: {
                companyId: membership.companyId,
                studentId: payload.studentId,
                status: { notIn: ["cancelled"] },
                startsAt: { gte: weekStart, lt: weekEnd },
                id: { not: offer.appointmentId },
              },
            });
            if (weekCount + 1 > effective.weeklyBookingLimit) {
              return {
                success: false,
                message: `Hai già ${weekCount} guide in questa settimana: accettando questo scambio supereresti il limite di ${effective.weeklyBookingLimit} guide settimanali.`,
              };
            }
          }
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
          bookingSource: BOOKING_SOURCE.swap,
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
        title: "🤝 Affare fatto!",
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
          title: "🔁 Sostituzione allievo",
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

// ── getMySwapOffers ─────────────────────────────────────────────────────
// The active swap offers *created by* the viewing student (still broadcasted,
// not expired, appointment still upcoming). Mirrors the shape of getSwapOffers
// so the mobile client can reuse the same type.

export async function getMySwapOffers(
  input: z.infer<typeof getMySwapOffersSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = getMySwapOffersSchema.parse(input);
    const now = new Date();

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

    const offers = await prisma.autoscuolaSwapOffer.findMany({
      where: {
        companyId: membership.companyId,
        requestingStudentId: payload.studentId,
        status: "broadcasted",
        expiresAt: { gt: now },
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
      },
      orderBy: { sentAt: "desc" },
    });

    const data = offers.map((offer) => ({
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

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── cancelSwapOffer ─────────────────────────────────────────────────────
// The requesting student withdraws their own broadcasted swap offer. No credit
// movement happens (no swap occurred). Idempotent-friendly: a non-broadcasted
// offer is reported as already closed.

export async function cancelSwapOffer(
  input: z.infer<typeof cancelSwapOfferSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = cancelSwapOfferSchema.parse(input);

    const offer = await prisma.autoscuolaSwapOffer.findFirst({
      where: { id: payload.offerId, companyId: membership.companyId },
      select: { id: true, requestingStudentId: true, status: true },
    });

    if (!offer) {
      return { success: false, message: "Richiesta non trovata." };
    }
    if (offer.requestingStudentId !== payload.studentId) {
      return { success: false, message: "Non sei il titolare di questa richiesta." };
    }
    if (offer.status !== "broadcasted") {
      return { success: false, message: "La richiesta non è più attiva." };
    }

    await prisma.autoscuolaSwapOffer.update({
      where: { id: offer.id },
      data: { status: "cancelled" },
    });

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return { success: true, data: { cancelled: true } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── instructorSwapAppointments ───────────────────────────────────────────

const instructorSwapSchema = z.object({
  appointmentIdA: z.string().uuid(),
  appointmentIdB: z.string().uuid(),
});

export async function instructorSwapAppointments(
  input: z.infer<typeof instructorSwapSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = instructorSwapSchema.parse(input);

    const isInstructorActor =
      isInstructor(membership.autoscuolaRole) && membership.role !== "admin";
    const isOwnerOrAdmin =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);

    if (!isInstructorActor && !isOwnerOrAdmin) {
      return { success: false, message: "Operazione non consentita." };
    }

    if (payload.appointmentIdA === payload.appointmentIdB) {
      return { success: false, message: "Seleziona due guide diverse." };
    }

    const [apptA, apptB] = await Promise.all([
      prisma.autoscuolaAppointment.findFirst({
        where: { id: payload.appointmentIdA, companyId },
        include: {
          student: { select: { id: true, name: true } },
          vehicle: { select: { licenseCategory: true, transmission: true } },
          appointmentVehicles: { where: { role: "follow" }, select: { vehicleId: true } },
        },
      }),
      prisma.autoscuolaAppointment.findFirst({
        where: { id: payload.appointmentIdB, companyId },
        include: {
          student: { select: { id: true, name: true } },
          vehicle: { select: { licenseCategory: true, transmission: true } },
          appointmentVehicles: { where: { role: "follow" }, select: { vehicleId: true } },
        },
      }),
    ]);

    if (!apptA || !apptB) {
      return { success: false, message: "Una o entrambe le guide non trovate." };
    }

    // Non-swappable kinds (shared rule, see swap-rules.ts): group-lesson seats,
    // exams, and lessons with an auto al seguito. Same guard as createSwapOffer.
    const blockReason =
      appointmentSwapBlockReason({
        type: apptA.type,
        groupLessonId: apptA.groupLessonId,
        hasFollowCar: apptA.appointmentVehicles.length > 0,
      }) ??
      appointmentSwapBlockReason({
        type: apptB.type,
        groupLessonId: apptB.groupLessonId,
        hasFollowCar: apptB.appointmentVehicles.length > 0,
      });
    if (blockReason) {
      return { success: false, message: SWAP_BLOCK_MESSAGES[blockReason] };
    }

    // Both must be scheduled or confirmed
    const validStatuses = new Set(["scheduled", "confirmed"]);
    if (!validStatuses.has(apptA.status) || !validStatuses.has(apptB.status)) {
      return { success: false, message: "Entrambe le guide devono essere in stato prenotato o confermato." };
    }

    // Both must be in the future
    const now = new Date();
    if (apptA.startsAt <= now || apptB.startsAt <= now) {
      return { success: false, message: "Entrambe le guide devono essere nel futuro." };
    }

    // Instructor must own both appointments
    if (isInstructorActor) {
      const ownInstructor = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true, autonomousMode: true },
      });
      if (!ownInstructor) {
        return { success: false, message: "Profilo istruttore non trovato." };
      }
      if (apptA.instructorId !== ownInstructor.id || apptB.instructorId !== ownInstructor.id) {
        return { success: false, message: "Puoi scambiare solo le tue guide." };
      }

      // Autonomous mode: both students must be assigned to this instructor
      if (ownInstructor.autonomousMode) {
        const members = await prisma.companyMember.findMany({
          where: {
            companyId,
            userId: { in: [apptA.studentId, apptB.studentId] },
            assignedInstructorId: ownInstructor.id,
          },
          select: { userId: true },
        });
        const assignedSet = new Set(members.map((m) => m.userId));
        if (!assignedSet.has(apptA.studentId) || !assignedSet.has(apptB.studentId)) {
          return { success: false, message: "Puoi scambiare solo guide di allievi assegnati a te." };
        }
      }
    }

    // Students must be different
    if (apptA.studentId === apptB.studentId) {
      return { success: false, message: "Le due guide devono appartenere ad allievi diversi." };
    }

    // License validation (Vehicles module): after the swap each student inherits
    // the OTHER appointment's vehicle, so both must be compatible with the
    // vehicle they end up on (no moto↔auto cross-assignment).
    const instrSwapSettings = await getAutoscuolaSettingsForCompany(companyId);
    if (instrSwapSettings.vehiclesEnabled && (apptA.vehicle || apptB.vehicle)) {
      const licenseMembers = await prisma.companyMember.findMany({
        where: {
          companyId,
          userId: { in: [apptA.studentId, apptB.studentId] },
          autoscuolaRole: "STUDENT",
        },
        select: { userId: true, licenseCategory: true, transmission: true },
      });
      const licenseByUser = new Map(licenseMembers.map((m) => [m.userId, m]));
      const studentALicense = licenseByUser.get(apptA.studentId);
      const studentBLicense = licenseByUser.get(apptB.studentId);
      // Student A moves onto appointment B's vehicle; student B onto A's vehicle.
      const aOk = !apptB.vehicle || vehicleServesLicense(apptB.vehicle, {
        licenseCategory: studentALicense?.licenseCategory,
        transmission: studentALicense?.transmission,
      });
      const bOk = !apptA.vehicle || vehicleServesLicense(apptA.vehicle, {
        licenseCategory: studentBLicense?.licenseCategory,
        transmission: studentBLicense?.transmission,
      });
      if (!aOk || !bOk) {
        return {
          success: false,
          message: "Scambio non possibile: il veicolo di una guida non è compatibile con la patente dell'altro allievo.",
        };
      }
    }

    // Swap studentId and caseId
    await prisma.$transaction([
      prisma.autoscuolaAppointment.update({
        where: { id: apptA.id },
        data: { studentId: apptB.studentId, caseId: apptB.caseId },
      }),
      prisma.autoscuolaAppointment.update({
        where: { id: apptB.id },
        data: { studentId: apptA.studentId, caseId: apptA.caseId },
      }),
    ]);

    await invalidateAutoscuoleCache({
      companyId,
      segments: [
        AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
        AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
      ],
    });

    // Notify both students (fire & forget)
    const formatDate = (d: Date) =>
      d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

    sendAutoscuolaPushToUsers({
      companyId,
      userIds: [apptA.studentId],
      title: "🔄 Scambio guida",
      body: `La tua guida del ${formatDate(apptA.startsAt)} è stata spostata al ${formatDate(apptB.startsAt)}.`,
      data: { kind: "appointment_rescheduled", appointmentId: apptB.id, startsAt: apptB.startsAt.toISOString() },
    }).catch(() => {});

    sendAutoscuolaPushToUsers({
      companyId,
      userIds: [apptB.studentId],
      title: "🔄 Scambio guida",
      body: `La tua guida del ${formatDate(apptB.startsAt)} è stata spostata al ${formatDate(apptA.startsAt)}.`,
      data: { kind: "appointment_rescheduled", appointmentId: apptA.id, startsAt: apptA.startsAt.toISOString() },
    }).catch(() => {});

    return {
      success: true,
      message: "Guide scambiate.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
