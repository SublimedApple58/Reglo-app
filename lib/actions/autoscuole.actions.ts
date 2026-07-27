"use server";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { z } from "zod";

import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { notifyAutoscuolaCaseStatusChange } from "@/lib/autoscuole/communications";
import { BOOKING_SOURCE, staffBookingSource } from "@/lib/autoscuole/booking-source";
import { broadcastWaitlistOffer, buildAvailabilityResolver, getStudentBookingBlockStatus, cancelGroupLessonParticipantAppointment } from "@/lib/actions/autoscuole-availability.actions";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  getBookingGovernanceForStudent,
  getBookingGovernanceForInstructor,
  isInstructorAppBookingEnabled,
  isStudentAppBookingEnabled,
} from "@/lib/autoscuole/booking-governance";
import {
  operationallyCancelAppointment,
  operationallyCancelAppointmentsByResource,
  removeAppointmentFromRecord,
  annulFutureAppointment,
  hardCleanupAppointmentsByStudent,
} from "@/lib/autoscuole/operational-cancellation";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { isInstructor, isOwner } from "@/lib/autoscuole/roles";
import { LICENSE_CATEGORIES, TRANSMISSIONS, isMotoLicenseCategory, vehicleServesLicense } from "@/lib/autoscuole/license";
import { FOLLOW_CAR_CATEGORY, parseFollowCarRulesFromLimits, type FollowCarRules } from "@/lib/autoscuole/follow-car";
import {
  assignMotoForStudent,
  assignMotosToStudents,
  eligibleForMotoGroup,
  groupMotoFollowCarRequired,
  instructorCanUseVehicle,
  validateMotoGroupSetup,
  MOTO_GROUP_SETUP_MESSAGES,
  type FleetVehicle,
} from "@/lib/autoscuole/group-moto";
import { findFreeGroupFollowCar, NO_FREE_FOLLOW_CAR_MESSAGE } from "@/lib/autoscuole/group-follow-assign";
import {
  buildAppointmentVehicleRows,
  reconcileAppointmentVehicles,
  resolveVehicleOwnerOnUpdate,
} from "@/lib/autoscuole/appointment-vehicles";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import { parseInstructorSettings } from "@/lib/autoscuole/instructor-clusters";
import { generateInviteCode } from "@/lib/company/invite-code";
import { notifyStudentPhaseChange } from "@/lib/autoscuole/student-phase-notifications";
import {
  processAutoscuolaAppointmentSettlementNow,
  adjustStudentLessonCredits,
  getAutoscuolaPaymentAppointmentLogs,
  getAutoscuolaPaymentsAppointments,
  getAutoscuolaPaymentsOverview,
  getAutoscuolaPaymentConfig,
  getStudentLessonCredits,
  getGroupLessonPrice,
  getGroupLessonPenaltySnapshot,
  prepareAppointmentPaymentSnapshot,
  refundLessonCreditIfEligible,
  applyLessonCreditToExistingAppointment,
} from "@/lib/autoscuole/payments";
import { generateAndUploadReceipt } from "@/lib/autoscuole/receipt";
import {
  isLessonUnpaid,
  readAutoBlockSettings,
  reconcileUnpaidAutoBlock,
  getStudentUnpaidLessonCount,
  type MemberBlockState,
} from "@/lib/autoscuole/unpaid-auto-block";
import {
  LESSON_ALL_ALLOWED_TYPES,
  getCompatibleLessonTypesForInterval,
  getLessonPolicyTypeLabel,
  getStudentLessonPolicyCoverage,
  isLessonAllowedType,
  isLessonPolicyType,
  isLessonTypeAllowedForInterval,
  isLessonTypesAllowedForInterval,
  validateLessonTypes,
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
  types: z.array(z.string()).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  status: z.string().optional(),
  instructorId: z.string().uuid(),
  vehicleId: z.string().uuid().optional().nullable(),
  // Follow car (auto al seguito) for moto lessons, when the school requires it.
  followVehicleId: z.string().uuid().optional().nullable(),
  // Extra moto vehicles a moto guida may occupy beyond the primary one. Stored as
  // additional role="primary" join rows; not auto-assigned (manual add only).
  extraMotoVehicleIds: z.array(z.string().uuid()).optional(),
  locationId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  skipWeeklyLimitCheck: z.boolean().optional(),
  skipConflictCheck: z.boolean().optional(),
  // Owner/instructor may knowingly log a lesson in the past (dopo conferma
  // esplicita lato client). Senza il flag il blocco resta attivo.
  allowPast: z.boolean().optional(),
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

const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
});

const RESCHEDULE_ALLOWED_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "proposal",
]);

const ALLOWED_STATUS_TRANSITIONS = [
  "scheduled",
  "confirmed",
  "proposal",
  "checked_in",
  "no_show",
  "completed",
  "cancelled",
] as const;

const updateAppointmentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(ALLOWED_STATUS_TRANSITIONS),
  lessonType: z.string().min(1).optional(),
  lessonTypes: z.array(z.string()).optional(),
});

const updateAppointmentDetailsSchema = z.object({
  appointmentId: z.string().uuid(),
  lessonType: z.string().optional(),
  lessonTypes: z.array(z.string()).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  /**
   * Reassign the appointment to a different company vehicle (or null to
   * unassign). Verified to belong to the company and be active. Vehicles are
   * company resources, so no per-instructor ownership check.
   */
  vehicleId: z.string().uuid().nullable().optional(),
  /**
   * Follow car (auto al seguito) for a moto lesson — the second reserved
   * vehicle. null clears it. Reconciled into the AutoscuolaAppointmentVehicle
   * join (role="follow") alongside the primary. Must differ from the primary
   * and belong to the company.
   */
  followVehicleId: z.string().uuid().nullable().optional(),
  /**
   * Extra moto vehicles occupied by a moto guida beyond the primary one. The
   * full set replaces the current extra motos (reconciled as role="primary" join
   * rows). Each must belong to the company, be a moto and differ from the primary.
   */
  extraMotoVehicleIds: z.array(z.string().uuid()).optional(),
  /**
   * New instructor for the appointment (cluster-level reassignment).
   * Verified against availability: no overlapping appointments, no manual
   * block-slot, no company holiday on that day. The vehicle stays attached
   * and the student's assignedInstructorId is NOT touched (single-lesson
   * override, not a permanent reassignment).
   */
  instructorId: z.string().uuid().optional(),
  /**
   * Nuova durata della guida in minuti (endsAt = startsAt + durationMin). A
   * differenza del reschedule, lo start non cambia: modificare solo la durata è
   * consentito anche sulle guide passate (record fix) e agli istruttori. Se la
   * durata cresce su una guida futura, si ri-controllano i conflitti veicolo/
   * istruttore sull'intervallo esteso.
   */
  durationMin: z.number().int().positive().max(600).optional(),
});

const checkInstructorAvailabilitySchema = z.object({
  instructorId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  /** Exclude this appointment from overlap detection (the one being edited). */
  excludeAppointmentId: z.string().uuid().optional(),
});

const checkStudentSlotCancellationSchema = z.object({
  studentId: z.string().uuid(),
  startsAt: z.string(),
});

const createInstructorSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
});

const createVehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
  licenseCategory: z.enum(LICENSE_CATEGORIES).optional(),
  transmission: z.enum(TRANSMISSIONS).optional(),
  // Usage mode at creation (optional). Exclusive owner, or an explicit shared
  // pool; omitting both leaves the vehicle "open to all" (the default).
  assignedInstructorId: z.string().uuid().nullable().optional(),
  poolInstructorIds: z.array(z.string().uuid()).optional(),
  followsInstructorAvailability: z.boolean().optional(),
});

const instructorSettingsSchema = z.object({
  bookingSlotDurations: z.array(z.number().int().min(30).max(120)).optional(),
  roundedHoursOnly: z.boolean().optional(),
  appBookingActors: z.enum(["students", "instructors", "both"]).optional(),
  instructorBookingMode: z.enum(["manual_full", "manual_engine"]).optional(),
  studentBookingMode: z.enum(["engine", "free_choice"]).optional(),
  swapEnabled: z.boolean().optional(),
  studentCancellationEnabled: z.boolean().optional(),
  swapNotifyMode: z.enum(["all", "available_only"]).optional(),
  bookingCutoffEnabled: z.boolean().optional(),
  bookingCutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weeklyBookingLimitEnabled: z.boolean().optional(),
  weeklyBookingLimit: z.number().int().min(1).max(50).optional(),
  emptySlotNotificationEnabled: z.boolean().optional(),
  emptySlotNotificationTarget: z.enum(["all", "availability_matching"]).optional(),
  emptySlotNotificationTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  restrictedTimeRangeEnabled: z.boolean().optional(),
  restrictedTimeRangeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  restrictedTimeRangeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weeklyAbsenceEnabled: z.boolean().optional(),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  availabilityMode: z.enum(["default", "publication"]).optional(),
}).optional();

const updateInstructorSchema = z.object({
  instructorId: z.string().uuid(),
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  status: z.string().optional(),
  userId: z.string().uuid().optional(),
  autonomousMode: z.boolean().optional(),
  // Display color (hex). Null = back to automatic palette.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  settings: instructorSettingsSchema,
  assignStudentIds: z.array(z.string().uuid()).optional(),
});

const updateVehicleSchema = z.object({
  vehicleId: z.string().uuid(),
  name: z.string().min(1).optional(),
  plate: z.string().optional().nullable(),
  // active | inactive | maintenance.
  status: z.string().optional(),
  // Exclusive owner: null clears it, a uuid reserves the vehicle to that
  // instructor (an instructor may own several). Omitting leaves it untouched.
  assignedInstructorId: z.string().uuid().nullable().optional(),
  // Explicit shared pool (the instructors allowed to draw from this vehicle).
  // [] clears the pool (→ open to all); omitting leaves it untouched.
  poolInstructorIds: z.array(z.string().uuid()).optional(),
  followsInstructorAvailability: z.boolean().optional(),
  // License category + transmission this vehicle serves (Vehicles module).
  licenseCategory: z.enum(LICENSE_CATEGORIES).optional(),
  transmission: z.enum(TRANSMISSIONS).optional(),
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
  const expanded = new Set(allowed);
  if (expanded.has("INSTRUCTOR") || expanded.has("OWNER")) {
    expanded.add("INSTRUCTOR_OWNER");
  }
  if (!membership.autoscuolaRole || !expanded.has(membership.autoscuolaRole)) {
    throw new Error("Operazione non consentita.");
  }
};

const canManageStudentCredits = (membership: {
  role: string;
  autoscuolaRole: string | null;
}) =>
  membership.role === "admin" ||
  isOwner(membership.autoscuolaRole);

const getOwnInstructorProfile = async (companyId: string, userId: string) =>
  prisma.autoscuolaInstructor.findFirst({
    where: {
      companyId,
      userId,
      status: { not: "inactive" },
    },
    select: { id: true },
  });

const REQUIRED_LESSONS_COUNT = 6;
const LESSON_TYPE_OPTIONS = LESSON_ALL_ALLOWED_TYPES;
const LESSON_TYPE_SET = new Set<string>(LESSON_TYPE_OPTIONS);
const INSTRUCTOR_ALLOWED_STATUSES = new Set(["checked_in", "no_show"]);
const DRIVING_LESSON_EXCLUDED_TYPES = new Set(["esame"]);
const OPERATIONAL_CANCELLABLE_STATUSES = [
  "scheduled",
  "confirmed",
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

const getInstructorWindowOpenTimeLabel = (startsAt: Date) =>
  new Date(startsAt.getTime() - 10 * 60 * 1000).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });

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
  cancellationKind,
  actorRole,
}: {
  companyId: string;
  actorUserId: string;
  appointment: {
    id: string;
    studentId: string;
    startsAt: Date;
    instructorId: string | null;
  };
  cancellationKind: "manual_cancel" | "permanent_cancel";
  actorRole: "instructor" | "owner" | "admin";
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
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  });
  const timeLabel = appointment.startsAt.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  const slotLabel = `${dateLabel} alle ${timeLabel}`;
  const instrLabel = instructor?.name ? ` con ${instructor.name}` : "";

  // Students in manual_full clusters cannot book from the app — omit the CTA.
  const { isStudentInManualFullCluster } = await import("@/lib/autoscuole/instructor-clusters");
  const manualFull = await isStudentInManualFullCluster(companyId, appointment.studentId);
  const cta = manualFull
    ? "L'istruttore ti contatterà per riprogrammarla."
    : "Prenota una nuova guida dall'app quando vuoi.";

  let title: string;
  let body: string;

  if (cancellationKind === "permanent_cancel") {
    title = "❌ Guida annullata definitivamente";
    if (actorRole === "instructor") {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dall'istruttore. ${cta}`;
    } else {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dalla segreteria. ${cta}`;
    }
  } else {
    title = "❌ Guida annullata";
    if (actorRole === "instructor") {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dall'istruttore. ${cta}`;
    } else {
      body = `La tua guida di ${slotLabel}${instrLabel} è stata annullata dalla segreteria. ${cta}`;
    }
  }

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

const formatAutoscuolaSlotLabel = (when: Date) => {
  const dateLabel = when.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  });
  const timeLabel = when.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateLabel} alle ${timeLabel}`;
};

const notifyAppointmentRescheduled = async ({
  companyId,
  actorUserId,
  actorRole,
  appointment,
  oldStartsAt,
}: {
  companyId: string;
  actorUserId: string;
  actorRole: "instructor" | "owner" | "admin";
  appointment: {
    id: string;
    studentId: string;
    startsAt: Date;
    endsAt: Date | null;
    instructorId: string | null;
  };
  oldStartsAt: Date;
}) => {
  const oldLabel = formatAutoscuolaSlotLabel(oldStartsAt);
  const newLabel = formatAutoscuolaSlotLabel(appointment.startsAt);

  const [studentUser, instructor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: appointment.studentId },
      select: { email: true },
    }),
    appointment.instructorId
      ? prisma.autoscuolaInstructor.findFirst({
          where: { id: appointment.instructorId, companyId },
          select: { id: true, name: true, userId: true },
        })
      : Promise.resolve(null),
  ]);

  const instrLabel = instructor?.name ? ` con ${instructor.name}` : "";
  const title = "🔄 Guida spostata";
  const actorSuffix = actorRole === "instructor" ? "dall'istruttore" : "dalla segreteria";
  const body = `La tua guida del ${oldLabel}${instrLabel} è stata spostata ${actorSuffix} al ${newLabel}.`;

  // Reschedule is informational (not a booking invitation), so we always
  // notify the student — even in manual_full clusters.
  const shouldNotifyStudent = actorUserId !== appointment.studentId;

  if (shouldNotifyStudent) {
    try {
      await sendAutoscuolaPushToUsers({
        companyId,
        userIds: [appointment.studentId],
        title,
        body,
        data: {
          kind: "appointment_rescheduled",
          appointmentId: appointment.id,
          startsAt: appointment.startsAt.toISOString(),
          oldStartsAt: oldStartsAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Appointment reschedule push error", error);
    }

    if (studentUser?.email) {
      try {
        await sendDynamicEmail({
          to: studentUser.email,
          subject: title,
          body,
        });
      } catch (error) {
        console.error("Appointment reschedule email error", error);
      }
    }
  }

  // Notify the instructor only when the segreteria/owner moved the lesson.
  if (
    (actorRole === "owner" || actorRole === "admin") &&
    instructor?.userId &&
    instructor.userId !== actorUserId
  ) {
    try {
      await sendAutoscuolaPushToUsers({
        companyId,
        userIds: [instructor.userId],
        title: "🔄 Guida spostata",
        body: `Una guida è stata spostata dal ${oldLabel} al ${newLabel}.`,
        data: {
          kind: "appointment_rescheduled",
          appointmentId: appointment.id,
          startsAt: appointment.startsAt.toISOString(),
          oldStartsAt: oldStartsAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Appointment reschedule instructor push error", error);
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

const toStudentProfile = (
  user: UserSnapshot,
  createdAt: Date,
  neverAccessedSet?: Set<string>,
) => {
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
    // Present only when the caller resolved it (agenda directory + students list).
    ...(neverAccessedSet ? { neverAccessed: neverAccessedSet.has(user.id) } : {}),
  };
};

const STUDENT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
} as const;

/**
 * Set of userIds that have NEVER accessed the mobile app — no `MobileAccessToken`
 * (minted on every mobile login/signup/invite-accept) AND no `MobilePushDevice`
 * (created on first app open with push registration). The presence of either row
 * proves the account was used at least once; the absence of both is our best
 * "never accessed" signal. Lets the web app flag students whose owner-created
 * account is still unused (they get no in-app reminders). Batched over the given
 * ids, mirroring how `buildAppointmentGridFlags` batches its lookups.
 */
async function buildNeverAccessedUserIds(userIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return new Set<string>();
  const [tokens, devices] = await Promise.all([
    prisma.mobileAccessToken.findMany({
      where: { userId: { in: ids } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.mobilePushDevice.findMany({
      where: { userId: { in: ids } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);
  const accessed = new Set<string>();
  for (const t of tokens) accessed.add(t.userId);
  for (const d of devices) accessed.add(d.userId);
  return new Set(ids.filter((id) => !accessed.has(id)));
}

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

  const neverAccessed = await buildNeverAccessedUserIds(
    members.map((member) => member.user.id),
  );

  return members.map((member) => ({
    ...toStudentProfile(member.user, member.createdAt, neverAccessed),
    assignedInstructorId: member.assignedInstructorId ?? null,
    // Pursued license path — surfaced so the booking pickers can show a badge
    // and validate vehicle⇄student eligibility (moto hierarchy).
    licenseCategory: member.licenseCategory ?? null,
    transmission: member.transmission ?? null,
    // Fase + flag "pronto esame": il picker esame differenzia i PRATICA pronti.
    studentPhase: member.studentPhase,
    examReady: member.examReady,
    examReadyAt: member.examReadyAt ? member.examReadyAt.toISOString() : null,
  }));
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
          some: { companyId, autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
        },
      },
    },
    include: {
      _count: { select: { assignedStudents: true } },
    },
    orderBy: { name: "asc" },
  });

const listAutoscuolaVehiclesReadOnly = async (companyId: string) =>
  prisma.autoscuolaVehicle.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: { poolMembers: { select: { instructorId: true } } },
  });

const mapCaseStudent = (student: UserSnapshot | null) => {
  // Studentless exam placeholder (an esame created before its participants are
  // known). Surface a synthetic "Esame" pseudo-student so downstream renderers
  // never dereference a null student; consumers detect it via the `exam-empty`
  // id prefix. See materializeExamSlot.
  if (!student) {
    return {
      id: "exam-empty",
      firstName: "Esame",
      lastName: "",
      email: null,
      phone: null,
    };
  }
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

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const [
      studentsCount,
      todayAppointmentsCount,
      upcomingAppointmentsCount,
      activeInstructorsCount,
    ] = await Promise.all([
      prisma.companyMember.count({
        where: {
          companyId,
          autoscuolaRole: "STUDENT",
        },
      }),
      prisma.autoscuolaAppointment.count({
        where: {
          companyId,
          startsAt: { gte: todayStart, lt: todayEnd },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.autoscuolaAppointment.count({
        where: {
          companyId,
          startsAt: { gte: now, lte: inSevenDays },
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.autoscuolaInstructor.count({
        where: {
          companyId,
          status: "active",
          userId: { not: null },
          user: {
            companyMembers: {
              some: { companyId, autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        studentsCount,
        todayAppointmentsCount,
        upcomingAppointmentsCount,
        activeInstructorsCount,
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

    // Extended exam visibility for instructors:
    // - Non-autonomous instructor: sees ALL company exams
    // - Autonomous instructor: sees exams where they are the accompanying instructor
    //   OR where at least one involved student is in their cluster
    let examVisibilityClause: Prisma.AutoscuolaAppointmentWhereInput | null = null;
    if (input.instructorId) {
      const instructorRecord = await prisma.autoscuolaInstructor.findFirst({
        where: { id: input.instructorId, companyId },
        select: { id: true, autonomousMode: true },
      });
      if (instructorRecord) {
        if (instructorRecord.autonomousMode) {
          const clusterMembers = await prisma.companyMember.findMany({
            where: {
              companyId,
              autoscuolaRole: "STUDENT",
              assignedInstructorId: instructorRecord.id,
            },
            select: { userId: true },
          });
          const clusterStudentIds = clusterMembers.map((m) => m.userId);
          examVisibilityClause = {
            type: "esame",
            OR: [
              { instructorId: instructorRecord.id },
              ...(clusterStudentIds.length
                ? [{ studentId: { in: clusterStudentIds } }]
                : []),
            ],
          };
        } else {
          // Non-autonomous: see all exams
          examVisibilityClause = { type: "esame" };
        }
      }
    }

    const baseWhere: Prisma.AutoscuolaAppointmentWhereInput = {
      companyId,
      startsAt: { gte: from, lt: to },
      ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(normalizedType ? { type: normalizedType } : {}),
    };
    const appointmentsWhere: Prisma.AutoscuolaAppointmentWhereInput =
      input.instructorId && examVisibilityClause
        ? {
            ...baseWhere,
            OR: [
              { instructorId: input.instructorId },
              examVisibilityClause,
            ],
          }
        : input.instructorId
          ? { ...baseWhere, instructorId: input.instructorId }
          : baseWhere;

    const [appointments, students, instructors, vehicles, instructorBlocks, holidays, agendaLimits, lastInstructorRows] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: appointmentsWhere,
        select: {
          id: true,
          companyId: true,
          studentId: true,
          caseId: true,
          slotId: true,
          type: true,
          types: true,
          rating: true,
          notes: true,
          status: true,
          startsAt: true,
          endsAt: true,
          instructorId: true,
          vehicleId: true,
          locationId: true,
          groupLessonId: true,
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
              transmission: true,
              licenseCategory: true,
            },
          },
          // All reserved vehicles. Mapped below into `followVehicle` (the
          // role="follow" car) and `extraMotoVehicles` (extra role="primary"
          // motos beyond the representative `vehicleId`) for agenda rendering.
          appointmentVehicles: {
            select: {
              role: true,
              vehicleId: true,
              vehicle: {
                select: {
                  id: true,
                  name: true,
                  transmission: true,
                  licenseCategory: true,
                },
              },
            },
          },
          location: {
            select: {
              id: true,
              companyId: true,
              name: true,
              address: true,
              latitude: true,
              longitude: true,
              placeId: true,
              isDefault: true,
              isPrecise: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
        take: limit,
      }),
      listDirectoryStudents(companyId),
      listAutoscuolaInstructorsReadOnly(companyId),
      listAutoscuolaVehiclesReadOnly(companyId),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          startsAt: { lt: to },
          endsAt: { gt: from },
          ...(input.instructorId ? { instructorId: input.instructorId } : {}),
        },
        select: {
          id: true,
          companyId: true,
          instructorId: true,
          startsAt: true,
          endsAt: true,
          reason: true,
          description: true,
          recurrenceGroupId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.autoscuolaHoliday.findMany({
        where: {
          companyId,
          date: { gte: from, lte: to },
        },
        select: {
          date: true,
          label: true,
        },
        orderBy: { date: "asc" },
      }),
      getCachedCompanyServiceLimits(companyId),
      // Ultimo istruttore con cui ogni allievo ha GIÀ guidato: preseleziona
      // l'istruttore nel form di creazione quando l'allievo non ne ha uno
      // assegnato. DISTINCT ON + indice su studentId: una riga per allievo.
      prisma.$queryRaw<Array<{ studentId: string; instructorId: string }>>`
        SELECT DISTINCT ON ("studentId") "studentId", "instructorId"
        FROM "AutoscuolaAppointment"
        WHERE "companyId" = ${companyId}::uuid
          AND "instructorId" IS NOT NULL
          AND "status" <> 'cancelled'
          AND "startsAt" <= NOW()
        ORDER BY "studentId", "startsAt" DESC
      `,
    ]);
    const agendaVehiclesEnabled =
      (agendaLimits as Record<string, unknown>).vehiclesEnabled !== false;
    const agendaGroupLessonsEnabled =
      (agendaLimits as Record<string, unknown>).groupLessonsEnabled === true;
    const agendaFollowCarRules = parseFollowCarRulesFromLimits(
      agendaLimits as Record<string, unknown>,
    );

    // Grid color flags (mandatoryLesson / examNextDay) — same annotation as
    // getAutoscuolaAppointmentsFiltered; the mobile grid reads agenda data
    // from THIS bootstrap, so they must be present here too.
    // Both derivations below depend ONLY on `appointments`, not on each other —
    // run them in one parallel wave instead of two sequential awaits.
    const agendaGlIds = [
      ...new Set(appointments.map((a) => a.groupLessonId).filter(Boolean) as string[]),
    ];
    const [gridFlags, agendaGlInfo] = await Promise.all([
      buildAppointmentGridFlags(companyId, appointments),
      // Group lesson capacity + kind per row: agenda consumers need the REAL
      // capacity (mobile seat dots) and the kind ("standard"|"moto") for the
      // dedicated moto-group colour.
      agendaGlIds.length
        ? prisma.autoscuolaGroupLesson
            .findMany({
              where: { id: { in: agendaGlIds } },
              select: { id: true, capacity: true, kind: true },
            })
            .then((rows) => new Map(rows.map((g) => [g.id, g])))
        : Promise.resolve(new Map<string, { id: string; capacity: number; kind: string }>()),
    ]);

    const mappedAppointments = appointments.map((appointment) => {
      const { appointmentVehicles, ...rest } = appointment;
      // Auto al seguito: the role="follow" join's vehicle (null when none).
      // Ternary (not `?? null`) so the type stays nullable under the project's
      // non-strict index access, matching the gl-empty placeholder below.
      const followRow = appointmentVehicles.find((v) => v.role === "follow");
      const followVehicle = followRow ? followRow.vehicle : null;
      // Extra motos: role="primary" rows beyond the representative vehicleId.
      const extraMotoVehicles = appointmentVehicles
        .filter((v) => v.role === "primary" && v.vehicleId !== rest.vehicleId)
        .map((v) => v.vehicle);
      return {
        ...rest,
        case: null,
        // Unique id per empty-exam placeholder (mirrors the gl-empty convention)
        // so the client can key/track it and the exam panel can filter it out.
        student: appointment.student
          ? mapCaseStudent(appointment.student)
          : { id: `exam-empty:${appointment.id}`, firstName: "Esame", lastName: "", email: null, phone: null },
        followVehicle,
        extraMotoVehicles,
        ...(gridFlags.get(appointment.id) ?? {}),
        groupLessonCapacity: appointment.groupLessonId
          ? agendaGlInfo.get(appointment.groupLessonId)?.capacity ?? null
          : null,
        groupLessonKind: appointment.groupLessonId
          ? agendaGlInfo.get(appointment.groupLessonId)?.kind ?? null
          : null,
      };
    });

    // Empty group lessons (0 active participants) have no appointment rows, so
    // they'd be invisible in the agenda — and thus un-manageable / un-cancellable,
    // leaving their student invites orphaned. Synthesize ONE placeholder row per
    // empty, still-scheduled group lesson (id `gl-empty:<glId>`). Consumers
    // (web `regularAppointments`, mobile `weeklyAgenda`/`timelineItems`) treat a
    // `gl-empty:` row as 0 participants. Skip when filters exclude group lessons.
    const wantsGroupLessons =
      agendaGroupLessonsEnabled &&
      (!normalizedType || normalizedType === "group_lesson") &&
      (!normalizedStatus || normalizedStatus === "scheduled");
    if (wantsGroupLessons) {
      const emptyGroupLessons = await prisma.autoscuolaGroupLesson.findMany({
        where: {
          companyId,
          status: "scheduled",
          startsAt: { gte: from, lt: to },
          ...(input.instructorId ? { instructorId: input.instructorId } : {}),
          ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
          appointments: { none: { status: { in: GROUP_LESSON_ACTIVE_STATUSES } } },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          notes: true,
          capacity: true,
          kind: true,
          instructorId: true,
          vehicleId: true,
          instructor: { select: { id: true, name: true } },
          vehicle: { select: { id: true, name: true, transmission: true } },
        },
        orderBy: { startsAt: "asc" },
      });
      for (const gl of emptyGroupLessons) {
        mappedAppointments.push({
          id: `gl-empty:${gl.id}`,
          companyId,
          studentId: "",
          caseId: null,
          slotId: null,
          type: "group_lesson",
          types: [],
          rating: null,
          notes: gl.notes,
          status: "scheduled",
          startsAt: gl.startsAt,
          endsAt: gl.endsAt,
          instructorId: gl.instructorId,
          vehicleId: gl.vehicleId,
          locationId: null,
          groupLessonId: gl.id,
          cancellationKind: null,
          cancellationReason: null,
          replacedByAppointmentId: null,
          createdAt: gl.startsAt,
          updatedAt: gl.startsAt,
          case: null,
          student: { id: `gl-empty:${gl.id}`, firstName: "Guida di gruppo", lastName: "", email: null, phone: null },
          instructor: gl.instructor,
          vehicle: gl.vehicle,
          followVehicle: null,
          extraMotoVehicles: [],
          location: null,
          groupLessonCapacity: gl.capacity,
          groupLessonKind: gl.kind,
        } as (typeof mappedAppointments)[number]);
      }
    }

    const lastInstructorByStudent = new Map(
      lastInstructorRows.map((row) => [row.studentId, row.instructorId]),
    );

    return {
      success: true,
      data: {
        appointments: mappedAppointments,
        students: students.map((student) => ({
          ...student,
          lastInstructorId: lastInstructorByStudent.get(student.id) ?? null,
        })),
        instructors,
        // Surface poolInstructorIds (from the poolMembers relation) so the web
        // agenda can filter vehicle pickers to what each instructor may use,
        // matching the mobile manage-lesson flow.
        vehicles: vehicles.map(({ poolMembers, ...v }) => ({
          ...v,
          poolInstructorIds: poolMembers.map((m) => m.instructorId),
        })),
        vehiclesEnabled: agendaVehiclesEnabled,
        groupLessonsEnabled: agendaGroupLessonsEnabled,
        followCarRules: agendaFollowCarRules,
        instructorBlocks,
        holidays: holidays.map((h) => ({
          date: h.date.toISOString(),
          label: h.label,
        })),
        meta: {
          from,
          to,
          generatedAt: new Date(),
          count: mappedAppointments.length,
        },
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getInstructorAvailabilityForAgenda(input: {
  from: string;
  to: string;
}): Promise<{
  success: boolean;
  data?: Array<{
    instructorId: string;
    instructorName: string;
    days: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
  }>;
  message?: string;
}> {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const fromDate = toValidDate(input.from);
    const toDate = toValidDate(input.to);
    if (!fromDate || !toDate) {
      return { success: false, message: "Date non valide." };
    }

    const instructors = await prisma.autoscuolaInstructor.findMany({
      where: {
        companyId,
        status: { not: "inactive" },
        userId: { not: null },
        user: {
          companyMembers: {
            some: { companyId, autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (!instructors.length) {
      return { success: true, data: [] };
    }

    const instructorIds = instructors.map((i) => i.id);

    const resolver = await buildAvailabilityResolver(
      companyId,
      "instructor",
      instructorIds,
      fromDate,
      toDate,
    );

    const DOW_MAP: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dowFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "Europe/Rome",
    });

    // Build list of dates in range
    const dates: Date[] = [];
    const cursor = new Date(fromDate);
    while (cursor < toDate) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const data: Array<{
      instructorId: string;
      instructorName: string;
      days: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
    }> = [];

    for (const instructor of instructors) {
      const days: Record<string, Array<{ startMinutes: number; endMinutes: number }>> = {};

      for (const date of dates) {
        const record = resolver.resolve(instructor.id, date);
        if (!record) continue;

        const romeDow = dowFormatter.format(date);
        const dayOfWeek = DOW_MAP[romeDow] ?? date.getDay();
        if (!record.daysOfWeek.includes(dayOfWeek)) continue;

        if (record.ranges.length > 0) {
          const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          days[ymd] = record.ranges.map((r) => ({
            startMinutes: r.startMinutes,
            endMinutes: r.endMinutes,
          }));
        }
      }

      data.push({
        instructorId: instructor.id,
        instructorName: instructor.name,
        days,
      });
    }

    return { success: true, data };
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
    return {
      success: true,
      data: members.map((m) => ({
        ...toStudentProfile(m.user, m.createdAt),
        assignedInstructorId: m.assignedInstructorId ?? null,
        studentPhase: m.studentPhase,
        licenseCategory: m.licenseCategory ?? null,
        transmission: m.transmission ?? null,
        groupLessonsOptIn: m.groupLessonsOptIn ?? false,
        examReady: m.examReady,
        examReadyAt: m.examReadyAt ? m.examReadyAt.toISOString() : null,
      })),
    };
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
  types?: string[];
  rating?: number | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  instructor?: { name: string } | null;
  vehicle?: { name: string } | null;
  manualPaymentStatus?: string | null;
  creditApplied?: boolean | null;
  lateCancellationAction?: string | null;
};

// "Da pagare" = guida che la scuola deve ancora incassare. Stessa definizione del
// tab guide del drawer allievo (AutoscuoleStudentsPage): effettuata (o penale
// addebitata), NON coperta da credito, non ancora saldata. Il ramo "effettuata"
// vale solo in pagamento manuale. Tenere allineato con il predicato client.
function isCompanyManualMode(config: {
  enabled: boolean;
  lessonCreditFlowEnabled: boolean;
  lessonCreditsRequired: boolean;
}): boolean {
  return (
    (!config.enabled && !config.lessonCreditFlowEnabled) ||
    (config.lessonCreditFlowEnabled && !config.lessonCreditsRequired)
  );
}

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
    const allTypes = lesson.types?.length ? lesson.types : [lesson.type];
    for (const t of allTypes) {
      const normalizedType = normalizeLessonType(t) || "altro";
      byLessonTypeMap.set(
        normalizedType,
        (byLessonTypeMap.get(normalizedType) ?? 0) + 1,
      );
    }
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
      const resolvedTypes = lesson.types?.length
        ? lesson.types.map((t) => normalizeLessonType(t) || "altro")
        : [normalizeLessonType(lesson.type) || "altro"];
      return {
        id: lesson.id,
        caseId: lesson.caseId,
        type: resolvedTypes[0],
        types: resolvedTypes,
        rating: lesson.rating ?? null,
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
    const neverAccessedSet = await buildNeverAccessedUserIds(
      members.map((m) => m.user.id),
    );
    const students = members.map((m) => ({
      ...toStudentProfile(m.user, m.createdAt, neverAccessedSet),
      assignedInstructorId: m.assignedInstructorId ?? null,
      studentPhase: m.studentPhase,
      licenseCategory: m.licenseCategory ?? null,
      transmission: m.transmission ?? null,
      groupLessonsOptIn: m.groupLessonsOptIn ?? false,
      examReady: m.examReady,
      examReadyAt: m.examReadyAt ? m.examReadyAt.toISOString() : null,
    }));
    if (!students.length) return { success: true, data: [] };

    const memberBlockStateMap = new Map<string, MemberBlockState>();
    for (const m of members) {
      memberBlockStateMap.set(m.userId, {
        bookingBlocked: m.bookingBlocked,
        bookingBlockReason:
          (m.bookingBlockReason as MemberBlockState["bookingBlockReason"]) ?? null,
        unpaidBlockClearedAtCount: m.unpaidBlockClearedAtCount ?? null,
      });
    }
    const autoBlockSettings = readAutoBlockSettings(
      await getCachedCompanyServiceLimits(companyId),
    );

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
          theoryExamAt: true,
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
          manualPaymentStatus: true,
          creditApplied: true,
          lateCancellationAction: true,
        },
        take: 5000,
      }),
    ]);

    const manualMode = isCompanyManualMode(
      await getAutoscuolaPaymentConfig({ companyId }),
    );

    const casesByStudent = new Map<string, DrivingRegisterCaseRow[]>();
    for (const item of cases) {
      const current = casesByStudent.get(item.studentId) ?? [];
      current.push(item);
      casesByStudent.set(item.studentId, current);
    }

    const lessonsByStudent = new Map<string, DrivingRegisterLessonRow[]>();
    // Drop studentless exam placeholders (no student register); the typed
    // predicate also removes the nullable from studentId.
    const studentLessonRows = lessons.filter(
      (l): l is (typeof lessons)[number] & { studentId: string } => l.studentId != null,
    );
    for (const item of studentLessonRows) {
      const current = lessonsByStudent.get(item.studentId) ?? [];
      current.push(item);
      lessonsByStudent.set(item.studentId, current);
    }

    const rows = await Promise.all(
      students.map(async (student) => {
        const studentCases = casesByStudent.get(student.id) ?? [];
        const register = buildDrivingRegisterData({
          cases: studentCases,
          lessons: lessonsByStudent.get(student.id) ?? [],
        });
        const studentLessons = lessonsByStudent.get(student.id) ?? [];
        const manualUnpaid = studentLessons.filter((l) => isLessonUnpaid(l, manualMode)).length;
        // Riconcilia il blocco automatico per debito: usa il conteggio appena
        // calcolato (nessuna query extra) e persiste solo se lo stato cambia.
        const blockState = memberBlockStateMap.get(student.id) ?? {
          bookingBlocked: false,
          bookingBlockReason: null,
          unpaidBlockClearedAtCount: null,
        };
        const nextBlock = await reconcileUnpaidAutoBlock({
          companyId,
          userId: student.id,
          state: blockState,
          unpaidCount: manualUnpaid,
          settings: autoBlockSettings,
        });
        const latestCase = studentCases
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const theoryExamAt = (latestCase as { theoryExamAt?: Date | null } | undefined)?.theoryExamAt ?? null;
        return {
          ...student,
          bookingBlocked: nextBlock.bookingBlocked,
          bookingBlockReason: nextBlock.bookingBlockReason,
          activeCase: register.activeCase,
          summary: register.summary,
          manualUnpaid,
          theoryExamAt: theoryExamAt ? theoryExamAt.toISOString() : null,
        };
      }),
    );

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function sendBroadcastPush(input: {
  title: string;
  body: string;
  role?: "OWNER" | "INSTRUCTOR" | "STUDENT" | null;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const where: Record<string, unknown> = { companyId: membership.companyId };
    if (input.role) where.autoscuolaRole = input.role;
    const members = await prisma.companyMember.findMany({
      where,
      select: { userId: true },
    });
    if (!members.length) {
      return { success: false, message: "Nessun utente trovato." };
    }
    const result = await sendAutoscuolaPushToUsers({
      companyId: membership.companyId,
      userIds: members.map((m) => m.userId),
      title: input.title,
      body: input.body,
      data: { kind: "broadcast" },
    });
    return { success: true, data: { ...result, targeted: members.length } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function clearPushDevices() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const userIds = (await prisma.companyMember.findMany({
      where: { companyId: membership.companyId },
      select: { userId: true },
    })).map((m) => m.userId);
    const deleted = await prisma.mobilePushDevice.deleteMany({
      where: { userId: { in: userIds } },
    });
    return { success: true, data: { deleted: deleted.count } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function sendTestPushToStudent(studentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const student = await prisma.companyMember.findFirst({
      where: { companyId: membership.companyId, userId: studentId },
      include: { user: { select: { name: true } } },
    });
    if (!student) {
      return { success: false, message: "Allievo non trovato." };
    }
    const result = await sendAutoscuolaPushToUsers({
      companyId: membership.companyId,
      userIds: [studentId],
      title: "🔔 Test notifica Reglo",
      body: "Se vedi questo messaggio, le notifiche push funzionano correttamente!",
      data: { kind: "test_push" },
    });
    return { success: true, data: result };
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
          theoryExamAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.autoscuolaAppointment.findMany({
        // record_cleanup = guida rimossa dal titolare ("Cancella"): sparisce
        // dallo storico (e quindi da "Tutte"/"Annullate") e da tutti i conteggi.
        // ATTENZIONE: in Prisma `{ not: "x" }` NON include le righe con valore
        // NULL (semantica SQL: `col <> 'x'` è NULL per col NULL). Le guide normali
        // hanno cancellationKind null → serve l'OR esplicito, altrimenti sparirebbero
        // TUTTE le guide non cancellate dallo storico di ogni allievo.
        where: {
          companyId,
          studentId,
          OR: [
            { cancellationKind: null },
            { cancellationKind: { not: "record_cleanup" } },
          ],
        },
        select: {
          id: true,
          studentId: true,
          caseId: true,
          type: true,
          types: true,
          rating: true,
          status: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          cancellationKind: true,
          cancellationReason: true,
          penaltyCutoffAt: true,
          penaltyAmount: true,
          paymentRequired: true,
          manualPaymentStatus: true,
          creditApplied: true,
          lateCancellationAction: true,
          notes: true,
          createdAt: true,
          groupLessonId: true,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
        },
        orderBy: { startsAt: "desc" },
      }),
    ]);

    // Group-lesson fill (N/M) + kind, so the student history can flag which
    // lessons were group lessons and how many students were on them.
    const registerGlInfo = await fetchGroupLessonFill(lessons.map((l) => l.groupLessonId));

    // Query is scoped to a single studentId, so every row has that student; the
    // typed filter is a no-op at runtime that drops the nullable from the type.
    const lessonRows = lessons.filter(
      (l): l is (typeof lessons)[number] & { studentId: string } => l.studentId != null,
    );
    const register = buildDrivingRegisterData({ cases, lessons: lessonRows });
    const student = toStudentProfile(studentMembership.user, studentMembership.createdAt);

    // Exam priority info
    const { getExamPriorityInfo } = await import("@/lib/autoscuole/exam-priority");
    const examPriorityInfo = await getExamPriorityInfo(companyId, studentId);

    const now = new Date();
    const booked = lessons.length;
    const completed = lessons.filter((l) => normalizeStatus(l.status) === "completed").length;
    const cancelled = lessons.filter((l) => normalizeStatus(l.status) === "cancelled").length;
    const upcoming = lessons.filter(
      (l) =>
        ["scheduled", "confirmed"].includes(normalizeStatus(l.status)) &&
        l.startsAt > now,
    ).length;
    const manualMode = isCompanyManualMode(
      await getAutoscuolaPaymentConfig({ companyId }),
    );
    const manualUnpaid = lessons.filter((l) => isLessonUnpaid(l, manualMode)).length;

    // Riconcilia il blocco automatico per debito con il conteggio appena calcolato.
    const autoBlock = await reconcileUnpaidAutoBlock({
      companyId,
      userId: studentId,
      state: {
        bookingBlocked: studentMembership.bookingBlocked,
        bookingBlockReason:
          (studentMembership.bookingBlockReason as MemberBlockState["bookingBlockReason"]) ??
          null,
        unpaidBlockClearedAtCount: studentMembership.unpaidBlockClearedAtCount ?? null,
      },
      unpaidCount: manualUnpaid,
      settings: readAutoBlockSettings(await getCachedCompanyServiceLimits(companyId)),
    });

    const latestCaseTheoryExamAt = cases
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.theoryExamAt ?? null;

    return {
      success: true,
      data: {
        student,
        bookingBlocked: autoBlock.bookingBlocked,
        bookingBlockReason: autoBlock.bookingBlockReason,
        weeklyBookingLimitExempt: studentMembership.weeklyBookingLimitExempt,
        examPriorityOverride: studentMembership.examPriorityOverride,
        examPriorityActive: examPriorityInfo.active,
        examDate: examPriorityInfo.examDate,
        studentPhase: studentMembership.studentPhase,
        examReady: studentMembership.examReady,
        examReadyAt: studentMembership.examReadyAt
          ? studentMembership.examReadyAt.toISOString()
          : null,
        licenseCategory: studentMembership.licenseCategory ?? null,
        transmission: studentMembership.transmission ?? null,
        groupLessonsOptIn: studentMembership.groupLessonsOptIn ?? false,
        quizSeatGrantedAt: studentMembership.quizSeatGrantedAt
          ? studentMembership.quizSeatGrantedAt.toISOString()
          : null,
        theoryExamAt: latestCaseTheoryExamAt
          ? latestCaseTheoryExamAt.toISOString()
          : null,
        activeCase: register.activeCase,
        summary: register.summary,
        extendedSummary: { booked, completed, cancelled, upcoming, manualUnpaid },
        byLessonType: register.byLessonType,
        lessons: register.lessons.map((lesson) => {
          const raw = lessons.find((l) => l.id === lesson.id);
          return {
            ...lesson,
            cancelledAt: raw?.cancelledAt ?? null,
            cancellationKind: raw?.cancellationKind ?? null,
            cancellationReason: raw?.cancellationReason ?? null,
            penaltyCutoffAt: raw?.penaltyCutoffAt ?? null,
            penaltyAmount: raw?.penaltyAmount != null ? Number(raw.penaltyAmount) : null,
            paymentRequired: raw?.paymentRequired ?? false,
            manualPaymentStatus: raw?.manualPaymentStatus ?? null,
            creditApplied: raw?.creditApplied ?? false,
            lateCancellationAction: raw?.lateCancellationAction ?? null,
            notes: raw?.notes ?? null,
            createdAt: raw?.createdAt ?? null,
            group: raw?.groupLessonId ? registerGlInfo.get(raw.groupLessonId) ?? null : null,
          };
        }),
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

/** Calendar day (YYYY-MM-DD) of a timestamp in the company timezone. */
const romeDayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** The calendar day after a YYYY-MM-DD key (DST-safe: pure date math). */
const nextDayKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
};

/**
 * Per-appointment flags for the mobile agenda grid colors:
 *   - `mandatoryLesson`: the guide is among the student's first
 *     REQUIRED_LESSONS_COUNT (6) individual 60-MINUTE driving lessons
 *     (chronological, non-cancelled, group lessons and exams excluded).
 *     Guides of other durations are not mandatory lessons at all: they don't
 *     get the flag AND don't consume one of the 6 slots (criterio 2026-06-12).
 *   - `examNextDay`: the student has a driving exam the calendar day after
 *     this lesson (from `AutoscuolaCase.drivingExamAt` OR an exam-type
 *     appointment) — these guides are highlighted red in the grid.
 * Returns a map keyed by appointment id; only non-exam rows are annotated.
 */
const buildAppointmentGridFlags = async (
  companyId: string,
  appointments: Array<{
    id: string;
    // Null only for studentless exam placeholders, filtered out below.
    studentId: string | null;
    type: string | null;
    groupLessonId: string | null;
    startsAt: Date;
  }>,
): Promise<Map<string, { mandatoryLesson: boolean; examNextDay: boolean }>> => {
  const flags = new Map<string, { mandatoryLesson: boolean; examNextDay: boolean }>();
  const guides = appointments.filter((a) => a.type !== "esame");
  if (!guides.length) return flags;
  const studentIds = [
    ...new Set(guides.map((a) => a.studentId).filter((id): id is string => id != null)),
  ];

  const [allGuides, cases, examAppointments] = await Promise.all([
    // All individual guides of the involved students, to rank each lesson in
    // the student's chronological history (first 6 = mandatory).
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        type: { not: "esame" },
        groupLessonId: null,
        status: { not: "cancelled" },
      },
      select: { id: true, studentId: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.autoscuolaCase.findMany({
      where: { companyId, studentId: { in: studentIds }, drivingExamAt: { not: null } },
      select: { studentId: true, drivingExamAt: true },
    }),
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        type: "esame",
        status: { not: "cancelled" },
      },
      select: { studentId: true, startsAt: true },
    }),
  ]);

  // First-6 set per student (ids — robust against equal timestamps).
  // Only EXACTLY-60-minute guides are eligible: shorter/longer guides are not
  // mandatory lessons and don't consume one of the 6 slots either.
  const mandatoryIds = new Set<string>();
  const perStudentCount = new Map<string, number>();
  const SIXTY_MIN_MS = 60 * 60 * 1000;
  for (const g of allGuides) {
    if (!g.studentId) continue; // studentless exam placeholder (not a guide)
    if (!g.endsAt || g.endsAt.getTime() - g.startsAt.getTime() !== SIXTY_MIN_MS) continue;
    const n = perStudentCount.get(g.studentId) ?? 0;
    if (n < REQUIRED_LESSONS_COUNT) mandatoryIds.add(g.id);
    perStudentCount.set(g.studentId, n + 1);
  }

  // Exam day keys per student (case date + exam appointments).
  const examDaysByStudent = new Map<string, Set<string>>();
  const addExamDay = (studentId: string, when: Date | null) => {
    if (!when) return;
    const set = examDaysByStudent.get(studentId) ?? new Set<string>();
    set.add(romeDayKey(when));
    examDaysByStudent.set(studentId, set);
  };
  for (const c of cases) addExamDay(c.studentId, c.drivingExamAt);
  for (const e of examAppointments) {
    if (e.studentId) addExamDay(e.studentId, e.startsAt); // null: studentless exam placeholder
  }

  for (const a of guides) {
    if (!a.studentId) continue; // studentless exam placeholder — not a guide
    const examDays = examDaysByStudent.get(a.studentId);
    flags.set(a.id, {
      mandatoryLesson: mandatoryIds.has(a.id),
      examNextDay: examDays ? examDays.has(nextDayKey(romeDayKey(a.startsAt))) : false,
    });
  }
  return flags;
};

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
          types: true,
          rating: true,
          startsAt: true,
          endsAt: true,
          status: true,
          instructorId: true,
          vehicleId: true,
          locationId: true,
          groupLessonId: true,
          notes: true,
          cancelledAt: true,
          cancellationKind: true,
          cancellationReason: true,
          creditApplied: true,
          paymentRequired: true,
          penaltyAmount: true,
          penaltyCutoffAt: true,
          lateCancellationAction: true,
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
          location: {
            select: {
              id: true,
              companyId: true,
              name: true,
              address: true,
              latitude: true,
              longitude: true,
              placeId: true,
              isDefault: true,
              isPrecise: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
        ...(limit ? { take: limit } : {}),
      });

      const gridFlags = await buildAppointmentGridFlags(companyId, appointments);
      const glInfo = await fetchGroupLessonFill(appointments.map((a) => a.groupLessonId));
      return {
        success: true,
        data: appointments.map((item) => {
          const gl = item.groupLessonId ? glInfo.get(item.groupLessonId) : null;
          return {
            ...item,
            case: null,
            student: mapCaseStudent(item.student),
            ...(gridFlags.get(item.id) ?? {}),
            groupLessonCapacity: gl?.capacity ?? null,
            groupLessonKind: gl?.kind ?? null,
            groupLessonFilled: gl?.filled ?? null,
          };
        }),
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
        location: true,
      },
      orderBy: { startsAt: "asc" },
      ...(limit ? { take: limit } : {}),
    });

    const gridFlags = await buildAppointmentGridFlags(companyId, appointments);
    const glInfo = await fetchGroupLessonFill(appointments.map((a) => a.groupLessonId));
    return {
      success: true,
      data: appointments.map((item) => {
        const gl = item.groupLessonId ? glInfo.get(item.groupLessonId) : null;
        return {
          ...item,
          student: mapCaseStudent(item.student),
          ...(gridFlags.get(item.id) ?? {}),
          groupLessonCapacity: gl?.capacity ?? null,
          groupLessonKind: gl?.kind ?? null,
          groupLessonFilled: gl?.filled ?? null,
        };
      }),
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

/**
 * Overlap check against scheduled group-lesson CONTAINERS: a group lesson
 * reserves its instructor, primary vehicle, shared follow car and moto fleet
 * for the whole window even with ZERO participants — in that case it has no
 * appointment rows, so appointment-based conflict scans cannot see it.
 */
const findGroupContainerConflict = async ({
  companyId,
  startsAt,
  endsAt,
  instructorId,
  vehicleIds,
}: {
  companyId: string;
  startsAt: Date;
  endsAt: Date;
  instructorId?: string | null;
  vehicleIds?: string[];
}) => {
  const reserved = Array.from(new Set((vehicleIds ?? []).filter(Boolean)));
  if (!instructorId && !reserved.length) return null;
  return prisma.autoscuolaGroupLesson.findFirst({
    where: {
      companyId,
      status: "scheduled",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      OR: [
        ...(instructorId ? [{ instructorId }] : []),
        ...(reserved.length
          ? [
              { vehicleId: { in: reserved } },
              { followVehicleId: { in: reserved } },
              { fleetVehicles: { some: { vehicleId: { in: reserved } } } },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
};

/**
 * True when any of `vehicleIds` is already reserved in [startsAt, endsAt) by
 * ANOTHER appointment (as primary `vehicleId` or via the appointmentVehicles
 * join — follow cars and extra motos included) or by a scheduled group-lesson
 * container. Used when EDITING a lesson's vehicles; the create paths run
 * their own combined scan.
 */
const findVehicleReservationConflict = async ({
  companyId,
  startsAt,
  endsAt,
  vehicleIds,
  excludeAppointmentId,
}: {
  companyId: string;
  startsAt: Date;
  endsAt: Date;
  vehicleIds: string[];
  excludeAppointmentId?: string;
}) => {
  const reserved = Array.from(new Set(vehicleIds.filter(Boolean)));
  if (!reserved.length) return false;
  const [appointmentConflict, containerConflict] = await Promise.all([
    prisma.autoscuolaAppointment.findFirst({
      where: {
        companyId,
        status: { notIn: ["cancelled"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        OR: [
          { vehicleId: { in: reserved } },
          { appointmentVehicles: { some: { vehicleId: { in: reserved } } } },
        ],
      },
      select: { id: true },
    }),
    findGroupContainerConflict({ companyId, startsAt, endsAt, vehicleIds: reserved }),
  ]);
  return Boolean(appointmentConflict || containerConflict);
};

export async function createAutoscuolaAppointment(
  input: z.infer<typeof createAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createAppointmentSchema.parse(input);
    const requestedType = normalizeLessonType(payload.type);
    const requestedTypes = payload.types?.map(normalizeLessonType).filter(Boolean) ?? [];
    const isInstructorActor =
      isInstructor(membership.autoscuolaRole) && membership.role !== "admin";
    const isStudentActor =
      membership.autoscuolaRole === "STUDENT" && membership.role !== "admin";
    const isOwnerOrAdminActor =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);

    let resolvedInstructorId = payload.instructorId;
    if (isStudentActor) {
      // Governance resolved with cascade cluster → company for this student.
      const governance = await getBookingGovernanceForStudent(companyId, payload.studentId);
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
      // Governance resolved with cascade cluster → company for this instructor.
      const governance = await getBookingGovernanceForInstructor(companyId, ownInstructor.id);
      if (!isInstructorAppBookingEnabled(governance)) {
        return {
          success: false,
          message: "La prenotazione da app è abilitata solo per allievi.",
        };
      }
    } else if (!isOwnerOrAdminActor) {
      return { success: false, message: "Operazione non consentita." };
    }

    // Instructor cluster lock enforcement for students
    if (isStudentActor) {
      const { resolveEffectiveBookingSettings } = await import("@/lib/autoscuole/instructor-clusters");
      const clusterSettings = await resolveEffectiveBookingSettings(companyId, payload.studentId, {
        bookingSlotDurations: [],
        roundedHoursOnly: false,
      });
      if (clusterSettings.isLockedToInstructor && clusterSettings.assignedInstructorId) {
        if (resolvedInstructorId !== clusterSettings.assignedInstructorId) {
          return {
            success: false,
            message: "Puoi prenotare solo con il tuo istruttore assegnato.",
          };
        }
      }
    }

    // Booking block enforcement
    const studentBlocked = await getStudentBookingBlockStatus(companyId, payload.studentId);
    if (studentBlocked) {
      if (isStudentActor || isInstructorActor) {
        return {
          success: false,
          message:
            "Le tue prenotazioni sono temporaneamente sospese. Contatta la segreteria.",
        };
      }
      // Owner/Admin: soft warning — don't block, just flag
    }

    // Weekly booking limit enforcement — cluster settings override company defaults
    const weeklyLimitSettings = await (async () => {
      const svc = await prisma.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      });
      const lim = (svc?.limits ?? {}) as Record<string, unknown>;
      // Waterfall: the student's cluster (assigned autonomous instructor) wins
      // over the company default; an unset cluster value inherits the company.
      const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import("@/lib/autoscuole/instructor-clusters");
      const effective = await resolveEffectiveBookingSettings(companyId, payload.studentId, buildCompanyBookingDefaults(lim));
      const enabled = effective.weeklyBookingLimitEnabled;
      const limit = effective.weeklyBookingLimit;
      // Exam priority is a company-wide policy (not cluster-overridable).
      const examPriorityEnabled = lim.examPriorityEnabled === true;
      const examPriorityDaysBeforeExam =
        typeof lim.examPriorityDaysBeforeExam === "number" && lim.examPriorityDaysBeforeExam >= 1
          ? lim.examPriorityDaysBeforeExam
          : 14;
      return { enabled, limit, examPriorityEnabled, examPriorityDaysBeforeExam };
    })();

    if (weeklyLimitSettings.enabled && !payload.skipWeeklyLimitCheck) {
      // Check if student is exempt
      const memberRecord = await prisma.companyMember.findFirst({
        where: { companyId, userId: payload.studentId },
        select: { weeklyBookingLimitExempt: true },
      });
      const isExempt = memberRecord?.weeklyBookingLimitExempt === true;

      if (!isExempt) {
        // Students with exam priority bypass the weekly limit entirely
        let bypassLimit = false;
        if (weeklyLimitSettings.examPriorityEnabled) {
          const { hasExamPriority } = await import("@/lib/autoscuole/exam-priority");
          bypassLimit = await hasExamPriority(
            companyId,
            payload.studentId,
            weeklyLimitSettings.examPriorityDaysBeforeExam,
          );
        }
        const effectiveLimit = weeklyLimitSettings.limit;
        if (bypassLimit) {
          // Skip count check — exam priority students have no weekly limit
        } else {

        // Calculate current ISO week bounds (Monday-Sunday) for the slot being booked
        const slotDate = new Date(payload.startsAt);
        const dayOfWeek = slotDate.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(slotDate);
        weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
        weekStart.setUTCHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

        const weekCount = await prisma.autoscuolaAppointment.count({
          where: {
            companyId,
            studentId: payload.studentId,
            status: { notIn: ["cancelled"] },
            startsAt: { gte: weekStart, lt: weekEnd },
          },
        });

        if (weekCount >= effectiveLimit) {
          if (isStudentActor) {
            return {
              success: false,
              message: `Hai raggiunto il limite massimo di ${effectiveLimit} guide settimanali. Non puoi prenotare altre guide per questa settimana.`,
              code: "WEEKLY_LIMIT_REACHED" as const,
            };
          }
          // Instructor or Admin: return warning but don't block (unless skipWeeklyLimitCheck is false and they haven't confirmed)
          if (isInstructorActor || isOwnerOrAdminActor) {
            return {
              success: false,
              message: `L'allievo ha già raggiunto il limite di ${effectiveLimit} guide settimanali (${weekCount} prenotate). Vuoi procedere comunque?`,
              code: "WEEKLY_LIMIT_CONFIRM" as const,
              weeklyLimitData: { current: weekCount, limit: effectiveLimit },
            };
          }
        }
        }  // end else (bypassLimit)
      }
    }

    // Proposte ritirate: una guida creata dall'istruttore è sempre confermata,
    // non si invia più alcuna "proposta" da accettare.
    const appointmentStatus = payload.status ?? "scheduled";

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
      payload.vehicleId
        ? prisma.autoscuolaVehicle.findFirst({
            where: { id: payload.vehicleId, companyId },
          })
        : Promise.resolve(null),
      getLessonPolicyForCompany(companyId),
    ]);

    if (!student || !instructor) {
      return {
        success: false,
        message: "Seleziona allievo e istruttore validi.",
      };
    }
    if (payload.vehicleId && !vehicle) {
      return {
        success: false,
        message: "Veicolo non valido.",
      };
    }

    // Follow car + extra motos: allowed ONLY when the primary vehicle is a
    // moto (a car guida carries a single vehicle), and each must be a
    // company-owned active vehicle — extras additionally must be motos.
    // Previously this path accepted them with NO validation at all.
    const singleExtraIds = [
      payload.followVehicleId,
      ...(payload.extraMotoVehicleIds ?? []),
    ].filter((id): id is string => Boolean(id));
    if (singleExtraIds.length) {
      if (!vehicle || !isMotoLicenseCategory(vehicle.licenseCategory)) {
        return {
          success: false,
          message: "Auto al seguito e moto aggiuntive sono consentite solo sulle guide in moto.",
        };
      }
      const extraVehicles = await prisma.autoscuolaVehicle.findMany({
        where: { id: { in: singleExtraIds }, companyId, status: "active" },
        select: { id: true, licenseCategory: true },
      });
      const validExtraIds = new Set(extraVehicles.map((v) => v.id));
      if (!singleExtraIds.every((id) => validExtraIds.has(id))) {
        return { success: false, message: "Veicolo aggiuntivo non valido." };
      }
      const extraMotoSet = new Set(payload.extraMotoVehicleIds ?? []);
      const motosValid = extraVehicles
        .filter((v) => extraMotoSet.has(v.id))
        .every((v) => isMotoLicenseCategory(v.licenseCategory));
      if (!motosValid) {
        return { success: false, message: "I veicoli aggiuntivi devono essere moto." };
      }
    }

    if (lessonPolicy.lessonPolicyEnabled && !requestedType && !requestedTypes.length) {
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
    if (requestedTypes.length && !requestedTypes.every(isLessonAllowedType)) {
      return {
        success: false,
        message: "Uno o più tipi guida non validi.",
      };
    }
    const resolvedType = requestedType || requestedTypes[0] || "guida";
    const resolvedTypes = requestedTypes.length ? requestedTypes : [resolvedType];

    const slotTime = new Date(payload.startsAt);
    if (Number.isNaN(slotTime.getTime())) {
      return { success: false, message: "Orario di inizio non valido." };
    }
    if (!payload.allowPast && slotTime.getTime() < Date.now()) {
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
    if (studentBlocked && isOwnerOrAdminActor) {
      warnings.push("Attenzione: l'allievo ha le prenotazioni bloccate.");
    }
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
      const selectedPolicyTypes = resolvedTypes.filter(isLessonPolicyType);
      const coversAnyMissing = selectedPolicyTypes.some((t) => coverage.missingRequiredTypes.includes(t));
      if (
        coverage.missingRequiredTypes.length &&
        !coversAnyMissing
      ) {
        warnings.push(
          `Tipo guida non prioritario rispetto ai tipi ancora mancanti (${formatLessonTypesList(
            coverage.missingRequiredTypes,
          )}).`,
        );
      }
    }
    if (lessonPolicy.lessonPolicyEnabled) {
      const policyTypes = resolvedTypes.filter(isLessonPolicyType);
      const disallowed = policyTypes.filter(
        (t) => !isLessonTypeAllowedForInterval({ policy: lessonPolicy, lessonType: t, startsAt: slotTime, endsAt: slotEnd }),
      );
      if (disallowed.length) {
        warnings.push("Il tipo guida selezionato è fuori dalla finestra configurata.");
      }
    }

    const scanStart = new Date(slotTime);
    scanStart.setDate(scanStart.getDate() - 1);
    const scanEnd = new Date(slotEnd);
    scanEnd.setDate(scanEnd.getDate() + 1);

    // A lesson may reserve more than one vehicle (moto + follow car). Catch a
    // conflict on ANY reserved vehicle, whether the other appointment uses it as
    // its primary `vehicleId` or as a secondary (follow) row in the join.
    const reservedVehicleIds = [
      payload.vehicleId,
      payload.followVehicleId,
      ...(payload.extraMotoVehicleIds ?? []),
    ].filter((id): id is string => Boolean(id));
    const conflictOr: Array<Record<string, unknown>> = [
      { instructorId: resolvedInstructorId },
    ];
    for (const vehicleId of reservedVehicleIds) {
      conflictOr.push({ vehicleId });
    }
    if (reservedVehicleIds.length) {
      conflictOr.push({
        appointmentVehicles: { some: { vehicleId: { in: reservedVehicleIds } } },
      });
    }
    const conflicts = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        startsAt: { gte: scanStart, lt: scanEnd },
        status: { notIn: ["cancelled"] },
        OR: conflictOr,
      },
    });
    const hasConflict = conflicts.some((item) => {
      const start = item.startsAt;
      const end = item.endsAt ?? new Date(start.getTime() + 30 * 60 * 1000);
      return start < slotEnd && end > slotTime;
    });
    if (hasConflict && !payload.skipConflictCheck) {
      return {
        success: false,
        message: "Slot non disponibile per istruttore o veicolo.",
      };
    }

    // Check overlap with instructor blocks (sick leave, unavailability, etc.)
    if (resolvedInstructorId) {
      const blockConflicts = await prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          instructorId: resolvedInstructorId,
          startsAt: { lt: slotEnd },
          endsAt: { gt: slotTime },
        },
        select: { id: true },
      });
      if (blockConflicts.length > 0) {
        return {
          success: false,
          message: "L'istruttore non è disponibile in quell'orario (slot bloccato).",
        };
      }
    }

    // Group-lesson containers reserve instructor + vehicles even with zero
    // participants (no appointment rows) — the scan above cannot see them.
    if (!payload.skipConflictCheck) {
      const containerConflict = await findGroupContainerConflict({
        companyId,
        startsAt: slotTime,
        endsAt: slotEnd,
        instructorId: resolvedInstructorId,
        vehicleIds: reservedVehicleIds,
      });
      if (containerConflict) {
        return {
          success: false,
          message: "Slot non disponibile: istruttore o veicolo impegnato in una guida di gruppo.",
        };
      }
    }

    // Validate location ownership (must belong to same company, non-archived).
    // If caller didn't specify a location, fall back to the company default sede.
    let resolvedLocationId: string | null = payload.locationId ?? null;
    if (resolvedLocationId) {
      const loc = await prisma.autoscuolaLocation.findFirst({
        where: { id: resolvedLocationId, companyId, archivedAt: null },
        select: { id: true },
      });
      if (!loc) {
        return { success: false, message: "Luogo non valido per questa autoscuola." };
      }
    } else {
      const defaultLoc = await prisma.autoscuolaLocation.findFirst({
        where: { companyId, isDefault: true, archivedAt: null },
        select: { id: true },
      });
      resolvedLocationId = defaultLoc?.id ?? null;
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
            bookingSource: staffBookingSource(isInstructorActor),
            caseId: payload.caseId || null,
            type: resolvedTypes[0],
            types: resolvedTypes,
            startsAt: slotTime,
            endsAt: slotEnd,
            status: appointmentStatus,
            instructorId: resolvedInstructorId,
            vehicleId: payload.vehicleId ?? null,
            locationId: resolvedLocationId,
          notes: payload.notes ?? null,
          paymentRequired: paymentSnapshot.paymentRequired,
          paymentStatus: paymentSnapshot.paymentStatus,
          priceAmount: paymentSnapshot.priceAmount,
          penaltyAmount: paymentSnapshot.penaltyAmount,
          penaltyCutoffAt: paymentSnapshot.penaltyCutoffAt,
          paidAmount: paymentSnapshot.paidAmount,
          invoiceStatus: paymentSnapshot.invoiceStatus,
          creditApplied: paymentSnapshot.creditApplied,
          manualPaymentStatus: paymentSnapshot.manualPaymentStatus ?? null,
          // Reserve every vehicle this lesson uses (primary moto + any extra
          // motos + follow car), de-duped by vehicleId.
          ...(payload.vehicleId
            ? {
                appointmentVehicles: {
                  create: buildAppointmentVehicleRows({
                    primaryVehicleId: payload.vehicleId,
                    extraMotoVehicleIds: payload.extraMotoVehicleIds,
                    followVehicleId: payload.followVehicleId,
                  }),
                },
              }
            : {}),
        },
      });
    });

    await invalidateAgendaAndPaymentsCache(companyId);

    // Serialize Decimal fields for client component compatibility
    const serializedAppointment = {
      ...appointment,
      priceAmount: Number(appointment.priceAmount),
      penaltyAmount: Number(appointment.penaltyAmount),
      paidAmount: Number(appointment.paidAmount),
    };

    return {
      success: true,
      data: serializedAppointment,
      message: "Appuntamento creato.",
      ...(warnings.length ? { warnings } : {}),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Batch appointment creation (multi-booking from instructor app)
// ---------------------------------------------------------------------------

const createAppointmentBatchSchema = z.object({
  studentId: z.string().uuid(),
  instructorId: z.string().uuid(),
  vehicleId: z.string().uuid().optional().nullable(),
  // Follow car + extra motos applied to every entry in the batch (same vehicle
  // set across the slots).
  followVehicleId: z.string().uuid().optional().nullable(),
  extraMotoVehicleIds: z.array(z.string().uuid()).optional(),
  locationId: z.string().uuid().optional().nullable(),
  type: z.string().optional(),
  types: z.array(z.string()).optional(),
  skipWeeklyLimitCheck: z.boolean().optional(),
  // Vedi createAppointmentSchema.allowPast — consente di registrare slot passati
  // dopo conferma esplicita dell'utente.
  allowPast: z.boolean().optional(),
  entries: z
    .array(
      z.object({
        startsAt: z.string().min(1),
        endsAt: z.string().min(1),
      }),
    )
    .min(1)
    .max(20),
});

export async function createAutoscuolaAppointmentBatch(
  input: z.infer<typeof createAppointmentBatchSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = createAppointmentBatchSchema.parse(input);

    const isInstructorActor =
      isInstructor(membership.autoscuolaRole) && membership.role !== "admin";
    const isOwnerOrAdminActor =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);

    // Only instructors and admins/owners can batch-book
    if (!isInstructorActor && !isOwnerOrAdminActor) {
      return { success: false, message: "Operazione non consentita." };
    }

    let resolvedInstructorId = payload.instructorId;
    if (isInstructorActor) {
      const ownInstructor = await getOwnInstructorProfile(companyId, membership.userId);
      if (!ownInstructor) {
        return { success: false, message: "Profilo istruttore non trovato per questo account." };
      }
      resolvedInstructorId = ownInstructor.id;
      // Governance resolved with cascade cluster → company for this instructor.
      const governance = await getBookingGovernanceForInstructor(companyId, ownInstructor.id);
      if (!isInstructorAppBookingEnabled(governance)) {
        return {
          success: false,
          message: "La prenotazione da app è abilitata solo per allievi.",
        };
      }
    }

    const requestedType = normalizeLessonType(payload.type);
    const requestedTypes = payload.types?.map(normalizeLessonType).filter(Boolean) ?? [];
    const resolvedType = requestedType || requestedTypes[0] || "guida";
    const resolvedTypes = requestedTypes.length ? requestedTypes : [resolvedType];

    // ── Shared validation (1 time) ──
    const [student, instructor, vehicle, lessonPolicy] = await Promise.all([
      prisma.companyMember.findFirst({
        where: { companyId, autoscuolaRole: "STUDENT", userId: payload.studentId },
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      }),
      prisma.autoscuolaInstructor.findFirst({
        where: { id: resolvedInstructorId, companyId },
      }),
      payload.vehicleId
        ? prisma.autoscuolaVehicle.findFirst({
            where: { id: payload.vehicleId, companyId },
          })
        : Promise.resolve(null),
      getLessonPolicyForCompany(companyId),
    ]);

    if (!student || !instructor) {
      return { success: false, message: "Seleziona allievo e istruttore validi." };
    }
    if (payload.vehicleId && !vehicle) {
      return { success: false, message: "Veicolo non valido." };
    }

    // Validate the extra vehicles (follow car + extra motos): they must belong to
    // the company and be active. Extra motos must additionally be motos.
    const extraReservedIds = [
      payload.followVehicleId,
      ...(payload.extraMotoVehicleIds ?? []),
    ].filter((id): id is string => Boolean(id));
    if (extraReservedIds.length) {
      // Same moto-only rule as the single create: follow car and extra motos
      // exist only on moto lessons (the primary must be a moto).
      if (!vehicle || !isMotoLicenseCategory(vehicle.licenseCategory)) {
        return {
          success: false,
          message: "Auto al seguito e moto aggiuntive sono consentite solo sulle guide in moto.",
        };
      }
      const extraVehicles = await prisma.autoscuolaVehicle.findMany({
        where: { id: { in: extraReservedIds }, companyId, status: "active" },
        select: { id: true, licenseCategory: true },
      });
      const validIds = new Set(extraVehicles.map((v) => v.id));
      if (!extraReservedIds.every((id) => validIds.has(id))) {
        return { success: false, message: "Veicolo aggiuntivo non valido." };
      }
      const extraMotoSet = new Set(payload.extraMotoVehicleIds ?? []);
      const motosValid = extraVehicles
        .filter((v) => extraMotoSet.has(v.id))
        .every((v) => isMotoLicenseCategory(v.licenseCategory));
      if (!motosValid) {
        return { success: false, message: "I veicoli aggiuntivi devono essere moto." };
      }
    }

    // Booking block enforcement
    const studentBlocked = await getStudentBookingBlockStatus(companyId, payload.studentId);
    if (studentBlocked && isInstructorActor) {
      return {
        success: false,
        message: "Le tue prenotazioni sono temporaneamente sospese. Contatta la segreteria.",
      };
    }

    // Lesson type validation
    if (lessonPolicy.lessonPolicyEnabled && !requestedType && !requestedTypes.length) {
      return { success: false, message: "Con policy attiva devi selezionare il tipo guida." };
    }
    if (requestedType && !isLessonAllowedType(requestedType)) {
      return { success: false, message: "Tipo guida non valido." };
    }
    if (requestedTypes.length && !requestedTypes.every(isLessonAllowedType)) {
      return { success: false, message: "Uno o più tipi guida non validi." };
    }

    // ── Parse & validate each entry ──
    const parsedEntries: Array<{ startsAt: Date; endsAt: Date }> = [];
    for (const entry of payload.entries) {
      const start = new Date(entry.startsAt);
      const end = new Date(entry.endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return { success: false, message: "Uno o più intervalli orari non validi." };
      }
      if (!payload.allowPast && start.getTime() < Date.now()) {
        return { success: false, message: "Non puoi prenotare una guida nel passato." };
      }
      parsedEntries.push({ startsAt: start, endsAt: end });
    }

    // ── Weekly limit check (aggregated across all entries) ──
    if (!payload.skipWeeklyLimitCheck) {
      const svc = await prisma.companyService.findFirst({
        where: { companyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      });
      const lim = (svc?.limits ?? {}) as Record<string, unknown>;
      // Waterfall: the student's cluster (assigned autonomous instructor) wins
      // over the company default; an unset cluster value inherits the company.
      const { resolveEffectiveBookingSettings, buildCompanyBookingDefaults } = await import("@/lib/autoscuole/instructor-clusters");
      const effective = await resolveEffectiveBookingSettings(companyId, payload.studentId, buildCompanyBookingDefaults(lim));
      const limitEnabled = effective.weeklyBookingLimitEnabled;
      const weeklyLimit = effective.weeklyBookingLimit;
      // Exam priority is a company-wide policy (not cluster-overridable).
      const examPriorityEnabled = lim.examPriorityEnabled === true;
      const examPriorityDaysBeforeExam =
        typeof lim.examPriorityDaysBeforeExam === "number" && lim.examPriorityDaysBeforeExam >= 1
          ? lim.examPriorityDaysBeforeExam
          : 14;

      if (limitEnabled) {
        const memberRecord = await prisma.companyMember.findFirst({
          where: { companyId, userId: payload.studentId },
          select: { weeklyBookingLimitExempt: true },
        });
        const isExempt = memberRecord?.weeklyBookingLimitExempt === true;

        if (!isExempt) {
          let bypassLimit = false;
          if (examPriorityEnabled) {
            const { hasExamPriority } = await import("@/lib/autoscuole/exam-priority");
            bypassLimit = await hasExamPriority(companyId, payload.studentId, examPriorityDaysBeforeExam);
          }

          if (!bypassLimit) {
            // Group entries by ISO week and check each
            const weekBuckets = new Map<string, number>();
            for (const entry of parsedEntries) {
              const dayOfWeek = entry.startsAt.getUTCDay();
              const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
              const weekStart = new Date(entry.startsAt);
              weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
              weekStart.setUTCHours(0, 0, 0, 0);
              const key = weekStart.toISOString();
              weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + 1);
            }

            for (const [weekStartIso, newCount] of weekBuckets) {
              const weekStart = new Date(weekStartIso);
              const weekEnd = new Date(weekStart);
              weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

              const existingCount = await prisma.autoscuolaAppointment.count({
                where: {
                  companyId,
                  studentId: payload.studentId,
                  status: { notIn: ["cancelled"] },
                  startsAt: { gte: weekStart, lt: weekEnd },
                },
              });

              if (existingCount + newCount > weeklyLimit) {
                if (isInstructorActor) {
                  return {
                    success: false,
                    message: `L'allievo ha già ${existingCount} guide nella settimana del ${weekStart.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" })}. Con queste ${newCount} nuove si supera il limite di ${weeklyLimit}. Vuoi procedere comunque?`,
                    code: "WEEKLY_LIMIT_CONFIRM" as const,
                    weeklyLimitData: { current: existingCount, limit: weeklyLimit },
                  };
                }
                if (isOwnerOrAdminActor) {
                  return {
                    success: false,
                    message: `L'allievo supererebbe il limite di ${weeklyLimit} guide settimanali. Vuoi procedere comunque?`,
                    code: "WEEKLY_LIMIT_CONFIRM" as const,
                    weeklyLimitData: { current: existingCount, limit: weeklyLimit },
                  };
                }
              }
            }
          }
        }
      }
    }

    // ── Conflict detection (single query for all entries) ──
    const allStarts = parsedEntries.map((e) => e.startsAt.getTime());
    const allEnds = parsedEntries.map((e) => e.endsAt.getTime());
    const scanStart = new Date(Math.min(...allStarts));
    scanStart.setDate(scanStart.getDate() - 1);
    const scanEnd = new Date(Math.max(...allEnds));
    scanEnd.setDate(scanEnd.getDate() + 1);

    // Every vehicle this batch reserves on each slot (primary + follow + extras).
    const batchReservedVehicleIds = [
      payload.vehicleId,
      payload.followVehicleId,
      ...(payload.extraMotoVehicleIds ?? []),
    ].filter((id): id is string => Boolean(id));
    const batchConflictOr: Array<Record<string, unknown>> = [
      { instructorId: resolvedInstructorId },
    ];
    for (const vid of batchReservedVehicleIds) {
      batchConflictOr.push({ vehicleId: vid });
    }
    if (batchReservedVehicleIds.length) {
      // Also catch appointments using any of these vehicles in the join (e.g.
      // a car already used as a follow car elsewhere).
      batchConflictOr.push({
        appointmentVehicles: { some: { vehicleId: { in: batchReservedVehicleIds } } },
      });
    }
    const existingAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        startsAt: { gte: scanStart, lt: scanEnd },
        status: { notIn: ["cancelled"] },
        OR: batchConflictOr,
      },
    });

    // Check overlap with instructor blocks
    const existingBlocks = await prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId,
        instructorId: resolvedInstructorId,
        startsAt: { gte: scanStart, lt: scanEnd },
      },
    });

    for (let i = 0; i < parsedEntries.length; i++) {
      const entry = parsedEntries[i];
      const hasConflict = existingAppointments.some((appt) => {
        const start = appt.startsAt;
        const end = appt.endsAt ?? new Date(start.getTime() + 30 * 60 * 1000);
        return start < entry.endsAt && end > entry.startsAt;
      });
      if (hasConflict) {
        const dateStr = entry.startsAt.toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        });
        return {
          success: false,
          message: `Conflitto per lo slot del ${dateStr}: istruttore o veicolo non disponibile.`,
        };
      }

      // Check overlap with instructor blocks
      const hasBlockConflict = existingBlocks.some(
        (block) => block.startsAt < entry.endsAt && block.endsAt > entry.startsAt,
      );
      if (hasBlockConflict) {
        const dateStr = entry.startsAt.toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        });
        return {
          success: false,
          message: `Conflitto per lo slot del ${dateStr}: l'istruttore ha uno slot bloccato.`,
        };
      }

      // Group-lesson containers (even with zero participants) reserve
      // instructor + vehicles but have no appointment rows.
      const containerConflict = await findGroupContainerConflict({
        companyId,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        instructorId: resolvedInstructorId,
        vehicleIds: batchReservedVehicleIds,
      });
      if (containerConflict) {
        const dateStr = entry.startsAt.toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        });
        return {
          success: false,
          message: `Conflitto per lo slot del ${dateStr}: istruttore o veicolo impegnato in una guida di gruppo.`,
        };
      }

      // Also check inter-entry conflicts (within the batch itself)
      for (let j = i + 1; j < parsedEntries.length; j++) {
        const other = parsedEntries[j];
        if (entry.startsAt < other.endsAt && entry.endsAt > other.startsAt) {
          return {
            success: false,
            message: "Due o più guide nella prenotazione si sovrappongono.",
          };
        }
      }
    }

    // Resolve location: explicit payload or company default sede
    let batchLocationId: string | null = payload.locationId ?? null;
    if (batchLocationId) {
      const loc = await prisma.autoscuolaLocation.findFirst({
        where: { id: batchLocationId, companyId, archivedAt: null },
        select: { id: true },
      });
      if (!loc) {
        return { success: false, message: "Luogo non valido per questa autoscuola." };
      }
    } else {
      const defaultLoc = await prisma.autoscuolaLocation.findFirst({
        where: { companyId, isDefault: true, archivedAt: null },
        select: { id: true },
      });
      batchLocationId = defaultLoc?.id ?? null;
    }

    // ── Atomic creation via transaction ──
    const entryIds = parsedEntries.map(() => randomUUID());

    const appointments = await prisma.$transaction(async (tx) => {
      // Prepare payment snapshot once (same student/vehicle/instructor)
      const paymentSnapshot = await prepareAppointmentPaymentSnapshot({
        prisma: tx as never,
        companyId,
        studentId: payload.studentId,
        startsAt: parsedEntries[0].startsAt,
        endsAt: parsedEntries[0].endsAt,
        appointmentId: entryIds[0],
        actorUserId: membership.userId,
      });

      const results = [];
      for (let i = 0; i < parsedEntries.length; i++) {
        const entry = parsedEntries[i];
        const appt = await tx.autoscuolaAppointment.create({
          data: {
            id: entryIds[i],
            companyId,
            studentId: payload.studentId,
            bookingSource: staffBookingSource(isInstructorActor),
            type: resolvedTypes[0],
            types: resolvedTypes,
            startsAt: entry.startsAt,
            endsAt: entry.endsAt,
            status: "scheduled",
            instructorId: resolvedInstructorId,
            vehicleId: payload.vehicleId ?? null,
            locationId: batchLocationId,
            notes: null,
            paymentRequired: paymentSnapshot.paymentRequired,
            paymentStatus: paymentSnapshot.paymentStatus,
            priceAmount: paymentSnapshot.priceAmount,
            penaltyAmount: paymentSnapshot.penaltyAmount,
            penaltyCutoffAt: paymentSnapshot.penaltyCutoffAt,
            paidAmount: paymentSnapshot.paidAmount,
            invoiceStatus: paymentSnapshot.invoiceStatus,
            creditApplied: paymentSnapshot.creditApplied,
            manualPaymentStatus: paymentSnapshot.manualPaymentStatus ?? null,
            // Reserve every vehicle this slot uses (primary moto + extra motos
            // + follow car), de-duped by vehicleId.
            ...(payload.vehicleId
              ? {
                  appointmentVehicles: {
                    create: buildAppointmentVehicleRows({
                      primaryVehicleId: payload.vehicleId,
                      extraMotoVehicleIds: payload.extraMotoVehicleIds,
                      followVehicleId: payload.followVehicleId,
                    }),
                  },
                }
              : {}),
          },
        });
        results.push(appt);
      }
      return results;
    });

    await invalidateAgendaAndPaymentsCache(companyId);

    const serialized = appointments.map((appt) => ({
      ...appt,
      priceAmount: Number(appt.priceAmount),
      penaltyAmount: Number(appt.penaltyAmount),
      paidAmount: Number(appt.paidAmount),
    }));

    return {
      success: true,
      message: `${appointments.length} guide create.`,
      data: { created: appointments.length, appointments: serialized },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * Owner-facing in-app notification (bell/inbox) created when a STUDENT cancels
 * their own guide. Display fields are snapshotted so the notification stays
 * readable even if the appointment/user is later removed. Best-effort: never
 * block or fail the cancellation because of a notification write.
 */
async function createStudentCancellationNotification(params: {
  companyId: string;
  appointment: {
    id: string;
    studentId: string | null;
    startsAt: Date;
    instructorId: string | null;
    type: string;
    types?: string[];
  };
}) {
  const { companyId, appointment } = params;
  if (!appointment.studentId) return;
  try {
    const [student, instructor] = await Promise.all([
      prisma.user.findUnique({
        where: { id: appointment.studentId },
        select: { name: true },
      }),
      appointment.instructorId
        ? prisma.autoscuolaInstructor.findUnique({
            where: { id: appointment.instructorId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);
    await prisma.autoscuolaNotification.create({
      data: {
        companyId,
        kind: "student_cancellation",
        appointmentId: appointment.id,
        studentId: appointment.studentId,
        studentName: student?.name ?? null,
        startsAt: appointment.startsAt,
        instructorName: instructor?.name ?? null,
        lessonType: appointment.types?.[0] ?? appointment.type ?? null,
      },
    });
  } catch (error) {
    console.error("createStudentCancellationNotification failed", error);
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

    // Group-lesson seats have their own cancellation semantics (penalty
    // treatment + seat re-broadcast). A student may only withdraw their own seat.
    if (appointment.type === "group_lesson") {
      const isStaff =
        membership.role === "admin" ||
        isOwner(membership.autoscuolaRole) ||
        isInstructor(membership.autoscuolaRole);
      if (!isStaff && appointment.studentId !== membership.userId) {
        return { success: false, message: "Operazione non consentita." };
      }
      return await cancelGroupLessonParticipantAppointment({
        companyId: membership.companyId,
        appointmentId: appointment.id,
        actorUserId: membership.userId,
      });
    }

    if (membership.role !== "admin" && isInstructor(membership.autoscuolaRole)) {
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
      // Skip governance checks for exams — booking mode rules don't apply
      if (appointment.type !== "esame") {
        // Governance resolved with cascade cluster → company for this instructor.
        const governance = await getBookingGovernanceForInstructor(membership.companyId, ownInstructor.id);
        if (!isInstructorAppBookingEnabled(governance)) {
          return {
            success: false,
            message: "La prenotazione da app è abilitata solo per allievi.",
          };
        }
        // (Repositioning retired) Direct cancellation is allowed in every booking
        // mode — no longer redirected to "Cancella e riposiziona".
      }
    }

    // Block student cancellation if setting is disabled
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      const { getCachedCompanyServiceLimits } = await import("@/lib/autoscuole/cached-service");
      const { buildCompanyBookingDefaults, resolveEffectiveBookingSettings } = await import("@/lib/autoscuole/instructor-clusters");
      const limits = await getCachedCompanyServiceLimits(membership.companyId);
      const companyDefaults = buildCompanyBookingDefaults(limits);
      const effectiveSettings = await resolveEffectiveBookingSettings(
        membership.companyId,
        membership.userId,
        companyDefaults,
      );
      if (!effectiveSettings.studentCancellationEnabled) {
        return {
          success: false,
          message: "L'annullamento delle guide non è consentito. Contatta la tua autoscuola.",
        };
      }
    }

    await prisma.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: membership.userId,
        cancellationKind: "manual_cancel",
        cancellationReason: "manual_cancel",
      },
    });

    // Skip refund and notification for exams
    if (appointment.type !== "esame") {
    await refundLessonCreditIfEligible({
      appointmentId: appointment.id,
      cancelledByAutoscuola: false,
      actorUserId: membership.userId,
    });

    await notifyStudentAppointmentCancelled({
      companyId: membership.companyId,
      actorUserId: membership.userId,
      appointment: {
        id: appointment.id,
        // Non-null in this branch: guarded by `type !== "esame"`, and only
        // exam placeholders are studentless.
        studentId: appointment.studentId!,
        startsAt: appointment.startsAt,
        instructorId: appointment.instructorId,
      },
      cancellationKind: "manual_cancel",
      actorRole: isInstructor(membership.autoscuolaRole) ? "instructor" : membership.role === "admin" ? "admin" : "owner",
    });
    }

    // Notify the autoscuola owner (bell/inbox) when a STUDENT cancels their own
    // upcoming guide. Staff/owner cancellations and exams are excluded; group
    // lessons take a different path earlier. Off the request's critical path.
    const isStudentActor =
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole);
    if (
      isStudentActor &&
      appointment.type !== "esame" &&
      appointment.startsAt.getTime() > Date.now()
    ) {
      after(() =>
        createStudentCancellationNotification({
          companyId: membership.companyId,
          appointment,
        }),
      );
    }

    if (appointment.slotId) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

      const rangeEnd =
        appointment.endsAt ??
        new Date(appointment.startsAt.getTime() + 30 * 60 * 1000);
      const ownerFilters = appointment.studentId
        ? [{ ownerType: "student", ownerId: appointment.studentId }]
        : [];
      if (appointment.instructorId) {
        ownerFilters.push({
          ownerType: "instructor",
          ownerId: appointment.instructorId,
        });
      }
      if (appointment.vehicleId) {
        ownerFilters.push({ ownerType: "vehicle", ownerId: appointment.vehicleId });
      }
      // Also release the slot rows of every linked vehicle (follow car, extra
      // motos) — they were left "booked" forever before.
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
        excludeStudentIds: [appointment.studentId, membership.userId].filter(
          (x): x is string => x != null,
        ),
      });

      await invalidateAgendaAndPaymentsCache(membership.companyId);

      return {
        success: true,
        data: { rescheduled: false, broadcasted: true },
      };
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true, data: { rescheduled: false } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function permanentlyCancelAutoscuolaAppointment(
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
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: membership.userId,
        cancellationKind: "permanent_cancel",
        cancellationReason: "permanent_cancel",
      },
    });

    await refundLessonCreditIfEligible({
      appointmentId: appointment.id,
      cancelledByAutoscuola: true,
      actorUserId: membership.userId,
    });

    // Notify the student OUTSIDE the request path. The cancel itself is already
    // committed (the update above); push + email hit external providers and can
    // be slow enough to trip the mobile client's 15s timeout → a false
    // "Impossibile eliminare la guida" toast even though the delete succeeded.
    // after() runs the notification once the response has been sent.
    const cancelNotifyStudentId = appointment.studentId;
    if (cancelNotifyStudentId) {
      after(async () => {
        await notifyStudentAppointmentCancelled({
          companyId: membership.companyId,
          actorUserId: membership.userId,
          appointment: {
            id: appointment.id,
            studentId: cancelNotifyStudentId,
            startsAt: appointment.startsAt,
            instructorId: appointment.instructorId,
          },
          cancellationKind: "permanent_cancel",
          actorRole: isInstructor(membership.autoscuolaRole) ? "instructor" : membership.role === "admin" ? "admin" : "owner",
        });
      });
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true, message: "Guida eliminata definitivamente." };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * "Rimuovi dallo storico" dal dettaglio allievo (web): toglie una guida dallo
 * storico e dall'agenda. Solo titolare/admin. Esami e guide di gruppo esclusi.
 * Opzioni scelte dal titolare in fase di rimozione:
 *  - keepInHours: mantiene la guida nel conteggio ore dell'istruttore.
 *  - refundCredit: restituisce il credito se la guida era coperta da un credito.
 */
const removeFromRecordSchema = z.object({
  appointmentId: z.string().uuid(),
  keepInHours: z.boolean().optional(),
  refundCredit: z.boolean().optional(),
});

export async function hardCleanupAutoscuolaAppointment(
  input: z.infer<typeof removeFromRecordSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const isOwnerOrAdmin =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);
    if (!isOwnerOrAdmin) {
      return {
        success: false,
        message: "Solo il titolare può rimuovere una guida dallo storico.",
      };
    }
    const payload = removeFromRecordSchema.parse(input);
    return await removeAppointmentFromRecord({
      companyId: membership.companyId,
      appointmentId: payload.appointmentId,
      actorUserId: membership.userId,
      keepInHours: payload.keepInHours ?? false,
      refundCredit: payload.refundCredit ?? false,
    });
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * "Annulla guida" (guide future) — dialogo unico dell'agenda / dettaglio allievo.
 * `lateOutcome` (solo se l'annullamento è tardivo): "penalize" | "waive" | "defer".
 * L'istruttore (non titolare) non decide l'esito economico: se tardivo va sempre
 * in coda "Cancellazioni tardive" (defer).
 */
const annulAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  lateOutcome: z.enum(["penalize", "waive", "defer"]).optional(),
});

export async function annulAutoscuolaAppointment(
  input: z.infer<typeof annulAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const isOwnerOrAdmin =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);
    const isInstructorActor =
      isInstructor(membership.autoscuolaRole) && membership.role !== "admin";
    if (!isOwnerOrAdmin && !isInstructorActor) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = annulAppointmentSchema.parse(input);
    // L'istruttore non titolare non può decidere addebito/rimborso sul tardivo.
    const lateOutcome = isOwnerOrAdmin ? payload.lateOutcome : "defer";
    return await annulFutureAppointment({
      companyId: membership.companyId,
      appointmentId: payload.appointmentId,
      actorUserId: membership.userId,
      lateOutcome,
    });
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * "Cancella tutte" dal dettaglio allievo (web): rimuove tutte le guide future
 * ancora attive dell'allievo (esami/gruppi esclusi). Solo titolare/admin.
 */
export async function hardCleanupAutoscuolaAppointmentsByStudent(input: {
  studentId: string;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const isOwnerOrAdmin =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);
    if (!isOwnerOrAdmin) {
      return {
        success: false,
        message: "Solo il titolare può rimuovere le guide dallo storico.",
      };
    }
    const studentId = z.string().min(1).parse(input?.studentId);
    return await hardCleanupAppointmentsByStudent({
      companyId: membership.companyId,
      studentId,
      actorUserId: membership.userId,
    });
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function rescheduleAutoscuolaAppointment(
  input: z.infer<typeof rescheduleAppointmentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const payload = rescheduleAppointmentSchema.parse(input);

    const isInstructorActor =
      isInstructor(membership.autoscuolaRole) && membership.role !== "admin";
    const isStudentActor =
      membership.autoscuolaRole === "STUDENT" && membership.role !== "admin";
    const isOwnerOrAdminActor =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);

    if (isStudentActor) {
      return {
        success: false,
        message: "Gli allievi non possono spostare le guide dalla app.",
      };
    }
    if (!isInstructorActor && !isOwnerOrAdminActor) {
      return { success: false, message: "Operazione non consentita." };
    }

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId },
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
        types: true,
        slotId: true,
      },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }
    // A studentless exam placeholder is retimed from the exam panel
    // (updateExamTime), not this per-student reschedule flow.
    if (!appointment.studentId) {
      return { success: false, message: "Aggiungi un allievo all'esame prima di spostarlo." };
    }

    const currentStatus = normalizeStatus(appointment.status);
    // Owner/admin can also re-time guides that already happened (checked_in /
    // completed / no_show): it's a record fix, not a real move. Cancelled
    // stays frozen for everyone; instructors keep the strict set.
    const allowedStatuses = isOwnerOrAdminActor
      ? new Set([...RESCHEDULE_ALLOWED_STATUSES, "checked_in", "completed", "no_show"])
      : RESCHEDULE_ALLOWED_STATUSES;
    if (!allowedStatuses.has(currentStatus)) {
      return {
        success: false,
        message:
          "Questa guida non può essere spostata: lo stato attuale non lo consente.",
        code: "APPOINTMENT_NOT_RESCHEDULABLE" as const,
      };
    }

    // Instructor actors can only move their own appointments.
    if (isInstructorActor) {
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
      if (appointment.instructorId !== ownInstructor.id) {
        return {
          success: false,
          message: "Puoi spostare solo le tue guide.",
        };
      }
    }

    const oldStartsAt = appointment.startsAt;
    const oldEndsAt =
      appointment.endsAt ?? new Date(oldStartsAt.getTime() + 30 * 60 * 1000);
    const oldDurationMs = oldEndsAt.getTime() - oldStartsAt.getTime();

    const newStart = new Date(payload.startsAt);
    if (Number.isNaN(newStart.getTime())) {
      return { success: false, message: "Orario di inizio non valido." };
    }
    // A guide that already lives in the past (or is concluded) may be re-timed
    // to another past slot by owner/admin — record fix. What stays forbidden
    // is dragging a FUTURE guide into the past.
    const isRecordFix =
      isOwnerOrAdminActor &&
      (appointment.startsAt.getTime() < Date.now() ||
        ["checked_in", "completed", "no_show"].includes(currentStatus));
    if (newStart.getTime() < Date.now() && !isRecordFix) {
      return {
        success: false,
        message: "Non puoi spostare una guida nel passato.",
      };
    }
    const newEnd = payload.endsAt
      ? new Date(payload.endsAt)
      : new Date(newStart.getTime() + oldDurationMs);
    if (Number.isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return { success: false, message: "Orario di fine non valido." };
    }

    // No-op: same start/end as before.
    if (
      newStart.getTime() === oldStartsAt.getTime() &&
      newEnd.getTime() === oldEndsAt.getTime()
    ) {
      return { success: false, message: "La guida è già in questo orario." };
    }

    // Load service limits once for cutoff / weekly-limit / exam-priority checks.
    const autoscuolaService = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const serviceLimits = (autoscuolaService?.limits ?? {}) as Record<string, unknown>;

    // Lesson policy window (instructor/student paths only; owner bypass matches create).
    if (!isOwnerOrAdminActor) {
      const lessonPolicy = await getLessonPolicyForCompany(companyId);
      if (lessonPolicy.lessonPolicyEnabled) {
        const types = (appointment.types?.length
          ? appointment.types
          : [appointment.type]).filter(isLessonPolicyType);
        if (types.length) {
          const allOk = isLessonTypesAllowedForInterval({
            policy: lessonPolicy,
            types,
            startsAt: newStart,
            endsAt: newEnd,
          });
          if (!allOk) {
            return {
              success: false,
              message:
                "Il tipo guida selezionato non è consentito nella fascia oraria scelta.",
              code: "LESSON_POLICY_WINDOW" as const,
            };
          }
        }
      }
    }

    // Booking cutoff intentionally does NOT apply here. The cutoff is a guard
    // against students booking close to the lesson day; instructors and owners
    // are immune by product design — they need to reschedule even on the same
    // day (e.g. to make room for another student). Students don't reach this
    // function anyway: they're blocked at the top of the action with
    // "Gli allievi non possono spostare le guide dalla app."

    // Weekly limit: only re-check when the new slot falls into a different ISO week.
    const getIsoWeekStart = (date: Date) => {
      const day = date.getUTCDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const ws = new Date(date);
      ws.setUTCDate(ws.getUTCDate() + mondayOffset);
      ws.setUTCHours(0, 0, 0, 0);
      return ws;
    };
    const oldWeekStart = getIsoWeekStart(oldStartsAt);
    const newWeekStart = getIsoWeekStart(newStart);
    const weekChanged = oldWeekStart.getTime() !== newWeekStart.getTime();

    // Waterfall: the student's cluster (assigned autonomous instructor) wins
    // over the company default; an unset cluster value inherits the company.
    const { resolveEffectiveBookingSettings: resolveRescheduleSettings, buildCompanyBookingDefaults: buildRescheduleDefaults } = await import("@/lib/autoscuole/instructor-clusters");
    const rescheduleEffective = await resolveRescheduleSettings(companyId, appointment.studentId, buildRescheduleDefaults(serviceLimits));
    const weeklyLimitEnabled = rescheduleEffective.weeklyBookingLimitEnabled;
    const weeklyLimit = rescheduleEffective.weeklyBookingLimit;
    // Exam priority is a company-wide policy (not cluster-overridable).
    const examPriorityEnabled = serviceLimits.examPriorityEnabled === true;
    const examPriorityDaysBeforeExam =
      typeof serviceLimits.examPriorityDaysBeforeExam === "number" &&
      serviceLimits.examPriorityDaysBeforeExam >= 1
        ? (serviceLimits.examPriorityDaysBeforeExam as number)
        : 14;

    const appointmentIsExam = normalizeLessonType(appointment.type) === "esame";

    if (weeklyLimitEnabled && weekChanged && !appointmentIsExam) {
      const memberRecord = await prisma.companyMember.findFirst({
        where: { companyId, userId: appointment.studentId },
        select: { weeklyBookingLimitExempt: true },
      });
      const isExempt = memberRecord?.weeklyBookingLimitExempt === true;

      let bypassLimit = false;
      if (!isExempt && examPriorityEnabled) {
        const { hasExamPriority } = await import("@/lib/autoscuole/exam-priority");
        bypassLimit = await hasExamPriority(
          companyId,
          appointment.studentId,
          examPriorityDaysBeforeExam,
        );
      }

      if (!isExempt && !bypassLimit) {
        const weekEnd = new Date(newWeekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
        const weekCount = await prisma.autoscuolaAppointment.count({
          where: {
            companyId,
            studentId: appointment.studentId,
            status: { notIn: ["cancelled"] },
            startsAt: { gte: newWeekStart, lt: weekEnd },
            id: { not: appointment.id },
          },
        });
        if (weekCount >= weeklyLimit) {
          if (isInstructorActor) {
            return {
              success: false,
              message: `L'allievo ha già raggiunto il limite di ${weeklyLimit} guide settimanali.`,
              code: "WEEKLY_LIMIT_REACHED" as const,
            };
          }
          // OWNER/ADMIN: surface the confirm signal, matching createAutoscuolaAppointment.
          return {
            success: false,
            message: `L'allievo ha già raggiunto il limite di ${weeklyLimit} guide settimanali (${weekCount} prenotate) nella settimana scelta.`,
            code: "WEEKLY_LIMIT_CONFIRM" as const,
            weeklyLimitData: { current: weekCount, limit: weeklyLimit },
          };
        }
      }
    }

    // Exam-priority day block (only when moving across days; non-exam students only).
    const sameDay =
      oldStartsAt.toDateString() === newStart.toDateString();
    if (!sameDay && !appointmentIsExam && examPriorityEnabled) {
      const examBlockNonExam = serviceLimits.examPriorityBlockNonExam === true;
      const pausedUntilStr =
        typeof serviceLimits.examPriorityPausedUntil === "string"
          ? (serviceLimits.examPriorityPausedUntil as string)
          : null;
      const isPaused = Boolean(pausedUntilStr && new Date(pausedUntilStr) > new Date());
      if (examBlockNonExam && !isPaused) {
        const { getExamPriorityInfo, isDayBlockedByExamPriority } = await import(
          "@/lib/autoscuole/exam-priority"
        );
        const selfInfo = await getExamPriorityInfo(
          companyId,
          appointment.studentId,
          examPriorityDaysBeforeExam,
        );
        if (!selfInfo.active) {
          const { resolveEffectiveBookingSettings } = await import(
            "@/lib/autoscuole/instructor-clusters"
          );
          const clusterSettings = await resolveEffectiveBookingSettings(
            companyId,
            appointment.studentId,
            { bookingSlotDurations: [], roundedHoursOnly: false },
          );
          const studentMember = await prisma.companyMember.findFirst({
            where: {
              companyId,
              userId: appointment.studentId,
              autoscuolaRole: "STUDENT",
            },
            select: { assignedInstructorId: true },
          });
          const scope = clusterSettings.isLockedToInstructor
            ? studentMember?.assignedInstructorId ?? null
            : null;
          const dayStart = new Date(newStart);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);
          const blocked = await isDayBlockedByExamPriority({
            companyId,
            studentInstructorId: scope,
            dayStart,
            dayEnd,
            daysBeforeExam: examPriorityDaysBeforeExam,
            slotStartsAt: newStart,
          });
          if (blocked) {
            return {
              success: false,
              message: scope
                ? "Questo giorno è riservato agli allievi del tuo gruppo prossimi all'esame."
                : "Questo giorno è riservato agli allievi prossimi all'esame.",
              code: "EXAM_PRIORITY_DAY_BLOCKED" as const,
            };
          }
        }
      }
    }

    // Overlap check: appointments (other than current) and instructor blocks.
    const scanStart = new Date(newStart);
    scanStart.setDate(scanStart.getDate() - 1);
    const scanEnd = new Date(newEnd);
    scanEnd.setDate(scanEnd.getDate() + 1);

    const overlapOr: Array<{
      instructorId?: string;
      vehicleId?: string;
    }> = [];
    if (appointment.instructorId) overlapOr.push({ instructorId: appointment.instructorId });
    if (appointment.vehicleId) overlapOr.push({ vehicleId: appointment.vehicleId });

    if (overlapOr.length) {
      const conflicts = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          id: { not: appointment.id },
          startsAt: { gte: scanStart, lt: scanEnd },
          status: { notIn: ["cancelled"] },
          OR: overlapOr,
        },
        select: {
          instructorId: true,
          vehicleId: true,
          startsAt: true,
          endsAt: true,
        },
      });
      const conflict = conflicts.find((item) => {
        const start = item.startsAt;
        const end = item.endsAt ?? new Date(start.getTime() + 30 * 60 * 1000);
        return start < newEnd && end > newStart;
      });
      if (conflict) {
        const byInstructor =
          appointment.instructorId &&
          conflict.instructorId === appointment.instructorId;
        return {
          success: false,
          message: byInstructor
            ? "L'istruttore ha già una guida in quel momento."
            : "Il veicolo è prenotato da un'altra guida in quel momento.",
          code: "OVERLAP_APPOINTMENT" as const,
        };
      }
    }

    if (appointment.instructorId) {
      const blocks = await prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          instructorId: appointment.instructorId,
          startsAt: { lt: newEnd },
          endsAt: { gt: newStart },
        },
        select: { startsAt: true, endsAt: true, reason: true },
      });
      if (blocks.length) {
        return {
          success: false,
          message:
            "L'istruttore non è disponibile in quel giorno/orario.",
          code: "OVERLAP_INSTRUCTOR_BLOCK" as const,
        };
      }
    }

    // Transactional update + slot reconciliation.
    const updated = await prisma.$transaction(async (tx) => {
      // Re-check status to guard against mid-flight cancellation/completion races.
      const current = await tx.autoscuolaAppointment.findUnique({
        where: { id: appointment.id },
        select: { status: true, startsAt: true, endsAt: true },
      });
      if (!current || !allowedStatuses.has(normalizeStatus(current.status))) {
        throw new Error("APPOINTMENT_NOT_RESCHEDULABLE");
      }

      // Try to link to an existing open slot at the new position (best-effort).
      let newSlotId: string | null = null;
      if (appointment.instructorId) {
        const freshSlot = await tx.autoscuolaAvailabilitySlot.findFirst({
          where: {
            companyId,
            ownerType: "instructor",
            ownerId: appointment.instructorId,
            startsAt: newStart,
            status: { in: ["open", "booked"] },
          },
          select: { id: true },
        });
        if (freshSlot) newSlotId = freshSlot.id;
      }

      const row = await tx.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          startsAt: newStart,
          endsAt: newEnd,
          slotId: newSlotId,
          rescheduledAt: new Date(),
          rescheduledFromStartsAt: oldStartsAt,
        },
      });

      // Release the old slot row(s): anything booked in the old range for this
      // student/instructor/vehicle should become open again.
      const rangeEnd = appointment.endsAt ?? new Date(oldStartsAt.getTime() + 30 * 60 * 1000);
      const ownerFilters: Array<{ ownerType: string; ownerId: string }> = [
        ...(appointment.studentId ? [{ ownerType: "student", ownerId: appointment.studentId }] : []),
      ];
      if (appointment.instructorId) {
        ownerFilters.push({ ownerType: "instructor", ownerId: appointment.instructorId });
      }
      if (appointment.vehicleId) {
        ownerFilters.push({ ownerType: "vehicle", ownerId: appointment.vehicleId });
      }
      // Release the slot rows of every linked vehicle too (follow car, extra motos).
      const linkedVehicles = await tx.autoscuolaAppointmentVehicle.findMany({
        where: { appointmentId: appointment.id },
        select: { vehicleId: true },
      });
      for (const link of linkedVehicles) {
        if (link.vehicleId !== appointment.vehicleId) {
          ownerFilters.push({ ownerType: "vehicle", ownerId: link.vehicleId });
        }
      }
      await tx.autoscuolaAvailabilitySlot.updateMany({
        where: {
          companyId,
          status: "booked",
          startsAt: { gte: oldStartsAt, lt: rangeEnd },
          OR: ownerFilters,
        },
        data: { status: "open" },
      });

      // If we linked a new slot, mark it booked.
      if (newSlotId) {
        await tx.autoscuolaAvailabilitySlot.update({
          where: { id: newSlotId },
          data: { status: "booked" },
        });
      }

      return row;
    });

    await invalidateAgendaAndPaymentsCache(companyId);

    // Fire-and-forget notifications (errors logged inside the helper).
    // Pure record fixes (past guide re-timed to another PAST slot) stay
    // silent: pinging the student "la tua guida è stata spostata" about a
    // lesson that already happened would only confuse them. Moving a past
    // guide to a FUTURE slot still notifies.
    const silentRecordFix = isRecordFix && newStart.getTime() < Date.now();
    const actorRole: "instructor" | "owner" | "admin" = isInstructorActor
      ? "instructor"
      : membership.role === "admin"
        ? "admin"
        : "owner";
    const reschedNotifyStudentId = updated.studentId;
    if (!silentRecordFix && reschedNotifyStudentId) await notifyAppointmentRescheduled({
      companyId,
      actorUserId: membership.userId,
      actorRole,
      appointment: {
        id: updated.id,
        studentId: reschedNotifyStudentId,
        startsAt: updated.startsAt,
        endsAt: updated.endsAt,
        instructorId: updated.instructorId,
      },
      oldStartsAt,
    });

    const serializedAppointment = {
      ...updated,
      priceAmount: Number(updated.priceAmount),
      penaltyAmount: Number(updated.penaltyAmount),
      paidAmount: Number(updated.paidAmount),
    };

    return {
      success: true as const,
      data: serializedAppointment,
      message: "Guida spostata.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_RESCHEDULABLE") {
      return {
        success: false,
        message: "La guida non è più spostabile.",
        code: "APPOINTMENT_NOT_RESCHEDULABLE" as const,
      };
    }
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
      membership.role === "admin" || isOwner(membership.autoscuolaRole);
    if (!canDelete) {
      return {
        success: false,
        message: "Solo admin o titolare possono cancellare un evento.",
      };
    }

    const payload = deleteAppointmentSchema.parse(input);
    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }
    const response = await operationallyCancelAppointment({
      companyId: membership.companyId,
      appointmentId: appointment.id,
      reason: "owner_delete",
      actorUserId: membership.userId,
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message ?? "Impossibile cancellare la guida.",
      };
    }

    return {
      success: true,
      data: { deleted: false, cancelled: true },
      message: "Guida cancellata. Il credito è stato restituito all'allievo.",
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

    // Cancellations must use dedicated endpoints (/cancel, /permanent-cancel)
    if (nextStatus === "cancelled") {
      return {
        success: false,
        message: "Usa la funzione di annullamento dedicata per cancellare una guida.",
      };
    }

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      include: {
        instructor: { select: { id: true, userId: true } },
      },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }

    const currentStatus = normalizeStatus(appointment.status);

    // Block check-in / no-show on proposals — the student must accept first
    if (
      currentStatus === "proposal" &&
      (nextStatus === "checked_in" || nextStatus === "no_show")
    ) {
      return {
        success: false,
        message: "Non puoi segnare check-in o no-show su una guida proposta. L'allievo deve prima accettarla.",
      };
    }

    // Block check-in / no-show on cancelled appointments
    if (
      currentStatus === "cancelled" &&
      (nextStatus === "checked_in" || nextStatus === "no_show")
    ) {
      return {
        success: false,
        message: "Non puoi segnare check-in o assente su una guida già annullata.",
      };
    }

    if (isInstructor(membership.autoscuolaRole) && membership.role !== "admin") {
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
      // Unica guardia: "troppo presto" (prima di 10 min dall'inizio non si segna
      // presenza/assenza). NESSUN limite superiore: l'istruttore può CORREGGERE
      // l'esito delle proprie guide anche a giornata/data passata — es. annullare
      // un'assenza messa per sbaglio. I pending_review restano senza finestra.
      if (currentStatus !== "pending_review") {
        const opensAt = new Date(appointment.startsAt.getTime() - 10 * 60 * 1000);
        if (now < opensAt) {
          return {
            success: false,
            message: `Azione disponibile dalle ${getInstructorWindowOpenTimeLabel(
              appointment.startsAt,
            )}.`,
          };
        }
      }
    }

    const requestedLessonType = normalizeLessonType(payload.lessonType);
    const requestedLessonTypes = payload.lessonTypes?.map(normalizeLessonType).filter(Boolean) ?? [];
    const appointmentLessonType = normalizeLessonType(appointment.type);
    const appointmentEnd = computeAppointmentEnd({
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });
    let enforceRequiredTypeSelection = false;
    let compatibleMissingTypes: string[] = [];

    if (isInstructor(membership.autoscuolaRole) && membership.role !== "admin") {
      const lessonPolicy = await getLessonPolicyForCompany(membership.companyId);
      const coverageStudentId = appointment.studentId;
      if (
        coverageStudentId &&
        lessonPolicy.lessonPolicyEnabled &&
        lessonPolicy.lessonRequiredTypesEnabled &&
        lessonPolicy.lessonRequiredTypes.length
      ) {
        const coverage = await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: coverageStudentId,
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
      types?: string[];
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

    // Resolve types array: prefer lessonTypes[], fallback to single lessonType
    const resolveTypes = (): string[] => {
      if (requestedLessonTypes.length) return requestedLessonTypes;
      if (requestedLessonType) return [requestedLessonType];
      return [];
    };

    if (nextStatus === "checked_in") {
      const types = resolveTypes();
      const resolvedLessonType = types[0] || appointmentLessonType;
      if (!resolvedLessonType || !LESSON_TYPE_SET.has(resolvedLessonType)) {
        return {
          success: false,
          message: "Seleziona un tipo guida valido.",
        };
      }
      for (const t of (types.length ? types : [resolvedLessonType])) {
        if (!LESSON_TYPE_SET.has(t)) {
          return { success: false, message: "Uno o più tipi guida non validi." };
        }
        if (!isInstructorTypeAllowed(t)) {
          return {
            success: false,
            message: `Seleziona un tipo guida compatibile (${formatLessonTypesList(
              compatibleMissingTypes,
            )}).`,
          };
        }
      }
      const finalTypes = types.length ? types : [resolvedLessonType];
      updateData.type = finalTypes[0];
      updateData.types = finalTypes;
    } else if (nextStatus === "no_show") {
      const types = resolveTypes();
      if (types.length) {
        for (const t of types) {
          if (!LESSON_TYPE_SET.has(t)) {
            return { success: false, message: "Tipo guida non valido." };
          }
          if (!isInstructorTypeAllowed(t)) {
            return {
              success: false,
              message: `Tipo guida non compatibile (${formatLessonTypesList(
                compatibleMissingTypes,
              )}).`,
            };
          }
        }
        updateData.type = types[0];
        updateData.types = types;
      }
    } else {
      const types = resolveTypes();
      if (types.length) {
        for (const t of types) {
          if (!LESSON_TYPE_SET.has(t)) {
            return { success: false, message: "Tipo guida non valido." };
          }
          if (!isInstructorTypeAllowed(t)) {
            return {
              success: false,
              message: `Tipo guida non compatibile (${formatLessonTypesList(
                compatibleMissingTypes,
              )}).`,
            };
          }
        }
        updateData.type = types[0];
        updateData.types = types;
      }
    }

    // Auto-complete if marking checked_in on a past lesson
    if (nextStatus === "checked_in") {
      const endTime = appointment.endsAt ?? new Date(appointment.startsAt.getTime() + 60 * 60 * 1000);
      if (new Date() >= endTime) {
        updateData.status = "completed";
      }
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
      // Try to apply lesson credit for appointments created without credits (optional credits flow)
      try {
        await applyLessonCreditToExistingAppointment({
          appointmentId: updated.id,
          actorUserId: membership.userId,
        });
      } catch (error) {
        console.error("Autoscuola credit apply at check-in error", error);
      }

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
        isOwner(membership.autoscuolaRole) ||
        isInstructor(membership.autoscuolaRole);
      await refundLessonCreditIfEligible({
        appointmentId: updated.id,
        cancelledByAutoscuola,
        actorUserId: membership.userId,
      });

      const manualCancelNotifyStudentId = updated.studentId;
      if (manualCancelNotifyStudentId) {
        await notifyStudentAppointmentCancelled({
          companyId: membership.companyId,
          actorUserId: membership.userId,
          appointment: {
            id: updated.id,
            studentId: manualCancelNotifyStudentId,
            startsAt: updated.startsAt,
            instructorId: updated.instructorId ?? null,
          },
          cancellationKind: "manual_cancel",
          actorRole: isInstructor(membership.autoscuolaRole) ? "instructor" : membership.role === "admin" ? "admin" : "owner",
        });
      }
    }

    // Reverse credits when reverting auto-checked-in appointment to no_show
    if (
      nextStatus === "no_show" &&
      (currentStatus === "checked_in" || currentStatus === "completed")
    ) {
      try {
        await refundLessonCreditIfEligible({
          appointmentId: updated.id,
          cancelledByAutoscuola: true,
          actorUserId: membership.userId,
        });
      } catch (error) {
        console.error(
          "Autoscuola credit refund on no_show reversal error",
          error,
        );
      }
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

    if (isInstructor(membership.autoscuolaRole) && membership.role !== "admin") {
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

      // Tipo guida / valutazione / note (e luogo / veicolo) restano modificabili
      // dall'istruttore proprietario anche sulle guide già concluse, senza limite
      // di fine giornata: una valutazione o una nota si aggiungono a posteriori.
      // Il cambio ISTRUTTORE resta comunque bloccato a valle per le guide concluse.
    }

    const updateData: { type?: string; types?: string[]; rating?: number | null; notes?: string | null; locationId?: string | null; vehicleId?: string | null; instructorId?: string; endsAt?: Date } = {};
    const appointmentLessonType = normalizeLessonType(appointment.type);
    const appointmentEnd = computeAppointmentEnd({
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });
    // Modifica durata: start invariato, endsAt = start + durationMin. Consentita
    // anche sul passato/concluso; il conflitto si ricontrolla più sotto solo se
    // la durata cresce su una guida futura.
    const currentDurationMin = Math.round(
      (appointmentEnd.getTime() - appointment.startsAt.getTime()) / 60000,
    );
    const durationChanged =
      payload.durationMin != null && payload.durationMin !== currentDurationMin;
    const newEndsAt = durationChanged
      ? new Date(appointment.startsAt.getTime() + payload.durationMin! * 60000)
      : null;
    if (newEndsAt) {
      updateData.endsAt = newEndsAt;
    }
    let enforceRequiredTypeSelection = false;
    let compatibleMissingTypes: string[] = [];
    const isInstructorRole =
      isInstructor(membership.autoscuolaRole) && membership.role !== "admin";

    if (isInstructorRole) {
      const lessonPolicy = await getLessonPolicyForCompany(membership.companyId);
      const coverageStudentId = appointment.studentId;
      if (
        coverageStudentId &&
        lessonPolicy.lessonPolicyEnabled &&
        lessonPolicy.lessonRequiredTypesEnabled &&
        lessonPolicy.lessonRequiredTypes.length
      ) {
        const coverage = await getStudentLessonPolicyCoverage({
          companyId: membership.companyId,
          studentId: coverageStudentId,
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

    // Handle types: prefer lessonTypes[], fallback to lessonType
    const requestedTypes = payload.lessonTypes?.map(normalizeLessonType).filter(Boolean) ?? [];
    if (requestedTypes.length) {
      for (const t of requestedTypes) {
        if (!LESSON_TYPE_SET.has(t)) {
          return { success: false, message: "Uno o più tipi guida non validi." };
        }
        if (isInstructorRole && !isInstructorTypeAllowed(t)) {
          return {
            success: false,
            message: `Tipo guida non compatibile (${formatLessonTypesList(
              compatibleMissingTypes,
            )}).`,
          };
        }
      }
      updateData.type = requestedTypes[0];
      updateData.types = requestedTypes;
    } else if (payload.lessonType !== undefined) {
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
      updateData.types = [normalizedLessonType];
    }

    // Handle rating
    if (payload.rating !== undefined) {
      const appointmentStatus = normalizeStatus(appointment.status);
      if (!["checked_in", "completed", "no_show"].includes(appointmentStatus)) {
        return { success: false, message: "Puoi valutare solo guide già effettuate." };
      }
      updateData.rating = payload.rating;
    }

    if (payload.notes !== undefined) {
      const normalizedNotes = normalizeText(payload.notes);
      updateData.notes = normalizedNotes || null;
    }

    // Handle location change
    let locationChangedTo: { id: string; name: string; isDefault: boolean } | null = null;
    let locationChangedFrom: { id: string; name: string; isDefault: boolean } | null = null;
    if (payload.locationId !== undefined) {
      if (payload.locationId === null) {
        if (appointment.locationId !== null) {
          locationChangedFrom = await loadLocationSummary(appointment.locationId);
          updateData.locationId = null;
        }
      } else {
        if (payload.locationId !== appointment.locationId) {
          const newLoc = await prisma.autoscuolaLocation.findFirst({
            where: {
              id: payload.locationId,
              companyId: membership.companyId,
              archivedAt: null,
            },
            select: { id: true, name: true, isDefault: true },
          });
          if (!newLoc) {
            return {
              success: false,
              message: "Luogo non valido per questa autoscuola.",
            };
          }
          locationChangedTo = newLoc;
          if (appointment.locationId) {
            locationChangedFrom = await loadLocationSummary(appointment.locationId);
          }
          updateData.locationId = payload.locationId;
        }
      }
    }

    // Handle vehicle change. Vehicles are company resources, so we only verify
    // the vehicle belongs to the company and is active (same check as booking).
    // null = unassign ("Da assegnare").
    if (payload.vehicleId !== undefined) {
      if (payload.vehicleId === null) {
        if (appointment.vehicleId !== null) {
          updateData.vehicleId = null;
        }
      } else if (payload.vehicleId !== appointment.vehicleId) {
        const newVehicle = await prisma.autoscuolaVehicle.findFirst({
          where: { id: payload.vehicleId, companyId: membership.companyId, status: "active" },
          select: { id: true },
        });
        if (!newVehicle) {
          return {
            success: false,
            message: "Veicolo non valido per questa autoscuola.",
          };
        }
        updateData.vehicleId = payload.vehicleId;
      }
    }

    // Handle follow car (auto al seguito) change. Validate it belongs to the
    // company and is active; the reconcile step below keeps it consistent with
    // the primary (a follow without a primary is impossible). Like the primary,
    // vehicles are company resources so there's no per-instructor ownership.
    let followVehicleChanged = false;
    let desiredFollowVehicleId: string | null = null;
    if (payload.followVehicleId !== undefined) {
      if (payload.followVehicleId !== null) {
        const followVehicle = await prisma.autoscuolaVehicle.findFirst({
          where: {
            id: payload.followVehicleId,
            companyId: membership.companyId,
            status: "active",
          },
          select: { id: true },
        });
        if (!followVehicle) {
          return {
            success: false,
            message: "Auto al seguito non valida per questa autoscuola.",
          };
        }
      }
      desiredFollowVehicleId = payload.followVehicleId;
      followVehicleChanged = true;
    }

    // Handle extra moto vehicles (a moto guida occupying more than one moto). The
    // provided set REPLACES the current extras. Each must belong to the company,
    // be active and be a moto. Reconciled as additional role="primary" join rows.
    let extraMotosChanged = false;
    let desiredExtraMotoVehicleIds: string[] = [];
    if (payload.extraMotoVehicleIds !== undefined) {
      const uniqueIds = Array.from(new Set(payload.extraMotoVehicleIds));
      if (uniqueIds.length) {
        const motos = await prisma.autoscuolaVehicle.findMany({
          where: {
            id: { in: uniqueIds },
            companyId: membership.companyId,
            status: "active",
          },
          select: { id: true, licenseCategory: true },
        });
        const validIds = new Set(motos.map((m) => m.id));
        if (!uniqueIds.every((id) => validIds.has(id))) {
          return {
            success: false,
            message: "Veicolo moto extra non valido per questa autoscuola.",
          };
        }
        if (!motos.every((m) => isMotoLicenseCategory(m.licenseCategory))) {
          return {
            success: false,
            message: "I veicoli aggiuntivi devono essere moto.",
          };
        }
      }
      desiredExtraMotoVehicleIds = uniqueIds;
      extraMotosChanged = true;
    }

    // Handle instructor change (cluster-level single-lesson reassignment).
    // Allowed for owner/admin and for the current instructor "passing" the
    // lesson to a colleague. The student's assignedInstructorId is NOT
    // touched (decision: single-lesson override, not permanent re-assignment).
    // The vehicle stays attached (decision: vehicles are company resources,
    // not instructor-owned).
    if (payload.instructorId !== undefined && payload.instructorId !== appointment.instructorId) {
      // Block on completed/cancelled appointments: it doesn't make sense to
      // reassign a guida that's already happened or been called off.
      const status = normalizeStatus(appointment.status);
      if (["cancelled", "completed", "no_show"].includes(status)) {
        return {
          success: false,
          message: "Non puoi cambiare l'istruttore di una guida già conclusa o annullata.",
        };
      }

      const appointmentEndDate = computeAppointmentEnd({
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
      });
      const availability = await verifyInstructorAvailability({
        companyId: membership.companyId,
        instructorId: payload.instructorId,
        startsAt: appointment.startsAt,
        endsAt: appointmentEndDate,
        excludeAppointmentId: appointment.id,
      });
      if (!availability.available) {
        return {
          success: false,
          message: availability.detail,
          code: "INSTRUCTOR_UNAVAILABLE" as const,
        };
      }

      // Push notification to the student about the instructor swap is deferred:
      // it would require a new notification kind on mobile + handler. For now
      // the change is silent server-side; the student will see the new
      // instructor next time the app refetches the appointment.
      updateData.instructorId = payload.instructorId;
    }

    // Whether the reserved vehicles (primary and/or follow car) need the join
    // table reconciled. The primary lives both on `appointment.vehicleId` and
    // as the role="primary" join row; the follow car is the role="follow" row.
    const primaryChanged = updateData.vehicleId !== undefined;
    const vehiclesNeedSync =
      primaryChanged || followVehicleChanged || extraMotosChanged;

    if (!Object.keys(updateData).length && !vehiclesNeedSync) {
      return { success: false, message: "Nessuna modifica da salvare." };
    }

    // Resolve the FINAL primary + follow + extra motos so reconcile (which wipes
    // and rewrites the rows) preserves whichever side the user didn't touch.
    const finalPrimaryVehicleId = primaryChanged
      ? updateData.vehicleId ?? null
      : appointment.vehicleId;
    let finalFollowVehicleId = desiredFollowVehicleId;
    if (vehiclesNeedSync && !followVehicleChanged) {
      const existingFollow = await prisma.autoscuolaAppointmentVehicle.findFirst({
        where: { appointmentId: appointment.id, role: "follow" },
        select: { vehicleId: true },
      });
      finalFollowVehicleId = existingFollow?.vehicleId ?? null;
    }
    let finalExtraMotoVehicleIds = desiredExtraMotoVehicleIds;
    if (vehiclesNeedSync && !extraMotosChanged) {
      // Preserve existing extra motos: every role="primary" row except the
      // representative primary. Exclude BOTH the new and the OLD primary:
      // filtering only the new one turned the previous vehicle into a ghost
      // "extra" on every primary change (guides showing two cars at
      // Autoscuola Robatto, 2026-07-06).
      const existingPrimaries =
        await prisma.autoscuolaAppointmentVehicle.findMany({
          where: { appointmentId: appointment.id, role: "primary" },
          select: { vehicleId: true },
        });
      finalExtraMotoVehicleIds = existingPrimaries
        .map((r) => r.vehicleId)
        .filter((id) => id !== finalPrimaryVehicleId && id !== appointment.vehicleId);
    }

    // Moto-only rule: extra motos and the follow car exist only when the FINAL
    // primary vehicle is a moto. Explicitly provided on a non-moto guida →
    // error; inherited ones (e.g. switching a moto guida onto a car) are
    // silently dropped by the reconcile below.
    if (vehiclesNeedSync && (finalExtraMotoVehicleIds.length || finalFollowVehicleId)) {
      const finalPrimary = finalPrimaryVehicleId
        ? await prisma.autoscuolaVehicle.findFirst({
            where: { id: finalPrimaryVehicleId, companyId: membership.companyId },
            select: { licenseCategory: true },
          })
        : null;
      const primaryIsMoto =
        !!finalPrimary && isMotoLicenseCategory(finalPrimary.licenseCategory);
      if (!primaryIsMoto) {
        if (extraMotosChanged && desiredExtraMotoVehicleIds.length) {
          return {
            success: false,
            message: "Le moto aggiuntive sono consentite solo sulle guide in moto.",
          };
        }
        if (followVehicleChanged && desiredFollowVehicleId) {
          return {
            success: false,
            message: "L'auto al seguito è consentita solo sulle guide in moto.",
          };
        }
        finalExtraMotoVehicleIds = [];
        finalFollowVehicleId = null;
      }
    }

    // Conflict check on the vehicles being ADDED by this edit: changing a
    // lesson's vehicle bypassed every overlap check (double-booked Yaris at
    // Robatto, 2026-07-03 — the create path would have blocked it). Only the
    // added ids are checked, so a pre-existing overlap on an untouched vehicle
    // never blocks unrelated edits; past lessons stay editable (record fixes).
    if (vehiclesNeedSync && appointmentEnd.getTime() > Date.now()) {
      const currentRows = await prisma.autoscuolaAppointmentVehicle.findMany({
        where: { appointmentId: appointment.id },
        select: { vehicleId: true },
      });
      const currentReserved = new Set(
        [appointment.vehicleId, ...currentRows.map((r) => r.vehicleId)].filter(Boolean),
      );
      const addedVehicleIds = [
        finalPrimaryVehicleId,
        finalFollowVehicleId,
        ...finalExtraMotoVehicleIds,
      ].filter((id): id is string => Boolean(id) && !currentReserved.has(id as string));
      if (addedVehicleIds.length) {
        const conflict = await findVehicleReservationConflict({
          companyId: membership.companyId,
          startsAt: appointment.startsAt,
          endsAt: appointmentEnd,
          vehicleIds: addedVehicleIds,
          excludeAppointmentId: appointment.id,
        });
        if (conflict) {
          return {
            success: false,
            message: "Veicolo già impegnato in quell'orario su un'altra guida.",
            code: "VEHICLE_UNAVAILABLE" as const,
          };
        }
      }
    }

    // Durata cresciuta su una guida futura → l'intervallo esteso potrebbe
    // sovrapporsi ad altre guide. Ricontrolliamo veicoli (tutti quelli riservati)
    // e istruttore sul nuovo [start, newEnd). Sul passato o se accorciamo, nessun
    // blocco: è un record fix e l'intervallo non cresce oltre l'attuale.
    if (
      newEndsAt &&
      newEndsAt.getTime() > appointmentEnd.getTime() &&
      newEndsAt.getTime() > Date.now()
    ) {
      const reservedVehicleIds = [
        finalPrimaryVehicleId,
        finalFollowVehicleId,
        ...finalExtraMotoVehicleIds,
      ].filter((id): id is string => Boolean(id));
      if (reservedVehicleIds.length) {
        const conflict = await findVehicleReservationConflict({
          companyId: membership.companyId,
          startsAt: appointment.startsAt,
          endsAt: newEndsAt,
          vehicleIds: reservedVehicleIds,
          excludeAppointmentId: appointment.id,
        });
        if (conflict) {
          return {
            success: false,
            message: "Veicolo già impegnato in quell'orario: riduci la durata o cambia veicolo.",
            code: "VEHICLE_UNAVAILABLE" as const,
          };
        }
      }
      const resolvedInstructorId = updateData.instructorId ?? appointment.instructorId;
      if (resolvedInstructorId) {
        const availability = await verifyInstructorAvailability({
          companyId: membership.companyId,
          instructorId: resolvedInstructorId,
          startsAt: appointment.startsAt,
          endsAt: newEndsAt,
          excludeAppointmentId: appointment.id,
        });
        if (!availability.available) {
          return {
            success: false,
            message:
              availability.detail ?? "L'istruttore non è libero per la durata estesa.",
          };
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = Object.keys(updateData).length
        ? await tx.autoscuolaAppointment.update({
            where: { id: payload.appointmentId, companyId: membership.companyId },
            data: updateData,
          })
        : await tx.autoscuolaAppointment.findUniqueOrThrow({
            where: { id: payload.appointmentId },
          });
      if (vehiclesNeedSync) {
        await reconcileAppointmentVehicles(
          tx,
          appointment.id,
          finalPrimaryVehicleId,
          finalFollowVehicleId,
          finalExtraMotoVehicleIds,
        );
      }
      return row;
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    // Notify student about location change on future appointments
    if (
      updateData.locationId !== undefined &&
      appointment.startsAt.getTime() > Date.now() &&
      appointment.studentId !== membership.userId
    ) {
      try {
        const when = appointment.startsAt.toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        });
        const newName = locationChangedTo?.name ?? "Sede dell'autoscuola";
        const oldName = locationChangedFrom?.name ?? "Sede dell'autoscuola";
        await sendAutoscuolaPushToUsers({
          companyId: membership.companyId,
          userIds: appointment.studentId ? [appointment.studentId] : [],
          title: "📍 Luogo guida aggiornato",
          body: `Il luogo della tua guida del ${when} è cambiato: ${newName}.`,
          data: {
            kind: "appointment_location_changed",
            appointmentId: appointment.id,
            startsAt: appointment.startsAt.toISOString(),
            oldLocationName: oldName,
            newLocationName: newName,
          },
        });
      } catch (error) {
        console.error("Appointment location change push error", error);
      }
    }

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

async function loadLocationSummary(id: string) {
  return prisma.autoscuolaLocation.findUnique({
    where: { id },
    select: { id: true, name: true, isDefault: true },
  });
}


/**
 * Result of verifyInstructorAvailability(): either the instructor is available
 * for the given time range, or we have a structured reason why not. The
 * `detail` string is a human-friendly message ready to render in the UI.
 */
type InstructorAvailabilityResult =
  | { available: true }
  | {
      available: false;
      reason: "OVERLAP" | "BLOCK" | "HOLIDAY" | "INSTRUCTOR_INACTIVE";
      detail: string;
    };

/**
 * Check whether a target instructor is free for [startsAt, endsAt) inside a
 * specific company. Used by:
 *   - updateAutoscuolaAppointmentDetails when changing the assigned instructor
 *   - the /api/autoscuole/instructor-availability endpoint (live inline
 *     validation in the web edit dialog and the mobile picker sheet)
 *
 * Checks (in order, short-circuit):
 *   1. Instructor exists in company and is not inactive.
 *   2. No company holiday on that calendar day (Europe/Rome).
 *   3. No instructor block-slot overlapping the range.
 *   4. No other active (non-cancelled) appointment for the same instructor
 *      overlapping the range. excludeAppointmentId lets the caller skip the
 *      appointment currently being edited.
 *
 * Note: we intentionally do NOT verify that the range falls within the
 * instructor's weekly/daily availability — by product decision the titolare
 * may assign a guida to an instructor even outside their declared schedule
 * (e.g. to cover an emergency on a day the instructor doesn't normally work).
 */
async function verifyInstructorAvailability({
  companyId,
  instructorId,
  startsAt,
  endsAt,
  excludeAppointmentId,
}: {
  companyId: string;
  instructorId: string;
  startsAt: Date;
  endsAt: Date;
  excludeAppointmentId?: string;
}): Promise<InstructorAvailabilityResult> {
  if (endsAt <= startsAt) {
    return { available: false, reason: "OVERLAP", detail: "Intervallo non valido." };
  }

  // 1. Instructor exists + active
  const instructor = await prisma.autoscuolaInstructor.findFirst({
    where: { id: instructorId, companyId },
    select: { id: true, name: true, status: true },
  });
  if (!instructor) {
    return {
      available: false,
      reason: "INSTRUCTOR_INACTIVE",
      detail: "Istruttore non trovato in questa autoscuola.",
    };
  }
  if (instructor.status === "inactive") {
    return {
      available: false,
      reason: "INSTRUCTOR_INACTIVE",
      detail: `${instructor.name} non è attivo in questa autoscuola.`,
    };
  }

  // 2. Company holiday on that day (date is stored as @db.Date in Europe/Rome)
  // We approximate by checking the day of startsAt; appointments don't span days.
  const dayStart = new Date(
    Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()),
  );
  const holiday = await prisma.autoscuolaHoliday.findFirst({
    where: { companyId, date: dayStart },
    select: { label: true, date: true },
  });
  if (holiday) {
    const dayStr = startsAt.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      timeZone: "Europe/Rome",
    });
    return {
      available: false,
      reason: "HOLIDAY",
      detail: holiday.label
        ? `${dayStr} è dichiarato festivo (${holiday.label}).`
        : `${dayStr} è dichiarato festivo.`,
    };
  }

  // 3. Block-slot overlap
  const overlappingBlock = await prisma.autoscuolaInstructorBlock.findFirst({
    where: {
      companyId,
      instructorId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { startsAt: true, endsAt: true, reason: true },
  });
  if (overlappingBlock) {
    const from = overlappingBlock.startsAt.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
    const to = overlappingBlock.endsAt.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
    const rawBlockReason = overlappingBlock.reason?.trim();
    const blockReasonLabel =
      rawBlockReason === "theory_lesson" ? "Lezione teorica"
      : rawBlockReason === "sick_leave" ? "Malattia"
      : rawBlockReason === "ferie" ? "Ferie"
      : rawBlockReason;
    const reasonSuffix = blockReasonLabel ? ` (${blockReasonLabel})` : "";
    return {
      available: false,
      reason: "BLOCK",
      detail: `${instructor.name} ha un blocco manuale dalle ${from} alle ${to}${reasonSuffix}.`,
    };
  }

  // 4. Overlapping active appointment
  const overlappingAppointment = await prisma.autoscuolaAppointment.findFirst({
    where: {
      companyId,
      instructorId,
      status: { notIn: ["cancelled"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  if (overlappingAppointment) {
    const overlapEnd = computeAppointmentEnd({
      startsAt: overlappingAppointment.startsAt,
      endsAt: overlappingAppointment.endsAt,
    });
    const from = overlappingAppointment.startsAt.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
    const to = overlapEnd.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
    return {
      available: false,
      reason: "OVERLAP",
      detail: `${instructor.name} ha già una guida dalle ${from} alle ${to}.`,
    };
  }

  return { available: true };
}

/**
 * Public action: check if an instructor is available for a given time range.
 * Mirrors the validation done inside updateAutoscuolaAppointmentDetails so the
 * UI can preview the verdict before the user commits.
 *
 * Authorization: owner, admin, or any instructor in the company.
 */
export async function checkInstructorAvailability(
  input: z.infer<typeof checkInstructorAvailabilitySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = checkInstructorAvailabilitySchema.parse(input);

    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false, message: "Operazione non consentita." };
    }

    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { success: false, message: "Date non valide." };
    }

    const result = await verifyInstructorAvailability({
      companyId: membership.companyId,
      instructorId: payload.instructorId,
      startsAt,
      endsAt,
      excludeAppointmentId: payload.excludeAppointmentId,
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * Did THIS student cancel a guida that started at THIS instant?
 * Powers the orange "l'allievo aveva annullato una guida in questo orario"
 * banner inside the web booking popover — purely informative, never blocks
 * the booking. Source = AutoscuolaNotification rows (kind
 * "student_cancellation"), i.e. only cancellations the student made themself.
 * Duration is ignored on purpose: we match on the start instant only.
 */
export async function checkStudentSlotCancellation(
  input: z.infer<typeof checkStudentSlotCancellationSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = checkStudentSlotCancellationSchema.parse(input);

    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false, message: "Operazione non consentita." };
    }

    const startsAt = new Date(payload.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      return { success: false, message: "Data non valida." };
    }
    // Match the whole minute so any seconds/millis drift between the stored
    // cancellation and the freshly-picked slot doesn't hide a real hit.
    const minuteStart = new Date(startsAt);
    minuteStart.setSeconds(0, 0);
    const minuteEnd = new Date(minuteStart.getTime() + 60_000);

    const hit = await prisma.autoscuolaNotification.findFirst({
      where: {
        companyId: membership.companyId,
        kind: "student_cancellation",
        studentId: payload.studentId,
        startsAt: { gte: minuteStart, lt: minuteEnd },
      },
      select: { id: true },
    });

    return { success: true, data: { hadCancellation: hit != null } };
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

export async function getAutoscuolaInstructorsDashboard() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const [instructors, todayAppointments, blocks] = await Promise.all([
      listAutoscuolaInstructorsReadOnly(companyId),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          startsAt: { gte: todayStart, lt: todayEnd },
          status: { notIn: ["cancelled"] },
        },
        select: {
          instructorId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          student: { select: { name: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.autoscuolaInstructorBlock.findMany({
        where: {
          companyId,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        select: { instructorId: true, reason: true },
      }),
    ]);

    const blockedSet = new Map(blocks.map((b) => [b.instructorId, b.reason]));

    const data = instructors.map((inst) => {
      const myAppointments = todayAppointments.filter((a) => a.instructorId === inst.id);
      const current = myAppointments.find(
        (a) => a.startsAt <= now && a.endsAt != null && a.endsAt > now,
      );
      const next = myAppointments.find((a) => a.startsAt > now);
      const blockReason = blockedSet.get(inst.id) ?? null;

      let liveStatus: "busy" | "blocked" | "free" | "inactive" = "free";
      if (inst.status === "inactive") liveStatus = "inactive";
      else if (current) liveStatus = "busy";
      else if (blockReason !== null) liveStatus = "blocked";

      return {
        id: inst.id,
        name: inst.name,
        status: inst.status,
        liveStatus,
        blockReason,
        currentLesson: current
          ? {
              studentName: current.student?.name ?? null,
              endsAt: current.endsAt?.toISOString() ?? "",
            }
          : null,
        nextLesson: next
          ? {
              studentName: next.student?.name ?? null,
              startsAt: next.startsAt.toISOString(),
            }
          : null,
        todayCount: myAppointments.length,
      };
    });

    return { success: true, data };
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
        autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] },
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

    // Flatten pool membership into a plain id list for the client contract.
    const data = vehicles.map(({ poolMembers, ...vehicle }) => ({
      ...vehicle,
      poolInstructorIds: poolMembers.map((member) => member.instructorId),
    }));

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const setPreferredVehicleSchema = z.object({
  instructorId: z.string().uuid(),
  licenseCategory: z.enum(LICENSE_CATEGORIES),
  // null clears the preference for this (instructor, category).
  vehicleId: z.string().uuid().nullable(),
});

/**
 * Set (or clear) the preferred vehicle an instructor uses for a license
 * category — the tie-break when several compatible vehicles are free. Owners set
 * it for anyone; a plain instructor only for themselves.
 */
export async function setInstructorPreferredVehicle(
  input: z.infer<typeof setPreferredVehicleSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    ensureAutoscuolaRole(membership, ["OWNER", "INSTRUCTOR"]);
    const payload = setPreferredVehicleSchema.parse(input);
    const companyId = membership.companyId;

    const isOwnerActor =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);
    if (!isOwnerActor) {
      const own = await getOwnInstructorProfile(companyId, membership.userId);
      if (!own || own.id !== payload.instructorId) {
        return { success: false, message: "Puoi impostare solo le tue preferenze." };
      }
    }

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: payload.instructorId, companyId },
      select: { id: true },
    });
    if (!instructor) {
      return { success: false, message: "Istruttore non valido." };
    }

    if (payload.vehicleId === null) {
      await prisma.autoscuolaInstructorPreferredVehicle.deleteMany({
        where: {
          instructorId: payload.instructorId,
          licenseCategory: payload.licenseCategory,
        },
      });
    } else {
      const vehicle = await prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId },
        select: { id: true },
      });
      if (!vehicle) {
        return { success: false, message: "Veicolo non valido." };
      }
      await prisma.autoscuolaInstructorPreferredVehicle.upsert({
        where: {
          instructorId_licenseCategory: {
            instructorId: payload.instructorId,
            licenseCategory: payload.licenseCategory,
          },
        },
        create: {
          instructorId: payload.instructorId,
          licenseCategory: payload.licenseCategory,
          vehicleId: payload.vehicleId,
        },
        update: { vehicleId: payload.vehicleId },
      });
    }

    await invalidateAutoscuoleCache({
      companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });
    return { success: true };
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

    const desiredPool = payload.poolInstructorIds
      ? Array.from(new Set(payload.poolInstructorIds))
      : null;
    if (desiredPool && desiredPool.length) {
      const validCount = await prisma.autoscuolaInstructor.count({
        where: { companyId, id: { in: desiredPool } },
      });
      if (validCount !== desiredPool.length) {
        return { success: false, message: "Pool istruttori non valido." };
      }
    }

    const vehicle = await prisma.autoscuolaVehicle.create({
      data: {
        companyId,
        name: payload.name,
        plate: payload.plate || null,
        ...(payload.licenseCategory ? { licenseCategory: payload.licenseCategory } : {}),
        ...(payload.transmission ? { transmission: payload.transmission } : {}),
        ...(payload.assignedInstructorId
          ? { assignedInstructorId: payload.assignedInstructorId }
          : {}),
        ...(payload.followsInstructorAvailability !== undefined
          ? { followsInstructorAvailability: payload.followsInstructorAvailability }
          : {}),
        ...(desiredPool && desiredPool.length
          ? {
              poolMembers: {
                create: desiredPool.map((instructorId) => ({ instructorId })),
              },
            }
          : {}),
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
    const payload = updateInstructorSchema.parse(input);

    const existing = await prisma.autoscuolaInstructor.findFirst({
      where: { id: payload.instructorId, companyId: membership.companyId },
    });
    if (!existing) {
      return { success: false, message: "Istruttore non trovato." };
    }

    // Authorization:
    // - OWNER can edit any instructor
    // - INSTRUCTOR can edit ONLY their own cluster (settings + assignStudentIds only — not name/status/userId)
    const isOwnerOrAdmin = membership.role === "admin" || isOwner(membership.autoscuolaRole);
    const isSelfInstructor =
      isInstructor(membership.autoscuolaRole) && existing.userId === membership.userId;
    if (!isOwnerOrAdmin && !isSelfInstructor) {
      return { success: false, message: "Non autorizzato." };
    }
    if (isSelfInstructor && !isOwnerOrAdmin) {
      // Strip fields that only OWNER can change — instructor can only edit settings + assignStudentIds
      payload.name = undefined;
      payload.phone = undefined;
      payload.status = undefined;
      payload.userId = undefined;
      payload.autonomousMode = undefined;
      payload.color = undefined;
    }

    if (payload.userId) {
      const member = await prisma.companyMember.findFirst({
        where: {
          companyId: membership.companyId,
          userId: payload.userId,
          autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] },
        },
      });
      if (!member) {
        return {
          success: false,
          message: "Utente non valido per ruolo istruttore.",
        };
      }
    }

    const updated = await prisma.autoscuolaInstructor.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        phone: payload.phone ?? undefined,
        status: payload.status,
        userId: payload.userId ?? undefined,
        ...(payload.autonomousMode !== undefined ? { autonomousMode: payload.autonomousMode } : {}),
        ...(payload.color !== undefined ? { color: payload.color } : {}),
        ...(payload.settings !== undefined ? { settings: payload.settings ?? null } : {}),
      },
    });

    const shouldCancelImpacted =
      (existing.status !== "inactive" && updated.status === "inactive") ||
      (payload.userId !== undefined && payload.userId !== existing.userId);

    if (shouldCancelImpacted) {
      const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          instructorId: existing.id,
          startsAt: { gt: new Date() },
          status: { in: [...OPERATIONAL_CANCELLABLE_STATUSES] },
        },
        select: { id: true },
      });

      await operationallyCancelAppointmentsByResource({
        companyId: membership.companyId,
        appointmentIds: impactedAppointments.map((item) => item.id),
        reason: updated.status === "inactive" ? "instructor_inactive" : "directory_instructor_removed",
        actorUserId: membership.userId,
      });
    }

    // If instructor became inactive, unassign all students
    if (existing.status !== "inactive" && updated.status === "inactive") {
      await prisma.companyMember.updateMany({
        where: {
          companyId: membership.companyId,
          assignedInstructorId: existing.id,
        },
        data: { assignedInstructorId: null },
      });
      // Release the fixed vehicle bound to this instructor (if any) so new
      // bookings fall back to the best-fit pool.
      await prisma.autoscuolaVehicle.updateMany({
        where: {
          companyId: membership.companyId,
          assignedInstructorId: existing.id,
        },
        data: { assignedInstructorId: null },
      });
    }

    // Handle student assignment changes
    if (payload.assignStudentIds !== undefined) {
      // Remove current assignments for this instructor
      await prisma.companyMember.updateMany({
        where: {
          companyId: membership.companyId,
          assignedInstructorId: existing.id,
        },
        data: { assignedInstructorId: null },
      });

      // Assign new students
      if (payload.assignStudentIds.length > 0) {
        await prisma.companyMember.updateMany({
          where: {
            companyId: membership.companyId,
            userId: { in: payload.assignStudentIds },
            autoscuolaRole: "STUDENT",
          },
          data: { assignedInstructorId: existing.id },
        });
      }
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

    const touchesAssignment =
      payload.assignedInstructorId !== undefined ||
      payload.followsInstructorAvailability !== undefined;
    const isOwnerActor =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);

    // Pool management is owner-only: a plain instructor manages only their own
    // exclusive assignment, not who else may draw from a shared vehicle.
    if (payload.poolInstructorIds !== undefined && !isOwnerActor) {
      return {
        success: false,
        message: "Solo il titolare può gestire il pool del veicolo.",
      };
    }

    // Self-service guard: a plain instructor can only set the EXCLUSIVE owner to
    // their own profile, and only touch a vehicle that is (or becomes) theirs.
    if (touchesAssignment && !isOwnerActor) {
      const ownInstructor = await getOwnInstructorProfile(
        membership.companyId,
        membership.userId,
      );
      if (!ownInstructor) {
        return { success: false, message: "Profilo istruttore non trovato." };
      }
      if (
        payload.assignedInstructorId !== undefined &&
        payload.assignedInstructorId !== null &&
        payload.assignedInstructorId !== ownInstructor.id
      ) {
        return {
          success: false,
          message: "Puoi assegnare il veicolo solo a te stesso.",
        };
      }
      const targetsOwn =
        existing.assignedInstructorId === ownInstructor.id ||
        payload.assignedInstructorId === ownInstructor.id;
      if (!targetsOwn) {
        return {
          success: false,
          message: "Puoi modificare solo il tuo veicolo esclusivo.",
        };
      }
    }

    // Validate the exclusive-owner instructor when binding the vehicle to one.
    if (payload.assignedInstructorId) {
      const targetInstructor = await prisma.autoscuolaInstructor.findFirst({
        where: {
          id: payload.assignedInstructorId,
          companyId: membership.companyId,
          status: { not: "inactive" },
        },
        select: { id: true },
      });
      if (!targetInstructor) {
        return { success: false, message: "Istruttore non valido." };
      }
    }

    // Validate the shared-pool instructors all belong to this company.
    const desiredPool = payload.poolInstructorIds
      ? Array.from(new Set(payload.poolInstructorIds))
      : null;
    if (desiredPool && desiredPool.length) {
      const validCount = await prisma.autoscuolaInstructor.count({
        where: { companyId: membership.companyId, id: { in: desiredPool } },
      });
      if (validCount !== desiredPool.length) {
        return { success: false, message: "Pool istruttori non valido." };
      }
    }

    // Deactivating ("inactive") releases the exclusive owner. "maintenance" is a
    // temporary stop: it is excluded from matching but KEEPS its assignment/pool
    // and does NOT cancel existing appointments.
    const nextStatus = payload.status ?? existing.status;
    // Rule #4 (maintenance vs inactive): inactive releases the exclusive owner;
    // maintenance keeps it. `undefined` = leave the column untouched.
    const nextOwner = resolveVehicleOwnerOnUpdate({
      nextStatus,
      payloadAssignedInstructorId: payload.assignedInstructorId,
    });

    const updateData = {
      name: payload.name,
      plate: payload.plate ?? undefined,
      status: payload.status,
      ...(nextOwner !== undefined ? { assignedInstructorId: nextOwner } : {}),
      ...(payload.followsInstructorAvailability !== undefined
        ? { followsInstructorAvailability: payload.followsInstructorAvailability }
        : {}),
      ...(payload.licenseCategory !== undefined
        ? { licenseCategory: payload.licenseCategory }
        : {}),
      ...(payload.transmission !== undefined
        ? { transmission: payload.transmission }
        : {}),
    };

    // No more 1:1 reassign: an instructor may own several exclusive vehicles.
    // When a pool list is provided, replace the vehicle's pool membership in the
    // same transaction.
    const updated = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.autoscuolaVehicle.update({
        where: { id: existing.id },
        data: updateData,
      });
      if (desiredPool !== null) {
        await tx.autoscuolaVehiclePoolMember.deleteMany({
          where: { vehicleId: existing.id },
        });
        if (desiredPool.length) {
          await tx.autoscuolaVehiclePoolMember.createMany({
            data: desiredPool.map((instructorId) => ({
              vehicleId: existing.id,
              instructorId,
            })),
            skipDuplicates: true,
          });
        }
      }
      return vehicle;
    });

    const shouldCancelImpacted =
      existing.status !== "inactive" && updated.status === "inactive";

    if (shouldCancelImpacted) {
      const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: membership.companyId,
          vehicleId: existing.id,
          startsAt: { gt: new Date() },
          status: { in: [...OPERATIONAL_CANCELLABLE_STATUSES] },
        },
        select: { id: true },
      });

      await operationallyCancelAppointmentsByResource({
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
      // Deactivating also clears any fixed-vehicle assignment.
      data: { status: "inactive", assignedInstructorId: null },
    });

    const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        vehicleId: existing.id,
        startsAt: { gt: new Date() },
        status: { in: [...OPERATIONAL_CANCELLABLE_STATUSES] },
      },
      select: { id: true },
    });

    await operationallyCancelAppointmentsByResource({
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
        call: {
          select: {
            id: true,
            startedAt: true,
            durationSec: true,
            recordingUrl: true,
            transcriptText: true,
          },
        },
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
        call: t.call
          ? {
              id: t.call.id,
              startedAt: t.call.startedAt.toISOString(),
              durationSec: t.call.durationSec,
              recordingUrl: t.call.recordingUrl,
              transcriptText: t.call.transcriptText,
            }
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
    const map: Record<string, { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }>; rangesByDay?: Record<string, Array<{ startMinutes: number; endMinutes: number }>> }> =
      {};
    for (const availability of availabilities) {
      const ranges = Array.isArray(availability.ranges)
        ? (availability.ranges as Array<{ startMinutes: number; endMinutes: number }>)
        : undefined;
      // Per-weekday map (authoritative when present) — the publication editor
      // needs it to project the base schedule onto un-edited weeks.
      const rangesByDay =
        availability.rangesByDay && typeof availability.rangesByDay === "object" && !Array.isArray(availability.rangesByDay)
          ? (availability.rangesByDay as Record<string, Array<{ startMinutes: number; endMinutes: number }>>)
          : undefined;
      map[availability.ownerId] = {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
        ...(ranges?.length ? { ranges } : {}),
        ...(rangesByDay ? { rangesByDay } : {}),
      };
    }
    return { success: true as const, data: map };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const timeRangeSchema = z.object({
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
});

const setInstructorWeeklyAvailabilitySchema = z.object({
  instructorId: z.string().uuid(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startMinutes: z.number().int().min(0).max(1410),
  endMinutes: z.number().int().min(30).max(1440),
  ranges: z.array(timeRangeSchema).optional(),
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

    const rangesJson = payload.ranges?.length
      ? payload.ranges
      : [{ startMinutes: payload.startMinutes, endMinutes: payload.endMinutes }];

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId,
          ownerType: "instructor",
          ownerId: payload.instructorId,
        },
      },
      update: { daysOfWeek, startMinutes: payload.startMinutes, endMinutes: payload.endMinutes, ranges: rangesJson },
      create: {
        companyId,
        ownerType: "instructor",
        ownerId: payload.instructorId,
        daysOfWeek,
        startMinutes: payload.startMinutes,
        endMinutes: payload.endMinutes,
        ranges: rangesJson,
      },
    });

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        instructorId: payload.instructorId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    // Return `ranges` too: the page stores this payload in its local map, and a
    // rangeless response made the dialog reopen with ONE flat band — re-saving
    // from there silently wiped the other bands (Reglo srl, 2026-07-07).
    return {
      success: true as const,
      data: {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
        ranges: rangesJson,
      },
    };
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

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        instructorId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

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
    const map: Record<string, { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }>; rangesByDay?: Record<string, Array<{ startMinutes: number; endMinutes: number }>> }> =
      {};
    for (const availability of availabilities) {
      const ranges = Array.isArray(availability.ranges)
        ? (availability.ranges as Array<{ startMinutes: number; endMinutes: number }>)
        : undefined;
      // Per-weekday map (authoritative when present) — the publication editor
      // needs it to project the base schedule onto un-edited weeks.
      const rangesByDay =
        availability.rangesByDay && typeof availability.rangesByDay === "object" && !Array.isArray(availability.rangesByDay)
          ? (availability.rangesByDay as Record<string, Array<{ startMinutes: number; endMinutes: number }>>)
          : undefined;
      map[availability.ownerId] = {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
        ...(ranges?.length ? { ranges } : {}),
        ...(rangesByDay ? { rangesByDay } : {}),
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
  ranges: z.array(timeRangeSchema).optional(),
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

    const rangesJson = payload.ranges?.length
      ? payload.ranges
      : [{ startMinutes: payload.startMinutes, endMinutes: payload.endMinutes }];

    const availability = await prisma.autoscuolaWeeklyAvailability.upsert({
      where: {
        companyId_ownerType_ownerId: {
          companyId,
          ownerType: "vehicle",
          ownerId: payload.vehicleId,
        },
      },
      update: { daysOfWeek, startMinutes: payload.startMinutes, endMinutes: payload.endMinutes, ranges: rangesJson },
      create: {
        companyId,
        ownerType: "vehicle",
        ownerId: payload.vehicleId,
        daysOfWeek,
        startMinutes: payload.startMinutes,
        endMinutes: payload.endMinutes,
        ranges: rangesJson,
      },
    });

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        vehicleId: payload.vehicleId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

    await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

    // Same as the instructor variant: include `ranges` so the page's local map
    // doesn't lose the extra bands after a save (destructive on re-save).
    return {
      success: true as const,
      data: {
        daysOfWeek: availability.daysOfWeek,
        startMinutes: availability.startMinutes,
        endMinutes: availability.endMinutes,
        ranges: rangesJson,
      },
    };
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

    // Reset override-approved flag so out-of-availability appointments are re-detected
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        companyId,
        vehicleId,
        startsAt: { gt: new Date() },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        availabilityOverrideApproved: true,
      },
      data: { availabilityOverrideApproved: false },
    });

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

export async function getCompanyInviteCode() {
  try {
    const { activeCompanyId } = await requireServiceAccess("AUTOSCUOLE");
    const company = await prisma.company.findUnique({
      where: { id: activeCompanyId },
      select: { inviteCode: true },
    });
    if (company?.inviteCode) {
      return { success: true as const, data: company.inviteCode };
    }

    // Lazy backfill: some legacy companies were created before invite codes
    // existed. Generate one now, persist it, and return it. The collision
    // window on a 6-hex code is small but non-zero — retry on unique
    // violations with a fresh code (Prisma error P2002).
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      // Signup codes share one input field with instructor invite codes
      // (company-first lookup): never mint a company code that would shadow
      // an existing instructor code.
      const instructorClash = await prisma.autoscuolaInstructor.findUnique({
        where: { inviteCode: candidate },
        select: { id: true },
      });
      if (instructorClash) continue;
      try {
        // `updateMany` with `inviteCode: null` lets us write only if the row
        // is still without a code. If a concurrent request won the race the
        // count will be 0 and we re-read the winner below.
        const result = await prisma.company.updateMany({
          where: { id: activeCompanyId, inviteCode: null },
          data: { inviteCode: candidate },
        });
        if (result.count > 0) {
          return { success: true as const, data: candidate };
        }
        const fresh = await prisma.company.findUnique({
          where: { id: activeCompanyId },
          select: { inviteCode: true },
        });
        return { success: true as const, data: fresh?.inviteCode ?? null };
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "P2002") {
          // Code collision with another company. Try again with a new code.
          continue;
        }
        throw err;
      }
    }
    return {
      success: false as const,
      message: "Impossibile generare un codice univoco. Riprova.",
      data: null,
    };
  } catch (error) {
    return { success: false as const, message: formatError(error), data: null };
  }
}

// ─── Instructor Blocks ──────────────────────────────────────────────────────

const createInstructorBlockSchema = z.object({
  instructorId: z.string().uuid().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  reason: z.string().optional(),
  description: z.string().max(500).optional(),
  recurring: z.boolean().optional(),
  recurringWeeks: z.number().int().min(2).max(52).optional(),
});

export async function createInstructorBlock(
  input: z.infer<typeof createInstructorBlockSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = createInstructorBlockSchema.parse(input);
    const isOwnerOrAdmin = membership.role === "admin" || isOwner(membership.autoscuolaRole);

    let resolvedInstructorId = payload.instructorId;

    if (!resolvedInstructorId) {
      // Instructor creating block for themselves
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: {
          companyId: membership.companyId,
          userId: membership.userId,
          status: { not: "inactive" },
        },
        select: { id: true },
      });
      if (!instructor) {
        return { success: false as const, message: "Profilo istruttore non trovato." };
      }
      resolvedInstructorId = instructor.id;
    } else if (!isOwnerOrAdmin) {
      return { success: false as const, message: "Solo il titolare può creare blocchi per altri istruttori." };
    }

    // Verify the instructor exists in this company
    const targetInstructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: resolvedInstructorId, companyId: membership.companyId, status: { not: "inactive" } },
      select: { id: true },
    });
    if (!targetInstructor) {
      return { success: false as const, message: "Istruttore non trovato." };
    }

    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);
    const weeks = payload.recurring ? Math.min(52, payload.recurringWeeks ?? 12) : 1;
    const recurrenceGroupId = payload.recurring ? randomUUID() : null;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    // Format helpers always in Europe/Rome — otherwise the server (UTC) would
    // surface UTC hours to Italian users and produce a wildly confusing message
    // (e.g. "blocco delle 19:00" when the user just requested 21:00 CEST).
    const formatDayItaly = (d: Date) =>
      d.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Rome",
      });
    const formatTimeItaly = (d: Date) =>
      d.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      });

    // Check overlap for each week occurrence
    for (let i = 0; i < weeks; i++) {
      const blockStart = new Date(startsAt.getTime() + i * WEEK_MS);
      const blockEnd = new Date(endsAt.getTime() + i * WEEK_MS);

      // Check vs existing appointments
      const appointmentConflict = await prisma.autoscuolaAppointment.findFirst({
        where: {
          companyId: membership.companyId,
          instructorId: targetInstructor.id,
          status: { notIn: ["cancelled"] },
          startsAt: { lt: blockEnd },
          endsAt: { gt: blockStart },
        },
        select: { id: true, startsAt: true, endsAt: true },
      });
      if (appointmentConflict) {
        const dayStr = formatDayItaly(blockStart);
        const requested = `${formatTimeItaly(blockStart)}–${formatTimeItaly(blockEnd)}`;
        const conflictTime = appointmentConflict.endsAt
          ? `${formatTimeItaly(appointmentConflict.startsAt)}–${formatTimeItaly(appointmentConflict.endsAt)}`
          : formatTimeItaly(appointmentConflict.startsAt);
        return {
          success: false as const,
          message: `Impossibile bloccare ${dayStr} ${requested}: c'è una guida programmata alle ${conflictTime}.`,
        };
      }

      // Check vs existing blocks
      const blockConflict = await prisma.autoscuolaInstructorBlock.findFirst({
        where: {
          companyId: membership.companyId,
          instructorId: targetInstructor.id,
          startsAt: { lt: blockEnd },
          endsAt: { gt: blockStart },
        },
        select: { id: true, startsAt: true, endsAt: true, reason: true },
      });
      if (blockConflict) {
        const dayStr = formatDayItaly(blockStart);
        const requested = `${formatTimeItaly(blockStart)}–${formatTimeItaly(blockEnd)}`;
        const conflictTime = `${formatTimeItaly(blockConflict.startsAt)}–${formatTimeItaly(blockConflict.endsAt)}`;
        const rawReason = blockConflict.reason?.trim();
        // Traduci i sentinel-tipo in etichette leggibili (il resto è titolo libero).
        const reasonLabel =
          rawReason === "theory_lesson" ? "Lezione teorica"
          : rawReason === "sick_leave" ? "Malattia"
          : rawReason === "ferie" ? "Ferie"
          : rawReason;
        const conflictLabel = reasonLabel ? `«${reasonLabel}» ${conflictTime}` : conflictTime;
        return {
          success: false as const,
          message: `Impossibile bloccare ${dayStr} ${requested}: si sovrappone al blocco ${conflictLabel}.`,
        };
      }
    }

    const blocks = await prisma.$transaction(
      Array.from({ length: weeks }, (_, i) =>
        prisma.autoscuolaInstructorBlock.create({
          data: {
            companyId: membership.companyId,
            instructorId: targetInstructor.id,
            startsAt: new Date(startsAt.getTime() + i * WEEK_MS),
            endsAt: new Date(endsAt.getTime() + i * WEEK_MS),
            reason: payload.reason ?? null,
            description: payload.description?.trim() || null,
            recurrenceGroupId,
          },
        }),
      ),
    );

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: blocks[0], count: blocks.length };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updateInstructorBlockSchema = z.object({
  blockId: z.string().uuid(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  reason: z.string().optional(),
  description: z.string().max(500).nullable().optional(),
});

/**
 * Modifica un SINGOLO blocco istruttore (orario e/o descrizione). Non tocca la
 * ricorrenza: se il blocco fa parte di un gruppo, cambia solo quell'occorrenza.
 * Usato dalla modifica delle lezioni teoriche (web + mobile via PATCH).
 */
export async function updateInstructorBlock(
  input: z.infer<typeof updateInstructorBlockSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateInstructorBlockSchema.parse(input);
    const isOwnerOrAdmin = membership.role === "admin" || isOwner(membership.autoscuolaRole);

    const block = await prisma.autoscuolaInstructorBlock.findFirst({
      where: { id: payload.blockId, companyId: membership.companyId },
    });
    if (!block) {
      return { success: false as const, message: "Blocco non trovato." };
    }

    // Gli istruttori possono modificare solo i propri blocchi.
    if (!isOwnerOrAdmin) {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId: membership.companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instructor || block.instructorId !== instructor.id) {
        return { success: false as const, message: "Non puoi modificare blocchi di altri istruttori." };
      }
    }

    const nextStart = payload.startsAt ? new Date(payload.startsAt) : block.startsAt;
    const nextEnd = payload.endsAt ? new Date(payload.endsAt) : block.endsAt;
    if (nextEnd <= nextStart) {
      return { success: false as const, message: "L'orario di fine deve essere successivo all'inizio." };
    }

    const timeChanged = payload.startsAt !== undefined || payload.endsAt !== undefined;
    if (timeChanged) {
      const formatDayItaly = (d: Date) =>
        d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
      const formatTimeItaly = (d: Date) =>
        d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

      // Stessi controlli di conflitto della creazione, escludendo il blocco stesso.
      const appointmentConflict = await prisma.autoscuolaAppointment.findFirst({
        where: {
          companyId: membership.companyId,
          instructorId: block.instructorId,
          status: { notIn: ["cancelled"] },
          startsAt: { lt: nextEnd },
          endsAt: { gt: nextStart },
        },
        select: { id: true, startsAt: true, endsAt: true },
      });
      if (appointmentConflict) {
        const dayStr = formatDayItaly(nextStart);
        const requested = `${formatTimeItaly(nextStart)}–${formatTimeItaly(nextEnd)}`;
        const conflictTime = appointmentConflict.endsAt
          ? `${formatTimeItaly(appointmentConflict.startsAt)}–${formatTimeItaly(appointmentConflict.endsAt)}`
          : formatTimeItaly(appointmentConflict.startsAt);
        return {
          success: false as const,
          message: `Impossibile spostare a ${dayStr} ${requested}: c'è una guida programmata alle ${conflictTime}.`,
        };
      }

      const blockConflict = await prisma.autoscuolaInstructorBlock.findFirst({
        where: {
          companyId: membership.companyId,
          instructorId: block.instructorId,
          id: { not: block.id },
          startsAt: { lt: nextEnd },
          endsAt: { gt: nextStart },
        },
        select: { id: true, startsAt: true, endsAt: true, reason: true },
      });
      if (blockConflict) {
        const dayStr = formatDayItaly(nextStart);
        const requested = `${formatTimeItaly(nextStart)}–${formatTimeItaly(nextEnd)}`;
        const conflictTime = `${formatTimeItaly(blockConflict.startsAt)}–${formatTimeItaly(blockConflict.endsAt)}`;
        const rawReason = blockConflict.reason?.trim();
        const reasonLabel =
          rawReason === "theory_lesson" ? "Lezione teorica"
          : rawReason === "sick_leave" ? "Malattia"
          : rawReason === "ferie" ? "Ferie"
          : rawReason;
        const conflictLabel = reasonLabel ? `«${reasonLabel}» ${conflictTime}` : conflictTime;
        return {
          success: false as const,
          message: `Impossibile spostare a ${dayStr} ${requested}: si sovrappone al blocco ${conflictLabel}.`,
        };
      }
    }

    const updated = await prisma.autoscuolaInstructorBlock.update({
      where: { id: block.id },
      data: {
        startsAt: nextStart,
        endsAt: nextEnd,
        ...(payload.reason !== undefined ? { reason: payload.reason.trim() || null } : {}),
        ...(payload.description !== undefined
          ? { description: (payload.description ?? "").trim() || null }
          : {}),
      },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const, data: updated };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteInstructorBlock(blockId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const isOwnerOrAdmin = membership.role === "admin" || isOwner(membership.autoscuolaRole);

    const block = await prisma.autoscuolaInstructorBlock.findFirst({
      where: {
        id: blockId,
        companyId: membership.companyId,
      },
    });

    if (!block) {
      return { success: false as const, message: "Blocco non trovato." };
    }

    // Instructors can only delete their own blocks
    if (!isOwnerOrAdmin) {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId: membership.companyId, userId: membership.userId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instructor || block.instructorId !== instructor.id) {
        return { success: false as const, message: "Non puoi eliminare blocchi di altri istruttori." };
      }
    }

    await prisma.autoscuolaInstructorBlock.delete({
      where: { id: blockId },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: { deleted: true } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Lista i blocchi malattia (reason "sick_leave") di un istruttore, dagli
 * ultimi 14 giorni in avanti — la vista dettaglio istruttore li raggruppa in
 * periodi contigui ("Assenze registrate"). */
export async function listInstructorSickLeaves(instructorId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const blocks = await prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId: membership.companyId,
        instructorId,
        reason: "sick_leave",
        endsAt: { gte: twoWeeksAgo },
      },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    });
    return { success: true as const, data: blocks };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Rimuove un periodo di malattia (i blocchi giornalieri che lo compongono).
 * Non ripristina le guide già cancellate dal sick-leave. */
export async function deleteInstructorSickLeave(blockIds: string[]) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    if (!blockIds.length) return { success: true as const, data: { deleted: 0 } };
    const result = await prisma.autoscuolaInstructorBlock.deleteMany({
      where: {
        companyId: membership.companyId,
        id: { in: blockIds },
        reason: "sick_leave",
      },
    });
    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const, data: { deleted: result.count } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function listInstructorFerie(instructorId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const blocks = await prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId: membership.companyId,
        instructorId,
        reason: "ferie",
        endsAt: { gte: twoWeeksAgo },
      },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    });
    return { success: true as const, data: blocks };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Rimuove un periodo di ferie (i blocchi giornalieri che lo compongono).
 * Non ripristina le guide già cancellate. */
export async function deleteInstructorFerie(blockIds: string[]) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    if (!blockIds.length) return { success: true as const, data: { deleted: 0 } };
    const result = await prisma.autoscuolaInstructorBlock.deleteMany({
      where: {
        companyId: membership.companyId,
        id: { in: blockIds },
        reason: "ferie",
      },
    });
    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const, data: { deleted: result.count } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function deleteInstructorBlockRecurrence(recurrenceGroupId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const result = await prisma.autoscuolaInstructorBlock.deleteMany({
      where: {
        companyId: membership.companyId,
        recurrenceGroupId,
        startsAt: { gte: new Date() },
      },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return { success: true as const, data: { deleted: result.count } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Booking block management
// ---------------------------------------------------------------------------

const toggleStudentBookingBlockSchema = z.object({
  studentId: z.string().uuid(),
  blocked: z.boolean(),
});

const updateStudentPhaseSchema = z.object({
  studentId: z.string().uuid(),
  phase: z.enum(["AWAITING", "TEORIA", "PRATICA", "PATENTATO"]),
  theoryExamDate: z.string().optional().nullable(),
  grantSeat: z.boolean().optional(),
});

// The pursued license path is a separate attribute from the phase: it is known
// from the theory stage onward, so it is edited via its own dialog/action,
// independent of phase transitions.
const updateStudentLicensePathSchema = z.object({
  studentId: z.string().uuid(),
  licenseCategory: z.enum(LICENSE_CATEGORIES),
  transmission: z.enum(TRANSMISSIONS),
});

// Il titolare può aggiungere/modificare/cancellare il numero dell'allievo
// (utile quando l'account è stato creato da lui e non ha ancora l'app → così
// può avvisarlo su WhatsApp). Stringa vuota = cancella (→ null).
const updateStudentPhoneSchema = z.object({
  studentId: z.string().uuid(),
  phone: z.string().max(30),
});

export async function toggleStudentBookingBlock(
  input: z.infer<typeof toggleStudentBookingBlockSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = toggleStudentBookingBlockSchema.parse(input);

    // Il blocco/sblocco manuale del titolare convive con l'automatismo per debito
    // (stesso campo `bookingBlocked`). Marca l'origine per non entrare in conflitto:
    //  - BLOCCA a mano → reason="manual": l'automatismo non toccherà mai il record.
    //  - SBLOCCA a mano → reason=null + watermark = guide non pagate correnti, così
    //    l'automatismo non riblocca per lo stesso debito residuo (ribloccherà solo
    //    su un nuovo superamento della soglia).
    const clearedAtCount = payload.blocked
      ? null
      : await getStudentUnpaidLessonCount(membership.companyId, payload.studentId);

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: {
        bookingBlocked: payload.blocked,
        bookingBlockReason: payload.blocked ? "manual" : null,
        unpaidBlockClearedAtCount: clearedAtCount,
      },
    });

    return {
      success: true,
      data: { bookingBlocked: payload.blocked },
      message: payload.blocked
        ? "Prenotazioni bloccate per l'allievo."
        : "Prenotazioni riattivate per l'allievo.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateStudentPhase(
  input: z.infer<typeof updateStudentPhaseSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = updateStudentPhaseSchema.parse(input);

    const studentMember = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      select: { studentPhase: true, quizSeatGrantedAt: true },
    });
    if (!studentMember) {
      return { success: false, message: "Allievo non valido per questa company." };
    }

    // Validate the target phase against the autoscuola's active phases.
    // PATENTATO is always allowed (terminal state). AWAITING is allowed only
    // when TEORIA is part of the offered journey.
    const autoscuolaService = await prisma.companyService.findFirst({
      where: {
        companyId: membership.companyId,
        serviceKey: "AUTOSCUOLE",
      },
      select: { limits: true },
    });
    const phasesEnabled: ("TEORIA" | "PRATICA")[] = (() => {
      const raw = (autoscuolaService?.limits as Record<string, unknown> | null)
        ?.phasesEnabled;
      if (!Array.isArray(raw)) return ["PRATICA"];
      return raw.filter(
        (p): p is "TEORIA" | "PRATICA" => p === "TEORIA" || p === "PRATICA",
      );
    })();

    if (payload.phase === "TEORIA" && !phasesEnabled.includes("TEORIA")) {
      return {
        success: false,
        message:
          "Impossibile passare in TEORIA: questa autoscuola non ha la fase teoria attiva.",
      };
    }
    if (payload.phase === "AWAITING" && !phasesEnabled.includes("TEORIA")) {
      return {
        success: false,
        message:
          "Lo stato 'In attesa' è disponibile solo per autoscuole con la fase teoria attiva.",
      };
    }
    if (payload.phase === "PRATICA" && !phasesEnabled.includes("PRATICA")) {
      return {
        success: false,
        message:
          "Impossibile passare in PRATICA: questa autoscuola non ha la fase pratica attiva.",
      };
    }

    // Guard: moving to TEORIA requires a quiz seat
    if (payload.phase === "TEORIA" && !studentMember.quizSeatGrantedAt) {
      if (!payload.grantSeat) {
        const limits = autoscuolaService?.limits as Record<string, unknown> | null;
        const quizSeats =
          typeof limits?.quizSeats === "number" && Number.isFinite(limits.quizSeats)
            ? Math.max(0, Math.floor(limits.quizSeats as number))
            : 0;
        const used = await prisma.companyMember.count({
          where: { companyId: membership.companyId, role: "member", quizSeatGrantedAt: { not: null } },
        });
        return {
          success: false,
          code: "SEAT_REQUIRED" as const,
          available: quizSeats - used,
          message: "L'allievo non ha una licenza quiz. Conferma l'assegnazione per procedere.",
        };
      }
      // grantSeat === true: verify availability and assign
      const limits = autoscuolaService?.limits as Record<string, unknown> | null;
      const quizSeats =
        typeof limits?.quizSeats === "number" && Number.isFinite(limits.quizSeats)
          ? Math.max(0, Math.floor(limits.quizSeats as number))
          : 0;
      const used = await prisma.companyMember.count({
        where: { companyId: membership.companyId, role: "member", quizSeatGrantedAt: { not: null } },
      });
      if (quizSeats - used <= 0) {
        return {
          success: false,
          message: "Nessuna licenza quiz disponibile. Acquista altre licenze per procedere.",
        };
      }
    }

    if (
      (payload.phase === "TEORIA" || payload.phase === "AWAITING") &&
      studentMember.studentPhase !== "TEORIA" &&
      studentMember.studentPhase !== "AWAITING"
    ) {
      const futureAppointments = await prisma.autoscuolaAppointment.count({
        where: {
          companyId: membership.companyId,
          studentId: payload.studentId,
          startsAt: { gte: new Date() },
          cancelledAt: null,
        },
      });
      if (futureAppointments > 0) {
        return {
          success: false,
          message: `Impossibile cambiare fase: ci sono ${futureAppointments} lezione/i futura/e prenotata/e. Cancellale prima di cambiare fase.`,
        };
      }
    }

    const now = new Date();
    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: {
        studentPhase: payload.phase,
        // Mark this as an explicit titolare classification (clears the yellow
        // "Conferma fase" badge in the drawer).
        phaseClassifiedAt: now,
        // Grant quiz seat atomically when moving to TEORIA
        ...(payload.phase === "TEORIA" &&
          payload.grantSeat &&
          !studentMember.quizSeatGrantedAt && { quizSeatGrantedAt: now }),
        // "Pronto per l'esame" ha senso solo in PRATICA: uscendo dalla fase
        // (tipicamente → PATENTATO quando passa l'esame) lo azzeriamo.
        ...(payload.phase !== "PRATICA" && {
          examReady: false,
          examReadyAt: null,
          examReadyBy: null,
        }),
      },
    });

    // Celebratory push to the student when the owner moves them forward
    // along the journey. The helper itself filters out non-celebratory
    // transitions (e.g. regressions to AWAITING) — fire-and-forget.
    void notifyStudentPhaseChange({
      companyId: membership.companyId,
      studentUserId: payload.studentId,
      fromPhase: studentMember.studentPhase as
        | "AWAITING"
        | "TEORIA"
        | "PRATICA"
        | "PATENTATO",
      toPhase: payload.phase,
    });

    if (payload.theoryExamDate !== undefined) {
      const latestCase = await prisma.autoscuolaCase.findFirst({
        where: {
          companyId: membership.companyId,
          studentId: payload.studentId,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (latestCase) {
        await prisma.autoscuolaCase.update({
          where: { id: latestCase.id },
          data: {
            theoryExamAt: payload.theoryExamDate
              ? new Date(payload.theoryExamDate)
              : null,
          },
        });
      }
    }

    return {
      success: true,
      data: { phase: payload.phase },
      message: "Fase aggiornata correttamente.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * Update the student's pursued license path (category + transmission).
 * Independent of the phase: the license is known from the theory stage onward,
 * so it has its own editor. Owner/admin only.
 */
export async function updateStudentLicensePath(
  input: z.infer<typeof updateStudentLicensePathSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = updateStudentLicensePathSchema.parse(input);

    const updated = await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: {
        licenseCategory: payload.licenseCategory,
        transmission: payload.transmission,
      },
    });
    if (!updated.count) {
      return { success: false, message: "Allievo non valido per questa company." };
    }

    return {
      success: true,
      data: {
        licenseCategory: payload.licenseCategory,
        transmission: payload.transmission,
      },
      message: "Percorso patente aggiornato.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateStudentPhone(
  input: z.infer<typeof updateStudentPhoneSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = updateStudentPhoneSchema.parse(input);

    // Il telefono è su User (globale), non su CompanyMember: prima verifica che
    // l'allievo sia davvero uno STUDENT di questa company, così non si può
    // toccare l'utenza di chiunque tramite il suo id.
    const member = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      select: { userId: true },
    });
    if (!member) {
      return { success: false, message: "Allievo non valido per questa company." };
    }

    const trimmed = payload.phone.trim();
    if (trimmed && !/^[+()\-\s\d]{5,25}$/.test(trimmed)) {
      return { success: false, message: "Numero di telefono non valido." };
    }
    const phone = trimmed || null;

    await prisma.user.update({
      where: { id: payload.studentId },
      data: { phone },
    });

    return {
      success: true,
      data: { phone },
      message: phone ? "Numero aggiornato." : "Numero rimosso.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function assignStudentToInstructor(input: {
  studentId: string;
  instructorId: string | null;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    ensureAutoscuolaRole(membership, ["OWNER"]);

    if (input.instructorId) {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: { id: input.instructorId, companyId: membership.companyId, autonomousMode: true },
      });
      if (!instructor) {
        return { success: false, message: "Istruttore non valido o non autonomo." };
      }
    }

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: input.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { assignedInstructorId: input.instructorId },
    });

    return { success: true, data: { assignedInstructorId: input.instructorId } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Exam events
// ---------------------------------------------------------------------------

/**
 * Attach exam rows to a slot honoring the "placeholder" model: an esame with
 * zero participants is stored as a SINGLE row with studentId = null (autoscuole
 * often create the exam before knowing who will sit it). Adding the first
 * student CONVERTS that placeholder instead of leaving a ghost row; further
 * students each get their own row. Every exam-create entry point (owner action,
 * instructor API route, single add) funnels through here so the invariant
 * "0 students ⇒ exactly 1 placeholder, ≥1 student ⇒ no placeholder" always holds.
 *
 * Slot identity = (companyId, type "esame", startsAt, endsAt, instructorId).
 * Returns the count of real (studentful) rows created/attached by this call.
 */
export async function materializeExamSlot(params: {
  companyId: string;
  studentIds: string[];
  startsAt: Date;
  endsAt: Date | null;
  instructorId: string | null;
  notes: string | null;
}): Promise<number> {
  const { companyId, studentIds, startsAt, endsAt, instructorId, notes } = params;

  const base = {
    companyId,
    bookingSource: BOOKING_SOURCE.exam,
    type: "esame",
    startsAt,
    endsAt,
    status: "scheduled",
    instructorId: instructorId ?? null,
    vehicleId: null,
    paymentRequired: false,
  };

  // Existing empty placeholder(s) for this exact slot, if any.
  const placeholders = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      type: "esame",
      studentId: null,
      startsAt,
      endsAt: endsAt ?? null,
      instructorId: instructorId ?? null,
      status: { not: "cancelled" },
    },
    select: { id: true },
  });

  // No students yet → ensure exactly one placeholder exists for the slot.
  if (studentIds.length === 0) {
    if (placeholders.length > 0) return 0;
    await prisma.autoscuolaAppointment.create({
      data: { ...base, studentId: null, notes: notes ?? null },
    });
    return 0;
  }

  // Convert placeholders into the first students; create rows for the rest;
  // drop any leftover placeholder (there should be at most one).
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let i = 0;
  for (const ph of placeholders) {
    if (i < studentIds.length) {
      ops.push(
        prisma.autoscuolaAppointment.update({
          where: { id: ph.id },
          // Convert the placeholder into a real seat; refresh notes if provided
          // so a just-filled exam stays consistent with newly-created seats.
          data: { studentId: studentIds[i], ...(notes != null ? { notes } : {}) },
        }),
      );
      i++;
    } else {
      ops.push(prisma.autoscuolaAppointment.delete({ where: { id: ph.id } }));
    }
  }
  for (; i < studentIds.length; i++) {
    ops.push(
      prisma.autoscuolaAppointment.create({
        data: { ...base, studentId: studentIds[i], notes: notes ?? null },
      }),
    );
  }
  await prisma.$transaction(ops);
  return studentIds.length;
}

const createExamEventSchema = z.object({
  studentIds: z.array(z.string().uuid()),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  instructorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function createExamEvent(
  input: z.infer<typeof createExamEventSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Solo il titolare può creare esami." };
    }
    const payload = createExamEventSchema.parse(input);
    const companyId = membership.companyId;
    const startsAt = new Date(payload.startsAt);
    const hasTime = Boolean(payload.endsAt);
    const endsAt = hasTime ? new Date(payload.endsAt!) : null;

    if (Number.isNaN(startsAt.getTime())) {
      return { success: false as const, message: "Data non valida." };
    }
    if (hasTime && (Number.isNaN(endsAt!.getTime()) || endsAt! <= startsAt)) {
      return { success: false as const, message: "Orario non valido." };
    }

    // Validate instructor if provided
    if (payload.instructorId) {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { id: payload.instructorId, companyId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Istruttore non trovato." };
    }

    // Validate all students belong to this company
    const members = await prisma.companyMember.findMany({
      where: { companyId, userId: { in: payload.studentIds }, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    const validIds = new Set(members.map((m) => m.userId));
    const invalidIds = payload.studentIds.filter((id) => !validIds.has(id));
    if (invalidIds.length) {
      return { success: false as const, message: `${invalidIds.length} allievi non trovati.` };
    }

    // Overlap check only when time is specified
    if (hasTime && endsAt) {
      const activeStatuses = ["scheduled", "confirmed", "proposal", "checked_in"];
      const studentConflicts = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: { in: payload.studentIds },
          status: { in: activeStatuses },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { studentId: true },
      });
      if (studentConflicts.length) {
        const count = new Set(studentConflicts.map((a) => a.studentId)).size;
        return {
          success: false as const,
          message: `${count} ${count === 1 ? "allievo ha" : "allievi hanno"} già un impegno in quell'orario.`,
        };
      }
      if (payload.instructorId) {
        const instrConflict = await prisma.autoscuolaAppointment.findFirst({
          where: {
            companyId,
            instructorId: payload.instructorId,
            status: { in: activeStatuses },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            // Exclude THIS exam's own rows (same slot+instructor): adding a
            // student to an exam the instructor already accompanies — incl. an
            // empty exam's placeholder — is not a real conflict.
            NOT: { type: "esame", instructorId: payload.instructorId, startsAt, endsAt },
          },
          select: { id: true },
        });
        if (instrConflict) {
          return { success: false as const, message: "L'istruttore ha già un impegno in quell'orario." };
        }
      }
    }

    // Create one appointment per student — or a single studentless placeholder
    // when no students were selected (see materializeExamSlot).
    const count = await materializeExamSlot({
      companyId,
      studentIds: payload.studentIds,
      startsAt,
      endsAt,
      instructorId: payload.instructorId ?? null,
      notes: payload.notes ?? null,
    });

    await invalidateAgendaAndPaymentsCache(companyId);

    return { success: true as const, data: { count } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const addExamStudentSchema = z.object({
  studentId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  instructorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function addExamStudent(
  input: z.infer<typeof addExamStudentSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = addExamStudentSchema.parse(input);
    const companyId = membership.companyId;

    const member = await prisma.companyMember.findFirst({
      where: { companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    if (!member) return { success: false as const, message: "Allievo non trovato." };

    // Consumes a null placeholder for this slot if present (empty exam → first
    // student), otherwise adds a new row alongside the existing participants.
    await materializeExamSlot({
      companyId,
      studentIds: [payload.studentId],
      startsAt: new Date(payload.startsAt),
      endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
      instructorId: payload.instructorId ?? null,
      notes: payload.notes ?? null,
    });

    await invalidateAgendaAndPaymentsCache(companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function removeExamStudent(appointmentId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const appt = await prisma.autoscuolaAppointment.findFirst({
      where: { id: appointmentId, companyId: membership.companyId, type: "esame" },
      select: { id: true },
    });
    if (!appt) return { success: false as const, message: "Appuntamento esame non trovato." };

    await prisma.autoscuolaAppointment.delete({ where: { id: appointmentId } });
    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updateExamEventSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1),
  instructorId: z.string().uuid().optional().nullable(),
});

export async function updateExamInstructor(
  input: z.infer<typeof updateExamEventSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = updateExamEventSchema.parse(input);

    await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: payload.appointmentIds }, companyId: membership.companyId, type: "esame" },
      data: { instructorId: payload.instructorId ?? null },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updateExamTimeSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
});

export async function updateExamTime(
  input: z.infer<typeof updateExamTimeSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      membership.autoscuolaRole !== "OWNER" &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = updateExamTimeSchema.parse(input);
    const startsAt = new Date(payload.startsAt);
    const hasTime = Boolean(payload.endsAt);
    const endsAt = hasTime ? new Date(payload.endsAt!) : null;

    if (Number.isNaN(startsAt.getTime())) {
      return { success: false as const, message: "Data non valida." };
    }
    if (hasTime && (Number.isNaN(endsAt!.getTime()) || endsAt! <= startsAt)) {
      return { success: false as const, message: "Orario non valido." };
    }

    await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: payload.appointmentIds }, companyId: membership.companyId, type: "esame" },
      data: { startsAt, endsAt },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updateExamNotesSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateExamNotes(
  input: z.infer<typeof updateExamNotesSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      membership.autoscuolaRole !== "OWNER" &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = updateExamNotesSchema.parse(input);
    const notes = payload.notes?.trim() ? payload.notes.trim() : null;

    await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: payload.appointmentIds }, companyId: membership.companyId, type: "esame" },
      data: { notes },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function cancelExamEvent(appointmentIds: string[]) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false as const, message: "Operazione non consentita." };
    }

    await prisma.autoscuolaAppointment.updateMany({
      where: { id: { in: appointmentIds }, companyId: membership.companyId, type: "esame" },
      data: { status: "cancelled", cancelledAt: new Date(), cancelledByUserId: membership.userId },
    });

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Group lessons (Guide di gruppo) — 1 instructor + 1 vehicle + up to N students.
// Participants are AutoscuolaAppointment rows (type="group_lesson", groupLessonId
// set), created as "da pagare" (no lesson credit consumed). The lesson container
// exists independently of its participants (open seats + invite flow).
// ---------------------------------------------------------------------------

const GROUP_LESSON_ACTIVE_STATUSES = ["scheduled", "confirmed", "proposal", "checked_in"];
// "Enrolled" = a student who occupies/occupied a seat, including PAST lessons.
// ACTIVE excludes the terminal/past statuses, so once a group lesson's time
// passes its seats vanish from roster/count queries (the bug where managing a
// past group lesson showed 0 participants). Note "pending_review": the auto
// cron (processAutoscuolaAutoPendingReview) rolls scheduled/confirmed seats to
// pending_review the moment the lesson ends — BEFORE anyone marks them
// completed/no_show — so it's the FIRST past state a seat lands in and MUST be
// counted as enrolled, else a past-but-unreviewed group lesson shows 0/3 in the
// manage dialog while the agenda still shows 3/3 (real Robatto bug, 2026-07-15).
// Use this for per-lesson roster, filled-seat counts and the enrolled-set; keep
// ACTIVE for booking/eligibility on still-scheduled lessons (where these past
// statuses never occur anyway).
const GROUP_LESSON_ENROLLED_STATUSES = [
  ...GROUP_LESSON_ACTIVE_STATUSES,
  "pending_review",
  "completed",
  "no_show",
];

// Presence outcome of a group-lesson seat, derived from its appointment status.
// "present" = checked_in/completed, "absent" = no_show, "pending" = the seat is
// still upcoming or (most often) past-but-unreviewed (pending_review).
type GroupLessonAttendance = "present" | "absent" | "pending";
function groupLessonAttendance(status: string): GroupLessonAttendance {
  const s = normalizeStatus(status);
  if (s === "completed" || s === "checked_in") return "present";
  if (s === "no_show") return "absent";
  return "pending";
}

type GroupLessonFill = { filled: number; capacity: number; kind: string };
/**
 * For a set of appointment groupLessonIds, returns per-group seat fill (enrolled
 * count), capacity and kind — so a student's lesson history can flag "Guida di
 * gruppo · N/M". Function declaration (hoisted) so callers above may use it.
 */
async function fetchGroupLessonFill(
  groupLessonIds: Array<string | null | undefined>,
): Promise<Map<string, GroupLessonFill>> {
  const ids = [...new Set(groupLessonIds.filter(Boolean) as string[])];
  if (!ids.length) return new Map();
  const rows = await prisma.autoscuolaGroupLesson.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      capacity: true,
      kind: true,
      _count: { select: { appointments: { where: { status: { in: GROUP_LESSON_ENROLLED_STATUSES } } } } },
    },
  });
  return new Map(rows.map((g) => [g.id, { filled: g._count.appointments, capacity: g.capacity, kind: g.kind }]));
}

const updateStudentGroupLessonOptInSchema = z.object({
  studentId: z.string().uuid(),
  optIn: z.boolean(),
});

export async function updateStudentGroupLessonOptIn(
  input: z.infer<typeof updateStudentGroupLessonOptInSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    // Owner/admin OR any instructor may toggle a student's group-lesson eligibility.
    if (
      !canManageStudentCredits(membership) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = updateStudentGroupLessonOptInSchema.parse(input);

    const updated = await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { groupLessonsOptIn: payload.optIn },
    });
    if (!updated.count) {
      return { success: false, message: "Allievo non valido per questa company." };
    }

    return {
      success: true,
      data: { groupLessonsOptIn: payload.optIn },
      message: payload.optIn
        ? "Allievo abilitato alle guide di gruppo."
        : "Allievo disabilitato dalle guide di gruppo.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

type GroupLessonVehicleInfo = {
  id: string;
  licenseCategory: string | null;
  transmission: string | null;
} | null;

// Validates that every pre-added/invited student is a real STUDENT of the company,
// opted-in to group lessons, and (when the vehicles module is on) license-compatible
// with the lesson's vehicle. Returns the offending message or null when all pass.
async function validateGroupLessonStudents({
  companyId,
  studentIds,
  vehicle,
  vehiclesEnabled,
  skipVehicleLicense = false,
}: {
  companyId: string;
  studentIds: string[];
  vehicle: GroupLessonVehicleInfo;
  vehiclesEnabled: boolean;
  /** Moto groups validate the license per-assigned-moto (not the single shared
   *  vehicle), so the single-vehicle license check is skipped for them. */
  skipVehicleLicense?: boolean;
}): Promise<string | null> {
  if (!studentIds.length) return null;
  const members = await prisma.companyMember.findMany({
    where: { companyId, userId: { in: studentIds }, autoscuolaRole: "STUDENT" },
    select: { userId: true, groupLessonsOptIn: true, licenseCategory: true, transmission: true },
  });
  const byId = new Map(members.map((m) => [m.userId, m]));
  const notFound = studentIds.filter((id) => !byId.has(id));
  if (notFound.length) return `${notFound.length} allievi non trovati.`;

  const notOptedIn = studentIds.filter((id) => !byId.get(id)?.groupLessonsOptIn);
  if (notOptedIn.length) {
    return `${notOptedIn.length} ${notOptedIn.length === 1 ? "allievo non è abilitato" : "allievi non sono abilitati"} alle guide di gruppo.`;
  }

  if (vehiclesEnabled && vehicle && !skipVehicleLicense) {
    const licenseMismatch = studentIds.filter((id) => {
      const m = byId.get(id)!;
      return !vehicleServesLicense(vehicle, m);
    });
    if (licenseMismatch.length) {
      return `${licenseMismatch.length} ${licenseMismatch.length === 1 ? "allievo ha una patente" : "allievi hanno una patente"} non compatibile col veicolo della guida.`;
    }
  }
  return null;
}

// Returns the message of the first overlap conflict (instructor / vehicle(s) /
// any student) in [startsAt, endsAt), or null when the slot is free for all of
// them. `vehicleIds` is the full set the lesson reserves: for a standard group
// it's the single shared vehicle; for a moto group it's the whole fleet PLUS the
// shared follow car. Conflicts are checked against BOTH participant appointments
// (incl. their appointmentVehicles join rows) AND other group-lesson containers
// (whose fleet / follow car / vehicle may be reserved before all seats fill).
async function findGroupLessonOverlap({
  companyId,
  startsAt,
  endsAt,
  instructorId,
  vehicleIds,
  studentIds,
  excludeGroupLessonId,
  db = prisma,
}: {
  companyId: string;
  startsAt: Date;
  endsAt: Date;
  instructorId: string | null;
  vehicleIds: string[];
  studentIds: string[];
  excludeGroupLessonId?: string;
  /** Pass the transaction client to re-check under the creation lock. */
  db?: Prisma.TransactionClient;
}): Promise<string | null> {
  const baseWhere = {
    companyId,
    status: { in: GROUP_LESSON_ACTIVE_STATUSES },
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
    // Exclude this lesson's own seats. NB: `groupLessonId: { not: id }` alone
    // would ALSO drop rows with groupLessonId NULL (SQL `<>` is null-unsafe in
    // Prisma) — i.e. every NORMAL appointment — which made the instructor
    // conflict check blind on EDIT (bug fixed 2026-07-06). The explicit OR
    // keeps null rows in; the AND wrapper avoids clashing with callers' ORs.
    ...(excludeGroupLessonId
      ? {
          AND: [
            {
              OR: [
                { groupLessonId: null },
                { groupLessonId: { not: excludeGroupLessonId } },
              ],
            },
          ],
        }
      : {}),
  };
  // Overlapping group-lesson CONTAINERS (scheduled), excluding this one.
  const containerWhere = {
    companyId,
    status: "scheduled",
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
    ...(excludeGroupLessonId ? { id: { not: excludeGroupLessonId } } : {}),
  };
  const reserved = Array.from(new Set(vehicleIds.filter(Boolean)));

  if (instructorId) {
    const instrConflict = await db.autoscuolaAppointment.findFirst({
      where: { ...baseWhere, instructorId },
      select: { id: true },
    });
    if (instrConflict) return "L'istruttore ha già un impegno in quell'orario.";
    const blockConflict = await db.autoscuolaInstructorBlock.findFirst({
      where: { companyId, instructorId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { id: true },
    });
    if (blockConflict) return "L'istruttore ha uno slot bloccato in quell'orario.";
    const instrContainer = await db.autoscuolaGroupLesson.findFirst({
      where: { ...containerWhere, instructorId },
      select: { id: true },
    });
    if (instrContainer) return "L'istruttore ha già un impegno in quell'orario.";
  }
  if (reserved.length) {
    const vehicleConflict = await db.autoscuolaAppointment.findFirst({
      where: {
        ...baseWhere,
        OR: [
          { vehicleId: { in: reserved } },
          { appointmentVehicles: { some: { vehicleId: { in: reserved } } } },
        ],
      },
      select: { id: true },
    });
    if (vehicleConflict) return "Un veicolo è già impegnato in quell'orario.";
    const containerConflict = await db.autoscuolaGroupLesson.findFirst({
      where: {
        ...containerWhere,
        OR: [
          { vehicleId: { in: reserved } },
          { followVehicleId: { in: reserved } },
          { fleetVehicles: { some: { vehicleId: { in: reserved } } } },
        ],
      },
      select: { id: true },
    });
    if (containerConflict) return "Un veicolo è già impegnato in quell'orario.";
  }
  if (studentIds.length) {
    const studentConflicts = await db.autoscuolaAppointment.findMany({
      where: { ...baseWhere, studentId: { in: studentIds } },
      select: { studentId: true },
    });
    if (studentConflicts.length) {
      const count = new Set(studentConflicts.map((a) => a.studentId)).size;
      return `${count} ${count === 1 ? "allievo ha" : "allievi hanno"} già un impegno in quell'orario.`;
    }
  }
  return null;
}

// Creation is check-then-insert: two submits in flight together (double click
// racing across two requests, two tabs) can BOTH pass the pre-check and insert
// twin lessons — happened in prod (Robatto, 2026-06-18, twin 15-17 lessons 18s
// apart). Inside the create transaction we serialize per company with an
// advisory lock and re-run the overlap check: the second transaction waits for
// the first to commit, then its re-check sees the freshly created lesson.
async function lockAndRecheckGroupLessonOverlap(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    startsAt: Date;
    endsAt: Date;
    instructorId: string | null;
    vehicleIds: string[];
    studentIds: string[];
  },
): Promise<void> {
  // ::text — the lock function returns void, which Prisma can't deserialize.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('group-lesson-create'), hashtext(${args.companyId}))::text`;
  const raceErr = await findGroupLessonOverlap({ ...args, db: tx });
  if (raceErr) throw new Error(raceErr);
}

/** A fleet/follow vehicle as loaded for moto-group setup (FleetVehicle + name). */
type LoadedVehicle = FleetVehicle & { name: string };

// Loads and validates the moto fleet + shared follow car for a kind="moto" group
// lesson from the provided vehicle ids. Returns the validated context (vehicles
// with names, for display) or a human error message.
async function loadMotoGroupSetup({
  companyId,
  instructorId,
  vehicleIds,
  followVehicleId,
  followCarRules,
  capacity,
}: {
  companyId: string;
  /** When set, the fleet + follow car must all be accessible to this instructor. */
  instructorId: string | null;
  vehicleIds: string[];
  followVehicleId: string | null;
  followCarRules: FollowCarRules;
  capacity: number;
}): Promise<
  | { ok: true; fleet: LoadedVehicle[]; followVehicle: LoadedVehicle | null }
  | { ok: false; message: string }
> {
  const fleetIds = Array.from(new Set(vehicleIds));
  if (!fleetIds.length) {
    return { ok: false, message: MOTO_GROUP_SETUP_MESSAGES.empty_fleet };
  }
  const vehicleSelect = {
    id: true,
    name: true,
    licenseCategory: true,
    transmission: true,
    assignedInstructorId: true,
    poolMembers: { select: { instructorId: true } },
  } as const;
  const toAccess = (v: { assignedInstructorId: string | null; poolMembers: { instructorId: string }[] }) => ({
    assignedInstructorId: v.assignedInstructorId,
    poolInstructorIds: v.poolMembers.map((p) => p.instructorId),
  });

  const vehicles = await prisma.autoscuolaVehicle.findMany({
    where: { id: { in: fleetIds }, companyId, status: "active" },
    select: vehicleSelect,
  });
  if (vehicles.length !== fleetIds.length) {
    return { ok: false, message: "Una o più moto della flotta non sono valide o non disponibili." };
  }
  // An instructor may only build a fleet from vehicles they can use (exclusive
  // to them, or open / in a pool they belong to).
  if (instructorId) {
    const inaccessible = vehicles.some((v) => !instructorCanUseVehicle(toAccess(v), instructorId));
    if (inaccessible) {
      return { ok: false, message: "Una moto della flotta non è disponibile per questo istruttore." };
    }
  }

  let followVehicle: LoadedVehicle | null = null;
  if (followVehicleId) {
    const fc = await prisma.autoscuolaVehicle.findFirst({
      where: { id: followVehicleId, companyId, status: "active" },
      select: vehicleSelect,
    });
    if (!fc) return { ok: false, message: "Auto al seguito non trovata o non disponibile." };
    if (instructorId && !instructorCanUseVehicle(toAccess(fc), instructorId)) {
      return { ok: false, message: "L'auto al seguito non è disponibile per questo istruttore." };
    }
    followVehicle = { id: fc.id, name: fc.name, licenseCategory: fc.licenseCategory, transmission: fc.transmission };
  }

  const fleet: LoadedVehicle[] = vehicles.map((v) => ({
    id: v.id, name: v.name, licenseCategory: v.licenseCategory, transmission: v.transmission,
  }));
  const err = validateMotoGroupSetup({ fleet, followVehicle, followCarRules, capacity });
  if (err) return { ok: false, message: MOTO_GROUP_SETUP_MESSAGES[err] };
  return { ok: true, fleet, followVehicle };
}

// Motos already assigned to active participants of a moto group (so a newly
// added participant gets a still-free moto). Reads the primary join rows.
async function motosTakenByParticipants(
  tx: Prisma.TransactionClient,
  groupLessonId: string,
): Promise<Set<string>> {
  const rows = await tx.autoscuolaAppointment.findMany({
    where: { groupLessonId, status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
    select: { vehicleId: true },
  });
  return new Set(rows.map((r) => r.vehicleId).filter((v): v is string => Boolean(v)));
}

const createGroupLessonSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
  /** "standard" (one shared vehicle) | "moto" (a moto fleet + shared follow car). */
  kind: z.enum(["standard", "moto"]).optional(),
  vehicleId: z.string().uuid().optional().nullable(),
  /** Moto fleet (kind="moto"): the motos reserved for the lesson. */
  vehicleIds: z.array(z.string().uuid()).optional(),
  /** Shared follow car (kind="moto"), category B. */
  followVehicleId: z.string().uuid().optional().nullable(),
  instructorId: z.string().uuid().optional().nullable(),
  // Free choice by owner/instructor (12 = sanity ceiling). For moto groups the
  // participants may outnumber the fleet (they ride in turns).
  capacity: z.number().int().min(1).max(12).optional(),
  studentIds: z.array(z.string().uuid()).optional(),
  notes: z.string().optional(),
});

export async function createGroupLesson(
  input: z.infer<typeof createGroupLessonSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = createGroupLessonSchema.parse(input);
    const companyId = membership.companyId;

    const limits = await getCachedCompanyServiceLimits(companyId);
    if ((limits as Record<string, unknown>).groupLessonsEnabled !== true) {
      return { success: false as const, message: "Il modulo Guide di gruppo non è attivo." };
    }
    const vehiclesEnabled = (limits as Record<string, unknown>).vehiclesEnabled !== false;

    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { success: false as const, message: "Data non valida." };
    }
    if (endsAt <= startsAt) {
      return { success: false as const, message: "Orario non valido." };
    }

    const kind = payload.kind === "moto" ? "moto" : "standard";
    const followCarRules = parseFollowCarRulesFromLimits(limits as Record<string, unknown>);
    const studentIds = Array.from(new Set(payload.studentIds ?? []));

    // Resolve instructor (auto-assign self for instructors who didn't pick one).
    let instructorId: string | null = payload.instructorId ?? null;
    if (!instructorId && isInstructor(membership.autoscuolaRole)) {
      const self = await getOwnInstructorProfile(companyId, membership.userId);
      instructorId = self?.id ?? null;
    } else if (instructorId) {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { id: instructorId, companyId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Istruttore non trovato." };
    }
    // A group lesson without an instructor must not exist: nobody would run it,
    // no conflict/overlap check would protect the slot.
    if (!instructorId) {
      return { success: false as const, message: "Seleziona l'istruttore della guida di gruppo." };
    }

    const price = await getGroupLessonPrice({ companyId });
    const priceDecimal = new Prisma.Decimal(price.toFixed(2));
    const { penaltyCutoffAt, penaltyAmount } = await getGroupLessonPenaltySnapshot({
      companyId,
      startsAt,
      price,
    });

    // ---- MOTO group: a fleet of motos + one shared follow car, one moto auto-
    // assigned per participant (mixed categories allowed). -------------------
    if (kind === "moto") {
      if (!vehiclesEnabled) {
        return { success: false as const, message: "Le guide di gruppo moto richiedono il modulo Veicoli." };
      }
      const fleetIds = Array.from(new Set(payload.vehicleIds ?? []));
      const capacity = payload.capacity ?? fleetIds.length;
      const setup = await loadMotoGroupSetup({
        companyId,
        instructorId,
        vehicleIds: fleetIds,
        followVehicleId: payload.followVehicleId ?? null,
        followCarRules,
        capacity,
      });
      if (!setup.ok) return { success: false as const, message: setup.message };
      if (studentIds.length > capacity) {
        return { success: false as const, message: "Troppi allievi per la capienza scelta." };
      }

      const optInErr = await validateGroupLessonStudents({
        companyId,
        studentIds,
        vehicle: null,
        vehiclesEnabled,
        skipVehicleLicense: true,
      });
      if (optInErr) return { success: false as const, message: optInErr };

      // Auto-assign a distinct fleet moto to each pre-added student by license
      // (best-effort: with more students than motos the extras ride in turns).
      let assignments: Array<{ studentId: string; vehicleId: string | null }> = [];
      if (studentIds.length) {
        const members = await prisma.companyMember.findMany({
          where: { companyId, userId: { in: studentIds }, autoscuolaRole: "STUDENT" },
          select: { userId: true, licenseCategory: true, transmission: true },
        });
        const byId = new Map(members.map((m) => [m.userId, m]));
        const res = assignMotosToStudents({
          fleet: setup.fleet,
          students: studentIds.map((id) => ({
            studentId: id,
            license: {
              licenseCategory: byId.get(id)?.licenseCategory ?? null,
              transmission: byId.get(id)?.transmission ?? null,
            },
          })),
        });
        if (!res.ok) {
          return {
            success: false as const,
            message: "Un allievo non ha nessuna moto compatibile col suo percorso nella flotta.",
          };
        }
        assignments = res.assignments;
      }

      // Follow car: OPTIONAL at creation. When the rules require one and
      // students are pre-added (the lesson has riders from the start), assign
      // a free car now; otherwise it gets auto-assigned at the first enrolment.
      let motoFollowVehicleId = setup.followVehicle?.id ?? null;
      if (
        !motoFollowVehicleId &&
        studentIds.length > 0 &&
        groupMotoFollowCarRequired(followCarRules, setup.fleet.map((m) => m.licenseCategory))
      ) {
        const car = await findFreeGroupFollowCar({ companyId, instructorId, startsAt, endsAt });
        if (!car) return { success: false as const, message: NO_FREE_FOLLOW_CAR_MESSAGE };
        motoFollowVehicleId = car;
      }

      const reserved = [...setup.fleet.map((v) => v.id), motoFollowVehicleId].filter(
        (v): v is string => Boolean(v),
      );
      const overlapErr = await findGroupLessonOverlap({
        companyId,
        startsAt,
        endsAt,
        instructorId,
        vehicleIds: reserved,
        studentIds,
      });
      if (overlapErr) return { success: false as const, message: overlapErr };

      const groupLesson = await prisma.$transaction(async (tx) => {
        await lockAndRecheckGroupLessonOverlap(tx, {
          companyId,
          startsAt,
          endsAt,
          instructorId,
          vehicleIds: reserved,
          studentIds,
        });
        const gl = await tx.autoscuolaGroupLesson.create({
          data: {
            companyId,
            kind: "moto",
            instructorId,
            vehicleId: null,
            followVehicleId: motoFollowVehicleId,
            startsAt,
            endsAt,
            capacity,
            status: "scheduled",
            priceAmount: priceDecimal,
            notes: payload.notes ?? null,
            createdByUserId: membership.userId,
            fleetVehicles: { create: setup.fleet.map((v) => ({ vehicleId: v.id })) },
          },
        });
        for (const a of assignments) {
          await tx.autoscuolaAppointment.create({
            data: {
              companyId,
              studentId: a.studentId,
              bookingSource: BOOKING_SOURCE.groupLesson,
              type: "group_lesson",
              startsAt,
              endsAt,
              status: "scheduled",
              instructorId,
              vehicleId: a.vehicleId,
              notes: null,
              groupLessonId: gl.id,
              paymentRequired: true,
              paymentStatus: "pending",
              manualPaymentStatus: "unpaid",
              priceAmount: priceDecimal,
              penaltyAmount,
              penaltyCutoffAt,
              creditApplied: false,
              // The assigned moto is the participant's primary vehicle (none =
              // rides in turns). The shared follow car lives on the container.
              ...(a.vehicleId
                ? { appointmentVehicles: { create: [{ vehicleId: a.vehicleId, role: "primary" }] } }
                : {}),
            },
          });
        }
        return gl;
      });

      await invalidateAgendaAndPaymentsCache(companyId);
      return {
        success: true as const,
        data: { groupLessonId: groupLesson.id, participants: assignments.length, capacity },
      };
    }

    // ---- STANDARD group: one shared vehicle for all participants. -----------
    const capacity = payload.capacity ?? 3;
    if (studentIds.length > capacity) {
      return { success: false as const, message: "Troppi allievi per la capienza scelta." };
    }

    // Resolve vehicle.
    let vehicle: GroupLessonVehicleInfo = null;
    if (payload.vehicleId) {
      const v = await prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId, status: "active" },
        select: { id: true, licenseCategory: true, transmission: true },
      });
      if (!v) return { success: false as const, message: "Veicolo non trovato." };
      // A standard group shares one CAR — motos belong to the kind="moto" flow.
      if (isMotoLicenseCategory(v.licenseCategory)) {
        return { success: false as const, message: "Per una guida di gruppo in moto usa la modalità Moto." };
      }
      vehicle = v;
    }
    const vehicleId = vehicle?.id ?? null;

    const studentErr = await validateGroupLessonStudents({
      companyId,
      studentIds,
      vehicle,
      vehiclesEnabled,
    });
    if (studentErr) return { success: false as const, message: studentErr };

    const overlapErr = await findGroupLessonOverlap({
      companyId,
      startsAt,
      endsAt,
      instructorId,
      vehicleIds: vehicleId ? [vehicleId] : [],
      studentIds,
    });
    if (overlapErr) return { success: false as const, message: overlapErr };

    const groupLesson = await prisma.$transaction(async (tx) => {
      await lockAndRecheckGroupLessonOverlap(tx, {
        companyId,
        startsAt,
        endsAt,
        instructorId,
        vehicleIds: vehicleId ? [vehicleId] : [],
        studentIds,
      });
      const gl = await tx.autoscuolaGroupLesson.create({
        data: {
          companyId,
          instructorId,
          vehicleId,
          startsAt,
          endsAt,
          capacity,
          status: "scheduled",
          priceAmount: priceDecimal,
          notes: payload.notes ?? null,
          createdByUserId: membership.userId,
        },
      });
      if (studentIds.length) {
        await tx.autoscuolaAppointment.createMany({
          data: studentIds.map((studentId) => ({
            companyId,
            studentId,
            bookingSource: BOOKING_SOURCE.groupLesson,
            type: "group_lesson",
            startsAt,
            endsAt,
            status: "scheduled",
            instructorId,
            vehicleId,
            // Per-student note: starts empty. The instructor writes an
            // individual note per participant (typically after the lesson) via
            // updateAutoscuolaAppointmentDetails — NOT copied from the container.
            notes: null,
            groupLessonId: gl.id,
            paymentRequired: true,
            paymentStatus: "pending",
            manualPaymentStatus: "unpaid",
            priceAmount: priceDecimal,
            penaltyAmount,
            penaltyCutoffAt,
            creditApplied: false,
          })),
        });
      }
      return gl;
    });

    await invalidateAgendaAndPaymentsCache(companyId);
    return {
      success: true as const,
      data: { groupLessonId: groupLesson.id, participants: studentIds.length, capacity },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const addGroupLessonParticipantSchema = z.object({
  groupLessonId: z.string().uuid(),
  studentId: z.string().uuid(),
});

export async function addGroupLessonParticipant(
  input: z.infer<typeof addGroupLessonParticipantSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = addGroupLessonParticipantSchema.parse(input);
    const companyId = membership.companyId;

    const limits = await getCachedCompanyServiceLimits(companyId);
    const vehiclesEnabled = (limits as Record<string, unknown>).vehiclesEnabled !== false;

    const gl = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: payload.groupLessonId, companyId, status: "scheduled" },
      select: {
        id: true, startsAt: true, endsAt: true, capacity: true, instructorId: true,
        kind: true, priceAmount: true, notes: true, followVehicleId: true,
        vehicle: { select: { id: true, licenseCategory: true, transmission: true } },
        fleetVehicles: {
          select: { vehicle: { select: { id: true, licenseCategory: true, transmission: true } } },
        },
        _count: { select: { appointments: { where: { status: { in: GROUP_LESSON_ACTIVE_STATUSES } } } } },
      },
    });
    if (!gl) return { success: false as const, message: "Guida di gruppo non trovata." };
    if (!gl.endsAt) return { success: false as const, message: "Guida di gruppo senza orario." };
    if (gl._count.appointments >= gl.capacity) {
      return { success: false as const, message: "Posti esauriti." };
    }
    const isMoto = gl.kind === "moto";

    const studentErr = await validateGroupLessonStudents({
      companyId,
      studentIds: [payload.studentId],
      vehicle: gl.vehicle ?? null,
      vehiclesEnabled,
      skipVehicleLicense: isMoto,
    });
    if (studentErr) return { success: false as const, message: studentErr };

    const overlapErr = await findGroupLessonOverlap({
      companyId,
      startsAt: gl.startsAt,
      endsAt: gl.endsAt,
      instructorId: null,
      vehicleIds: [],
      studentIds: [payload.studentId],
    });
    if (overlapErr) return { success: false as const, message: overlapErr };

    // Guard against a duplicate participant.
    const existing = await prisma.autoscuolaAppointment.findFirst({
      where: {
        groupLessonId: gl.id,
        studentId: payload.studentId,
        status: { in: GROUP_LESSON_ACTIVE_STATUSES },
      },
      select: { id: true },
    });
    if (existing) return { success: false as const, message: "Allievo già iscritto." };

    const { penaltyCutoffAt, penaltyAmount } = await getGroupLessonPenaltySnapshot({
      companyId,
      startsAt: gl.startsAt,
      price: Number(gl.priceAmount),
    });

    // For a moto group, the participant's license determines which fleet moto
    // they get; resolve and store it (a free, compatible moto must remain).
    const fleet: FleetVehicle[] = gl.fleetVehicles.map((f) => f.vehicle);
    let motoLicense = { licenseCategory: null as string | null, transmission: null as string | null };
    if (isMoto) {
      const member = await prisma.companyMember.findFirst({
        where: { companyId, userId: payload.studentId, autoscuolaRole: "STUDENT" },
        select: { licenseCategory: true, transmission: true },
      });
      motoLicense = {
        licenseCategory: member?.licenseCategory ?? null,
        transmission: member?.transmission ?? null,
      };

      // Lazy follow car: only for the FIRST rider of a car-less lesson. Once
      // the lesson has riders, a missing car means the staff explicitly
      // removed it ("Nessuna") — their choice wins, never re-assign.
      if (
        !gl.followVehicleId &&
        gl._count.appointments === 0 &&
        groupMotoFollowCarRequired(
          parseFollowCarRulesFromLimits(limits as Record<string, unknown>),
          fleet.map((m) => m.licenseCategory),
        )
      ) {
        const car = await findFreeGroupFollowCar({
          companyId,
          instructorId: gl.instructorId,
          startsAt: gl.startsAt,
          endsAt: gl.endsAt,
          excludeGroupLessonId: gl.id,
        });
        if (!car) return { success: false as const, message: NO_FREE_FOLLOW_CAR_MESSAGE };
        await prisma.autoscuolaGroupLesson.updateMany({
          where: { id: gl.id, followVehicleId: null },
          data: { followVehicleId: car },
        });
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        let assignedVehicleId: string | null = gl.vehicle?.id ?? null;
        if (isMoto) {
          // Serialize concurrent enrolments so the moto assignment is exact.
          await tx.$queryRaw`SELECT id FROM "AutoscuolaGroupLesson" WHERE id = ${gl.id}::uuid FOR UPDATE`;
          const filled = await tx.autoscuolaAppointment.count({
            where: { groupLessonId: gl.id, status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
          });
          if (filled >= gl.capacity) throw new Error("Posti esauriti.");
          if (!eligibleForMotoGroup({ fleet, student: motoLicense })) {
            throw new Error("La patente dell'allievo non è compatibile con le moto della flotta.");
          }
          // Best-effort moto assignment: none free = the student rides in turns.
          const taken = await motosTakenByParticipants(tx, gl.id);
          assignedVehicleId = assignMotoForStudent({ fleet, takenVehicleIds: taken, student: motoLicense });
        }
        await tx.autoscuolaAppointment.create({
          data: {
            companyId,
            studentId: payload.studentId,
            bookingSource: BOOKING_SOURCE.groupLesson,
            type: "group_lesson",
            startsAt: gl.startsAt,
            endsAt: gl.endsAt,
            status: "scheduled",
            instructorId: gl.instructorId,
            vehicleId: assignedVehicleId,
            // Per-student note starts empty (see createGroupLesson) — the instructor
            // adds an individual note per participant, not the container note.
            notes: null,
            groupLessonId: gl.id,
            paymentRequired: true,
            paymentStatus: "pending",
            manualPaymentStatus: "unpaid",
            priceAmount: gl.priceAmount,
            penaltyAmount,
            penaltyCutoffAt,
            creditApplied: false,
            ...(isMoto && assignedVehicleId
              ? { appointmentVehicles: { create: [{ vehicleId: assignedVehicleId, role: "primary" }] } }
              : {}),
          },
        });
      });
    } catch (txErr) {
      return { success: false as const, message: formatError(txErr) };
    }

    await invalidateAgendaAndPaymentsCache(companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function removeGroupLessonParticipant(input: {
  groupLessonId: string;
  studentId: string;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }

    // Cerchiamo tra TUTTI gli stati "iscritto" (incl. finalizzati: assente /
    // completato / pending_review), non solo gli attivi: altrimenti rimuovere un
    // allievo già segnato "Assente" (no_show) dava "Partecipante non trovato".
    const appt = await prisma.autoscuolaAppointment.findFirst({
      where: {
        companyId: membership.companyId,
        groupLessonId: input.groupLessonId,
        studentId: input.studentId,
        type: "group_lesson",
        status: { in: GROUP_LESSON_ENROLLED_STATUSES },
      },
      select: { id: true, status: true },
    });
    if (!appt) return { success: false as const, message: "Partecipante non trovato." };

    // Partecipante ancora attivo (guida non conclusa) → cancellazione "ricca":
    // early = libera il posto & niente addebito, late/after-the-fact = resta "da
    // pagare" ed entra nell'inbox dei ritardi; libera il posto e ri-diffonde
    // l'invito se la guida è ancora futura.
    if (GROUP_LESSON_ACTIVE_STATUSES.includes(appt.status)) {
      return await cancelGroupLessonParticipantAppointment({
        companyId: membership.companyId,
        appointmentId: appt.id,
        actorUserId: membership.userId,
      });
    }

    // Partecipante già finalizzato (assente / completato / da confermare):
    // rimuoverlo = toglierlo dal roster della guida ormai passata. Nessun posto da
    // liberare né invito da ri-diffondere; azzeriamo l'eventuale addebito residuo
    // (es. la tariffa da no_show), perché la rimozione equivale a un "annulla".
    await prisma.autoscuolaAppointment.update({
      where: { id: appt.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: membership.userId,
        cancellationKind: "manual_cancel",
        paymentRequired: false,
        paymentStatus: "not_required",
        manualPaymentStatus: null,
      },
    });
    return { success: true as const, message: "Allievo rimosso." };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function cancelGroupLesson(groupLessonId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const gl = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: groupLessonId, companyId: membership.companyId },
      select: { id: true },
    });
    if (!gl) return { success: false as const, message: "Guida di gruppo non trovata." };

    await prisma.$transaction([
      prisma.autoscuolaAppointment.updateMany({
        // Annullare la guida = cancellare OGNI posto, inclusi i finalizzati
        // (completed / no_show), non solo gli attivi/pending_review. Se lasciassimo
        // i completed/no_show, l'agenda continuerebbe a derivare la card da quegli
        // appuntamenti e la guida "rimarrebbe lì" (bug sulle guide passate). Un
        // annullamento rende la guida nulla per tutti (billing azzerato sotto).
        where: {
          groupLessonId: gl.id,
          status: { not: "cancelled" },
        },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledByUserId: membership.userId,
          paymentRequired: false,
          paymentStatus: "not_required",
          manualPaymentStatus: null,
        },
      }),
      prisma.autoscuolaGroupLessonInvite.updateMany({
        where: { groupLessonId: gl.id, status: "broadcasted" },
        data: { status: "cancelled" },
      }),
      prisma.autoscuolaGroupLesson.update({
        where: { id: gl.id },
        data: { status: "cancelled" },
      }),
    ]);

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function getGroupLessonsForAgenda(input?: {
  from?: string | null;
  to?: string | null;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const from = input?.from ? new Date(input.from) : null;
    const to = input?.to ? new Date(input.to) : null;

    const lessons = await prisma.autoscuolaGroupLesson.findMany({
      where: {
        companyId,
        status: { not: "cancelled" },
        ...(from || to
          ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        status: true,
        kind: true,
        priceAmount: true,
        notes: true,
        instructorId: true,
        instructor: { select: { id: true, name: true } },
        vehicle: { select: { id: true, name: true, licenseCategory: true, transmission: true } },
        followVehicle: { select: { id: true, name: true } },
        fleetVehicles: {
          select: { vehicle: { select: { id: true, name: true, licenseCategory: true, transmission: true } } },
        },
        appointments: {
          where: { status: { in: GROUP_LESSON_ENROLLED_STATUSES } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            studentId: true,
            student: { select: { name: true } },
            vehicle: { select: { id: true, name: true, licenseCategory: true } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
      take: 500,
    });

    return {
      success: true as const,
      data: lessons.map((l) => ({
        id: l.id,
        startsAt: l.startsAt.toISOString(),
        endsAt: l.endsAt ? l.endsAt.toISOString() : null,
        capacity: l.capacity,
        status: l.status,
        kind: l.kind,
        priceAmount: Number(l.priceAmount),
        notes: l.notes,
        instructorId: l.instructorId,
        instructorName: l.instructor?.name ?? null,
        vehicleId: l.vehicle?.id ?? null,
        vehicleName: l.vehicle?.name ?? null,
        licenseCategory: l.vehicle?.licenseCategory ?? null,
        transmission: l.vehicle?.transmission ?? null,
        followVehicleId: l.followVehicle?.id ?? null,
        followVehicleName: l.followVehicle?.name ?? null,
        fleet: l.fleetVehicles.map((f) => ({
          id: f.vehicle.id,
          name: f.vehicle.name,
          licenseCategory: f.vehicle.licenseCategory,
          transmission: f.vehicle.transmission,
        })),
        filledSeats: l.appointments.length,
        openSeats: Math.max(0, l.capacity - l.appointments.length),
        participants: l.appointments.map((a) => ({
          appointmentId: a.id,
          // Non-null: group-lesson seats always have a student.
          studentId: a.studentId!,
          studentName: a.student?.name ?? null,
          vehicleId: a.vehicle?.id ?? null,
          vehicleName: a.vehicle?.name ?? null,
          licenseCategory: a.vehicle?.licenseCategory ?? null,
        })),
      })),
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// Single group lesson (for the web management dialog).
export async function getGroupLesson(groupLessonId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const l = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: groupLessonId, companyId: membership.companyId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        status: true,
        kind: true,
        priceAmount: true,
        notes: true,
        instructorId: true,
        instructor: { select: { id: true, name: true } },
        vehicle: { select: { id: true, name: true, licenseCategory: true, transmission: true } },
        followVehicle: { select: { id: true, name: true } },
        fleetVehicles: {
          select: { vehicle: { select: { id: true, name: true, licenseCategory: true, transmission: true } } },
        },
        appointments: {
          where: { status: { in: GROUP_LESSON_ENROLLED_STATUSES } },
          // Stable enrolment order so the roster never reshuffles when a seat's
          // presence changes (Postgres has no implicit order without this).
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            studentId: true,
            status: true,
            notes: true,
            student: { select: { name: true } },
            vehicle: { select: { id: true, name: true, licenseCategory: true } },
          },
        },
      },
    });
    if (!l) return { success: false as const, message: "Guida di gruppo non trovata." };

    // Students may only read a lesson they are enrolled in, and never see the
    // other participants' identities — they get anonymous seats (count only).
    const isStaff =
      membership.role === "admin" ||
      isOwner(membership.autoscuolaRole) ||
      isInstructor(membership.autoscuolaRole);
    if (!isStaff) {
      const enrolled = l.appointments.some((a) => a.studentId === membership.userId);
      if (!enrolled) {
        return { success: false as const, message: "Guida di gruppo non trovata." };
      }
    }

    return {
      success: true as const,
      data: {
        id: l.id,
        startsAt: l.startsAt.toISOString(),
        endsAt: l.endsAt ? l.endsAt.toISOString() : null,
        capacity: l.capacity,
        status: l.status,
        priceAmount: Number(l.priceAmount),
        notes: l.notes,
        instructorId: l.instructorId,
        instructorName: l.instructor?.name ?? null,
        kind: l.kind,
        vehicleId: l.vehicle?.id ?? null,
        vehicleName: l.vehicle?.name ?? null,
        licenseCategory: l.vehicle?.licenseCategory ?? null,
        transmission: l.vehicle?.transmission ?? null,
        followVehicleId: l.followVehicle?.id ?? null,
        followVehicleName: l.followVehicle?.name ?? null,
        fleet: l.fleetVehicles.map((f) => ({
          id: f.vehicle.id,
          name: f.vehicle.name,
          licenseCategory: f.vehicle.licenseCategory,
          transmission: f.vehicle.transmission,
        })),
        filledSeats: l.appointments.length,
        openSeats: Math.max(0, l.capacity - l.appointments.length),
        participants: l.appointments.map((a) => {
          const isSelf = a.studentId === membership.userId;
          if (!isStaff && !isSelf) {
            // Anonymous seat: keep the slot for the count, hide the identity.
            return {
              appointmentId: "",
              studentId: "",
              studentName: null,
              attendance: "pending" as GroupLessonAttendance,
              notes: null,
              vehicleId: null,
              vehicleName: null,
              licenseCategory: null,
            };
          }
          return {
            appointmentId: a.id,
            // Non-null: group-lesson seats always have a student (studentless
            // placeholders exist only for exams).
            studentId: a.studentId!,
            studentName: isStaff ? a.student?.name ?? null : null,
            // Present/absent outcome of this seat, so the staff roster can show
            // and correct it. "pending" = past-but-unreviewed (pending_review) or
            // still upcoming.
            attendance: groupLessonAttendance(a.status),
            // Per-student note lives on the seat appointment (edited via
            // updateAutoscuolaAppointmentDetails). Surfaced to staff and to the
            // student's own seat for the instructor roster UI.
            notes: a.notes ?? null,
            // Assigned moto (kind="moto"); the shared follow car is on the group.
            vehicleId: a.vehicle?.id ?? null,
            vehicleName: a.vehicle?.name ?? null,
            licenseCategory: a.vehicle?.licenseCategory ?? null,
          };
        }),
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Group-lesson attendance (present / absent) — per seat + bulk "tutti presenti".
//
// A group-lesson seat is a plain AutoscuolaAppointment. We deliberately do NOT
// route this through updateAutoscuolaAppointmentStatus: that path demands a
// valid lesson TYPE, applies lesson credits and runs settlement — all wrong for
// a group seat (flat "da pagare", creditApplied=false). Presence here is a pure
// record-keeping toggle: it does NOT change billing (the seat stays "da pagare"
// regardless), it only moves the seat out of "Da confermare".
// ---------------------------------------------------------------------------

// Present = checked_in while the lesson is still running, auto-completed once it
// has ended (mirrors updateAutoscuolaAppointmentStatus). Group reviews happen
// after the fact, so in practice this is always "completed".
function groupLessonPresentStatus(startsAt: Date, endsAt: Date | null): string {
  const endTime = endsAt ?? new Date(startsAt.getTime() + 60 * 60 * 1000);
  return new Date() >= endTime ? "completed" : "checked_in";
}

async function resolveOwnInstructorId(companyId: string, userId: string) {
  const own = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId, userId, status: { not: "inactive" } },
    select: { id: true },
  });
  return own?.id ?? null;
}

const groupLessonSeatOutcomeSchema = z.object({
  appointmentId: z.string().uuid(),
  outcome: z.enum(["present", "absent"]),
});

/** Mark a single group-lesson participant present or absent. */
export async function setGroupLessonSeatOutcome(
  input: z.infer<typeof groupLessonSeatOutcomeSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const { appointmentId, outcome } = groupLessonSeatOutcomeSchema.parse(input);

    const isStaff =
      membership.role === "admin" ||
      isOwner(membership.autoscuolaRole) ||
      isInstructor(membership.autoscuolaRole);
    if (!isStaff) return { success: false as const, message: "Non autorizzato." };

    const appt = await prisma.autoscuolaAppointment.findFirst({
      where: {
        id: appointmentId,
        companyId: membership.companyId,
        type: "group_lesson",
        groupLessonId: { not: null },
      },
      select: { id: true, status: true, startsAt: true, endsAt: true, instructorId: true },
    });
    if (!appt) return { success: false as const, message: "Partecipante non trovato." };
    if (normalizeStatus(appt.status) === "cancelled") {
      return { success: false as const, message: "Il posto è stato annullato." };
    }

    // An instructor (non-admin) may only review their own lessons.
    if (isInstructor(membership.autoscuolaRole) && membership.role !== "admin") {
      const ownInstructorId = await resolveOwnInstructorId(membership.companyId, membership.userId);
      if (!ownInstructorId || appt.instructorId !== ownInstructorId) {
        return { success: false as const, message: "Puoi aggiornare solo le tue guide." };
      }
    }

    const nextStatus =
      outcome === "absent" ? "no_show" : groupLessonPresentStatus(appt.startsAt, appt.endsAt);

    await prisma.autoscuolaAppointment.update({
      where: { id: appt.id, companyId: membership.companyId },
      data: { status: nextStatus },
    });
    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Mark every (non-cancelled) participant of a group lesson present in one go. */
export async function markGroupLessonAllPresent(input: { groupLessonId: string }) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const groupLessonId = z.string().uuid().parse(input.groupLessonId);

    const isStaff =
      membership.role === "admin" ||
      isOwner(membership.autoscuolaRole) ||
      isInstructor(membership.autoscuolaRole);
    if (!isStaff) return { success: false as const, message: "Non autorizzato." };

    const gl = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: groupLessonId, companyId: membership.companyId },
      select: { id: true, startsAt: true, endsAt: true, instructorId: true },
    });
    if (!gl) return { success: false as const, message: "Guida di gruppo non trovata." };

    if (isInstructor(membership.autoscuolaRole) && membership.role !== "admin") {
      const ownInstructorId = await resolveOwnInstructorId(membership.companyId, membership.userId);
      if (!ownInstructorId || gl.instructorId !== ownInstructorId) {
        return { success: false as const, message: "Puoi aggiornare solo le tue guide." };
      }
    }

    const presentStatus = groupLessonPresentStatus(gl.startsAt, gl.endsAt);
    await prisma.autoscuolaAppointment.updateMany({
      where: {
        groupLessonId: gl.id,
        type: "group_lesson",
        status: { in: GROUP_LESSON_ENROLLED_STATUSES },
      },
      data: { status: presentStatus },
    });
    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updateGroupLessonSchema = z.object({
  groupLessonId: z.string().uuid(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  instructorId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  /** Moto group: replace the moto fleet (must still cover assigned participants). */
  vehicleIds: z.array(z.string().uuid()).optional(),
  /** Moto group: change the shared follow car (null clears, if not required). */
  followVehicleId: z.string().uuid().nullable().optional(),
  /** Max participants (free, ≤12) — cannot drop below the current enrolled count. */
  capacity: z.number().int().min(1).max(12).optional(),
  /** Instructor operational notes on the group lesson container (null clears). */
  notes: z.string().max(2000).nullable().optional(),
});

// Edit a group lesson and CASCADE the change to every participant appointment
// (move the whole group, or change instructor/vehicle for all). License + overlap
// validated against the new values (excluding this lesson's own rows).
export async function updateGroupLesson(
  input: z.infer<typeof updateGroupLessonSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = updateGroupLessonSchema.parse(input);
    const companyId = membership.companyId;

    const gl = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: payload.groupLessonId, companyId, status: "scheduled" },
      select: {
        id: true, startsAt: true, endsAt: true, capacity: true,
        kind: true, instructorId: true, vehicleId: true, followVehicleId: true,
        fleetVehicles: { select: { vehicleId: true } },
        appointments: {
          where: { status: { in: GROUP_LESSON_ACTIVE_STATUSES } },
          select: { studentId: true, vehicleId: true },
        },
      },
    });
    if (!gl) return { success: false as const, message: "Guida di gruppo non trovata." };

    const startsAt = payload.startsAt ? new Date(payload.startsAt) : gl.startsAt;
    const endsAt = payload.endsAt ? new Date(payload.endsAt) : gl.endsAt;
    if (Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return { success: false as const, message: "Orario non valido." };
    }
    const instructorId = payload.instructorId !== undefined ? payload.instructorId : gl.instructorId;
    // A group lesson must always have an instructor (same rule as creation).
    if (!instructorId) {
      return { success: false as const, message: "Seleziona l'istruttore della guida di gruppo." };
    }
    {
      const instr = await prisma.autoscuolaInstructor.findFirst({
        where: { id: instructorId, companyId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (!instr) return { success: false as const, message: "Istruttore non trovato." };
    }

    // Group-lesson seats always carry a student (only exam placeholders are
    // studentless); filter narrows the type without changing runtime behavior.
    const studentIds = gl.appointments.map((a) => a.studentId).filter((id): id is string => id != null);

    // Capacity change: never below the current enrolled count.
    if (payload.capacity !== undefined && payload.capacity < studentIds.length) {
      return {
        success: false as const,
        message: `La capienza non può essere inferiore agli iscritti attuali (${studentIds.length}).`,
      };
    }

    const limits = await getCachedCompanyServiceLimits(companyId);
    const vehiclesEnabled = (limits as Record<string, unknown>).vehiclesEnabled !== false;
    const followCarRules = parseFollowCarRulesFromLimits(limits as Record<string, unknown>);
    // Notes live on the container only (participant appointments keep their own
    // per-student notes); empty string clears them.
    const notes =
      payload.notes !== undefined ? payload.notes?.trim() || null : undefined;

    // ---- MOTO group: edit fleet / follow car / capacity; the fleet must still
    // cover every assigned moto, and participants keep their own moto (no
    // vehicle cascade). -------------------------------------------------------
    if (gl.kind === "moto") {
      const currentFleetIds = gl.fleetVehicles.map((f) => f.vehicleId);
      const newFleetIds =
        payload.vehicleIds !== undefined ? Array.from(new Set(payload.vehicleIds)) : currentFleetIds;
      const newFleetSet = new Set(newFleetIds);
      const followVehicleId =
        payload.followVehicleId !== undefined ? payload.followVehicleId : gl.followVehicleId;
      const capacity = payload.capacity !== undefined ? payload.capacity : gl.capacity;

      // A moto in use by a participant cannot be dropped from the fleet.
      const assignedMotos = gl.appointments
        .map((a) => a.vehicleId)
        .filter((v): v is string => Boolean(v));
      for (const m of assignedMotos) {
        if (!newFleetSet.has(m)) {
          return {
            success: false as const,
            message: "Una moto assegnata a un partecipante non può essere rimossa dalla flotta.",
          };
        }
      }

      const setup = await loadMotoGroupSetup({
        companyId,
        instructorId,
        vehicleIds: newFleetIds,
        followVehicleId,
        followCarRules,
        capacity,
      });
      if (!setup.ok) return { success: false as const, message: setup.message };

      // Follow car: the staff's explicit choice ALWAYS wins here — clearing it
      // ("Nessuna") persists and is never re-assigned (2026-07-06). The lazy
      // auto-assignment only happens at the FIRST enrolment of a car-less
      // lesson (see addGroupLessonParticipant / respondGroupLessonInvite).

      const reserved = [...newFleetIds, followVehicleId].filter((v): v is string => Boolean(v));
      const overlapErr = await findGroupLessonOverlap({
        companyId, startsAt, endsAt, instructorId, vehicleIds: reserved, studentIds,
        excludeGroupLessonId: gl.id,
      });
      if (overlapErr) return { success: false as const, message: overlapErr };

      await prisma.$transaction(async (tx) => {
        await tx.autoscuolaGroupLesson.update({
          where: { id: gl.id },
          data: {
            startsAt, endsAt, instructorId, vehicleId: null, followVehicleId,
            ...(payload.capacity !== undefined ? { capacity } : {}),
            ...(notes !== undefined ? { notes } : {}),
          },
        });
        if (payload.vehicleIds !== undefined) {
          const toRemove = currentFleetIds.filter((id) => !newFleetSet.has(id));
          const toAdd = newFleetIds.filter((id) => !currentFleetIds.includes(id));
          if (toRemove.length) {
            await tx.autoscuolaGroupLessonVehicle.deleteMany({
              where: { groupLessonId: gl.id, vehicleId: { in: toRemove } },
            });
          }
          if (toAdd.length) {
            await tx.autoscuolaGroupLessonVehicle.createMany({
              data: toAdd.map((vehicleId) => ({ groupLessonId: gl.id, vehicleId })),
            });
          }
        }
        // Cascade time/instructor only — each participant keeps its own moto.
        // ENROLLED (non solo ACTIVE): così anche i posti finalizzati di una guida
        // passata (pending_review/completed/no_show) si spostano con la guida,
        // altrimenti in agenda l'orario "non cambia".
        await tx.autoscuolaAppointment.updateMany({
          where: { groupLessonId: gl.id, status: { in: GROUP_LESSON_ENROLLED_STATUSES } },
          data: { startsAt, endsAt, instructorId },
        });
      });

      await invalidateAgendaAndPaymentsCache(companyId);
      return { success: true as const };
    }

    // ---- STANDARD group: single shared vehicle, cascaded to all participants.
    const vehicleId = payload.vehicleId !== undefined ? payload.vehicleId : gl.vehicleId;
    let vehicle: GroupLessonVehicleInfo = null;
    if (vehicleId) {
      const v = await prisma.autoscuolaVehicle.findFirst({
        where: { id: vehicleId, companyId, status: "active" },
        select: { id: true, licenseCategory: true, transmission: true },
      });
      if (!v) return { success: false as const, message: "Veicolo non trovato." };
      // Same rule as creation: a standard group's shared vehicle is a CAR.
      if (payload.vehicleId !== undefined && isMotoLicenseCategory(v.licenseCategory)) {
        return { success: false as const, message: "Per una guida di gruppo in moto usa la modalità Moto." };
      }
      vehicle = v;
    }
    if (vehiclesEnabled && vehicle && studentIds.length) {
      const licenseErr = await validateGroupLessonStudents({ companyId, studentIds, vehicle, vehiclesEnabled });
      if (licenseErr) return { success: false as const, message: licenseErr };
    }

    const overlapErr = await findGroupLessonOverlap({
      companyId, startsAt, endsAt, instructorId,
      vehicleIds: vehicleId ? [vehicleId] : [], studentIds,
      excludeGroupLessonId: gl.id,
    });
    if (overlapErr) return { success: false as const, message: overlapErr };

    await prisma.$transaction([
      prisma.autoscuolaGroupLesson.update({
        where: { id: gl.id },
        data: {
          startsAt, endsAt, instructorId, vehicleId,
          ...(payload.capacity !== undefined ? { capacity: payload.capacity } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
      }),
      // ENROLLED (non solo ACTIVE): sposta anche i posti finalizzati di una guida
      // passata, altrimenti in agenda l'orario "non cambia".
      prisma.autoscuolaAppointment.updateMany({
        where: { groupLessonId: gl.id, status: { in: GROUP_LESSON_ENROLLED_STATUSES } },
        data: { startsAt, endsAt, instructorId, vehicleId },
      }),
    ]);

    await invalidateAgendaAndPaymentsCache(companyId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// Students who CAN be invited to / added to a given group lesson: opted-in,
// not already enrolled, and (when vehicles module on) license-compatible.
export async function listEligibleGroupLessonInvitees(groupLessonId: string) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const gl = await prisma.autoscuolaGroupLesson.findFirst({
      where: { id: groupLessonId, companyId },
      select: {
        id: true, startsAt: true, endsAt: true, kind: true,
        vehicle: { select: { id: true, licenseCategory: true, transmission: true } },
        fleetVehicles: {
          select: { vehicle: { select: { id: true, licenseCategory: true, transmission: true } } },
        },
        appointments: {
          where: { status: { in: GROUP_LESSON_ENROLLED_STATUSES } },
          select: { studentId: true, vehicleId: true },
        },
      },
    });
    if (!gl) return { success: false as const, message: "Guida di gruppo non trovata." };

    const limits = await getCachedCompanyServiceLimits(companyId);
    const vehiclesEnabled = (limits as Record<string, unknown>).vehiclesEnabled !== false;
    const vehicle = gl.vehicle ?? null;
    const enrolled = new Set(gl.appointments.map((a) => a.studentId));
    const isMoto = gl.kind === "moto";
    const fleet: FleetVehicle[] = gl.fleetVehicles.map((f) => f.vehicle);

    const members = await prisma.companyMember.findMany({
      where: { companyId, autoscuolaRole: "STUDENT", groupLessonsOptIn: true },
      select: {
        userId: true,
        licenseCategory: true,
        transmission: true,
        user: { select: { name: true } },
      },
      take: 1000,
    });

    const eligible = members
      .filter((m) => !enrolled.has(m.userId))
      .filter((m) => {
        if (isMoto) {
          // A moto group: eligible iff any fleet moto serves the license
          // (hierarchy-only — participants may share motos in turns).
          return eligibleForMotoGroup({ fleet, student: m });
        }
        return !(vehiclesEnabled && vehicle) || vehicleServesLicense(vehicle!, m);
      })
      .map((m) => ({ id: m.userId, name: m.user?.name ?? null }));

    return { success: true as const, data: eligible };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// Lists opted-in STUDENT members of the company eligible to be PRE-ADDED to a
// brand-new group lesson (used by the web create dialog, where no lesson row
// exists yet). Returns license info so the dialog can re-filter client-side as
// the vehicle changes (mirrors the mobile create flow).
export async function listOptedInGroupLessonStudents() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.role !== "admin" &&
      !isOwner(membership.autoscuolaRole) &&
      !isInstructor(membership.autoscuolaRole)
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const companyId = membership.companyId;

    const members = await prisma.companyMember.findMany({
      where: { companyId, autoscuolaRole: "STUDENT", groupLessonsOptIn: true },
      select: {
        userId: true,
        licenseCategory: true,
        transmission: true,
        user: { select: { name: true } },
      },
      take: 1000,
    });

    const data = members.map((m) => ({
      id: m.userId,
      name: m.user?.name ?? null,
      licenseCategory: m.licenseCategory ?? null,
      transmission: m.transmission ?? null,
    }));

    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Weekly booking limit exemption
// ---------------------------------------------------------------------------

const toggleWeeklyBookingLimitExemptSchema = z.object({
  studentId: z.string().uuid(),
  exempt: z.boolean(),
});

export async function toggleWeeklyBookingLimitExempt(
  input: z.infer<typeof toggleWeeklyBookingLimitExemptSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = toggleWeeklyBookingLimitExemptSchema.parse(input);

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { weeklyBookingLimitExempt: payload.exempt },
    });

    return {
      success: true,
      data: { weeklyBookingLimitExempt: payload.exempt },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Exam priority override
// ---------------------------------------------------------------------------

const setExamPriorityOverrideSchema = z.object({
  studentId: z.string().uuid(),
  override: z.boolean().nullable(),
});

export async function setExamPriorityOverride(
  input: z.infer<typeof setExamPriorityOverrideSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = setExamPriorityOverrideSchema.parse(input);

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: { examPriorityOverride: payload.override },
    });

    return {
      success: true,
      data: { examPriorityOverride: payload.override },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Exam-ready flag ("Pronto per l'esame")
//
// Segnale INTERNO impostato da titolare (web) o istruttore (mobile) sugli allievi
// in fase PRATICA. NON vincolante: non blocca la prenotazione dell'esame né delle
// guide; serve solo a differenziare pronti/non-pronti nei picker di creazione
// esame. Permessi allineati alla POST esame (istruttore + titolare + admin), non
// solo OWNER come i toggle vicini, perché anche l'istruttore da mobile deve poterlo
// impostare. Salviamo anche chi/quando (examReadyBy/At) per le chicche in UI.
// ---------------------------------------------------------------------------

const setStudentExamReadySchema = z.object({
  studentId: z.string().uuid(),
  ready: z.boolean(),
});

export async function setStudentExamReady(
  input: z.infer<typeof setStudentExamReadySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      !isInstructor(membership.autoscuolaRole) &&
      !isOwner(membership.autoscuolaRole) &&
      membership.role !== "admin"
    ) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = setStudentExamReadySchema.parse(input);

    const examReadyAt = payload.ready ? new Date() : null;
    const examReadyBy = payload.ready ? membership.userId : null;

    await prisma.companyMember.updateMany({
      where: {
        companyId: membership.companyId,
        userId: payload.studentId,
        autoscuolaRole: "STUDENT",
      },
      data: {
        examReady: payload.ready,
        examReadyAt,
        examReadyBy,
      },
    });

    return {
      success: true,
      data: {
        examReady: payload.ready,
        examReadyAt: examReadyAt ? examReadyAt.toISOString() : null,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Manual payment tracking
// ---------------------------------------------------------------------------

const setManualPaymentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(["unpaid", "paid"]).nullable(),
});

export async function setManualPaymentStatus(
  input: z.infer<typeof setManualPaymentStatusSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = setManualPaymentStatusSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: payload.appointmentId, companyId: membership.companyId },
      select: { id: true, paymentRequired: true, manualPaymentStatus: true },
    });
    if (!appointment) {
      return { success: false, message: "Appuntamento non trovato." };
    }
    // Block manual marking ONLY for true automatic (Stripe) payments — those have
    // paymentRequired=true AND no manual status, and are settled in the Pagamenti
    // section. Group lessons are "da pagare" manually (paymentRequired=true but
    // manualPaymentStatus set), so they must be markable here.
    if (appointment.paymentRequired && appointment.manualPaymentStatus == null) {
      return {
        success: false,
        message:
          "Questo appuntamento usa pagamenti automatici. Usa la sezione Pagamenti.",
      };
    }

    await prisma.autoscuolaAppointment.update({
      where: { id: payload.appointmentId },
      data: { manualPaymentStatus: payload.status },
    });

    return {
      success: true,
      data: { manualPaymentStatus: payload.status },
      message:
        payload.status === "paid"
          ? "Guida segnata come pagata."
          : payload.status === "unpaid"
            ? "Guida segnata come da pagare."
            : "Stato pagamento rimosso.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * "Copri con credito" dal dettaglio allievo: applica un credito guida a una guida
 * NON ancora coperta (tipicamente una guida di gruppo, che nasce `paymentRequired`
 * e non consuma credito alla prenotazione). Consuma 1 credito e marca la guida come
 * coperta (`creditApplied=true`, azzera lo stato pagamento manuale). Atomico.
 * L'alternativa resta "Segna pagata".
 */
export async function coverAppointmentWithLessonCredit(input: { appointmentId: string }) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const { appointmentId } = z
      .object({ appointmentId: z.string().uuid() })
      .parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: appointmentId, companyId: membership.companyId },
      select: {
        id: true,
        studentId: true,
        creditApplied: true,
        manualPaymentStatus: true,
        type: true,
      },
    });
    if (!appointment) {
      return { success: false, message: "Guida non trovata." };
    }
    if (appointment.type === "esame") {
      return { success: false, message: "Gli esami non usano i crediti guida." };
    }
    if (appointment.creditApplied) {
      return { success: false, message: "Questa guida è già coperta da un credito." };
    }
    if (appointment.manualPaymentStatus === "paid") {
      return { success: false, message: "Questa guida è già segnata come pagata." };
    }
    if (!appointment.studentId) {
      return { success: false, message: "Guida senza allievo." };
    }

    const config = await getAutoscuolaPaymentConfig({ companyId: membership.companyId });
    if (!config.lessonCreditFlowEnabled) {
      return {
        success: false,
        message: "I crediti guida non sono attivi per questa autoscuola.",
      };
    }

    const studentId = appointment.studentId;
    const applied = await prisma.$transaction(async (tx) => {
      const adjustment = await adjustStudentLessonCredits({
        prisma: tx as never,
        companyId: membership.companyId,
        studentId,
        delta: -1,
        reason: "booking_consume",
        actorUserId: membership.userId,
        appointmentId: appointment.id,
      });
      if (adjustment.appliedDelta === 0) return false;
      await tx.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: { creditApplied: true, manualPaymentStatus: null },
      });
      return true;
    });

    if (!applied) {
      return { success: false, message: "L'allievo non ha crediti disponibili." };
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);
    return { success: true, message: "Guida coperta da un credito." };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Payment mode helper
// ---------------------------------------------------------------------------

export async function getPaymentMode() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const config = await getAutoscuolaPaymentConfig({
      companyId: membership.companyId,
    });
    return {
      success: true,
      data: {
        autoPaymentsEnabled: config.enabled,
        lessonCreditFlowEnabled: config.lessonCreditFlowEnabled,
        lessonCreditsRequired: config.lessonCreditsRequired,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Late cancellations
// ---------------------------------------------------------------------------

export async function getLateCancellations() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    const cancellations = await prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        startsAt: Date;
        cancelledAt: Date | null;
        createdAt: Date;
        penaltyCutoffAt: Date | null;
        studentId: string;
        studentName: string | null;
        instructorName: string | null;
        type: string;
        endsAt: Date | null;
        creditApplied: boolean;
      }>
    >`
      SELECT
        a.id,
        a.status,
        a."startsAt",
        a."cancelledAt",
        a."createdAt",
        a."penaltyCutoffAt",
        a."studentId",
        u.name AS "studentName",
        i.name AS "instructorName",
        a.type,
        a."endsAt",
        a."creditApplied"
      FROM "AutoscuolaAppointment" a
      JOIN "User" u ON u.id = a."studentId"
      LEFT JOIN "AutoscuolaInstructor" i ON i.id = a."instructorId"
      WHERE a."companyId" = ${companyId}::uuid
        AND a."lateCancellationAction" IS NULL
        AND (
          -- Late cancellations
          (a.status = 'cancelled'
           AND a."cancelledAt" IS NOT NULL
           AND a."penaltyCutoffAt" IS NOT NULL
           AND a."cancelledAt" > a."penaltyCutoffAt"
           AND a."cancellationKind" = 'manual_cancel')
          OR
          -- No-shows
          (a.status = 'no_show')
        )
      ORDER BY COALESCE(a."cancelledAt", a."startsAt") DESC
      LIMIT 200
    `;

    // Compute per-student late cancellation count (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const studentIds = [...new Set(cancellations.map((c) => c.studentId))];
    const lateCounts = new Map<string, number>();
    if (studentIds.length) {
      const counts = await prisma.$queryRaw<
        Array<{ studentId: string; cnt: bigint }>
      >`
        SELECT a."studentId", COUNT(*)::bigint AS cnt
        FROM "AutoscuolaAppointment" a
        WHERE a."companyId" = ${companyId}::uuid
          AND a."studentId" = ANY(${studentIds}::uuid[])
          AND (
            (a.status = 'cancelled'
             AND a."cancelledAt" IS NOT NULL
             AND a."penaltyCutoffAt" IS NOT NULL
             AND a."cancelledAt" > a."penaltyCutoffAt"
             AND a."cancellationKind" = 'manual_cancel'
             AND a."cancelledAt" >= ${fourWeeksAgo})
            OR
            (a.status = 'no_show'
             AND a."startsAt" >= ${fourWeeksAgo})
          )
        GROUP BY a."studentId"
      `;
      for (const row of counts) {
        lateCounts.set(row.studentId, Number(row.cnt));
      }
    }

    const config = await getAutoscuolaPaymentConfig({ companyId });

    const data = cancellations.map((c) => {
      const isNoShow = c.status === "no_show";
      const startsAt = new Date(c.startsAt);
      const cancelledAt = c.cancelledAt ? new Date(c.cancelledAt) : null;
      const endsAt = c.endsAt ? new Date(c.endsAt) : new Date(startsAt.getTime() + 30 * 60 * 1000);
      const durationMinutes = Math.max(
        30,
        Math.round((endsAt.getTime() - startsAt.getTime()) / 60000),
      );
      const timeDeltaMinutes = cancelledAt
        ? Math.round((startsAt.getTime() - cancelledAt.getTime()) / 60000)
        : null;
      return {
        id: c.id,
        kind: isNoShow ? ("no_show" as const) : ("late_cancellation" as const),
        startsAt: c.startsAt,
        cancelledAt: c.cancelledAt,
        createdAt: c.createdAt,
        timeDeltaMinutes,
        penaltyCutoffHours: config.penaltyCutoffHours,
        studentName: c.studentName,
        studentId: c.studentId,
        instructorName: c.instructorName,
        lessonType: c.type,
        durationMinutes,
        studentLateCancellationsCount: lateCounts.get(c.studentId) ?? 0,
        creditApplied: c.creditApplied,
      };
    });

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Resolve late cancellation
// ---------------------------------------------------------------------------

const resolveLateCancellationSchema = z.object({
  appointmentId: z.string().uuid(),
  action: z.enum(["charge", "dismiss"]),
});

export async function resolveLateCancellation(
  input: z.infer<typeof resolveLateCancellationSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageStudentCredits(membership)) {
      return { success: false, message: "Operazione non consentita." };
    }
    const payload = resolveLateCancellationSchema.parse(input);

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: {
        id: payload.appointmentId,
        companyId: membership.companyId,
        status: { in: ["cancelled", "no_show"] },
        lateCancellationAction: null,
      },
      select: {
        id: true,
        studentId: true,
        creditApplied: true,
        creditRefundedAt: true,
      },
    });
    if (!appointment) {
      return { success: false, message: "Cancellazione non trovata o già gestita." };
    }

    if (payload.action === "dismiss") {
      // Se la guida era coperta da un credito (scalato alla prenotazione) e il
      // credito NON è ancora stato reso, "Non addebitare / Restituisci il credito"
      // deve RIDARLO davvero all'allievo (+1). Prima veniva solo archiviata e il
      // credito restava perso → i due CTA erano di fatto identici.
      const refundCredit =
        !!appointment.studentId &&
        appointment.creditApplied &&
        appointment.creditRefundedAt === null;
      if (refundCredit) {
        await adjustStudentLessonCredits({
          companyId: membership.companyId,
          studentId: appointment.studentId!,
          delta: 1,
          reason: "cancel_refund",
          actorUserId: membership.userId,
          appointmentId: appointment.id,
        });
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { lateCancellationAction: "dismissed", creditRefundedAt: new Date() },
        });
      } else {
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { lateCancellationAction: "dismissed" },
        });
      }
      await invalidateAgendaAndPaymentsCache(membership.companyId);
      return {
        success: true,
        data: { action: "dismissed" },
        message: refundCredit
          ? "Credito restituito all'allievo."
          : "Cancellazione tardiva archiviata senza addebito.",
      };
    }

    // action === "charge"
    const config = await getAutoscuolaPaymentConfig({
      companyId: membership.companyId,
    });

    if (config.enabled) {
      // TODO: implementare addebito Stripe per cancellazioni tardive
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: { lateCancellationAction: "charged" },
      });
    } else if (config.lessonCreditFlowEnabled) {
      // Credit flow: re-deduct 1 credit if it was refunded
      if (
        appointment.studentId &&
        appointment.creditApplied &&
        appointment.creditRefundedAt !== null
      ) {
        await adjustStudentLessonCredits({
          companyId: membership.companyId,
          studentId: appointment.studentId,
          delta: -1,
          reason: "manual_revoke",
          actorUserId: membership.userId,
          appointmentId: appointment.id,
        });
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { lateCancellationAction: "charged" },
        });
      } else if (!appointment.creditApplied) {
        // Optional credits flow: try to consume a credit for this late cancellation
        const applied = await applyLessonCreditToExistingAppointment({
          appointmentId: appointment.id,
          actorUserId: membership.userId,
        });
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: {
            lateCancellationAction: "charged",
            ...(applied.applied ? {} : { manualPaymentStatus: "unpaid" }),
          },
        });
      } else {
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { lateCancellationAction: "charged" },
        });
      }
    } else {
      // Manual mode: mark as unpaid for the student
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          lateCancellationAction: "charged",
          manualPaymentStatus: "unpaid",
        },
      });
    }

    await invalidateAgendaAndPaymentsCache(membership.companyId);

    return {
      success: true,
      data: { action: "charged" },
      message: "Cancellazione tardiva addebitata.",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getStudentsCompletedDrivingMinutes() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;

    // Get all completed (non-cancelled) appointments for this company
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        status: { in: ["completed", "checked_in"] },
        type: { not: "esame" },
      },
      select: {
        studentId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    // Aggregate minutes per student
    const minutesByStudent: Record<string, number> = {};
    for (const appt of appointments) {
      if (!appt.studentId) continue; // skip studentless exam placeholders
      const start = appt.startsAt.getTime();
      const end = appt.endsAt
        ? appt.endsAt.getTime()
        : start + 60 * 60 * 1000;
      const minutes = Math.round((end - start) / 60000);
      minutesByStudent[appt.studentId] =
        (minutesByStudent[appt.studentId] ?? 0) + minutes;
    }

    return { success: true, data: minutesByStudent };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Instructor driving hours ──────────────────────────────────────────────────

type InstructorHoursDayBreakdown = {
  date: string;
  dayLabel: string;
  totalMinutes: number;
  outsideWorkingHoursMinutes: number;
  appointmentCount: number;
  // Ore di lezione teorica (block `theory_lesson`) — categoria SEPARATA, NON
  // conteggiata in totalMinutes (che resta solo guide).
  theoryMinutes: number;
};

export type InstructorHoursEntry = {
  instructorId: string;
  instructorName: string;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  weekly: {
    totalMinutes: number;
    outsideWorkingHoursMinutes: number;
    lateCancellationMinutes: number;
    theoryMinutes: number;
    byDay: InstructorHoursDayBreakdown[];
  };
  monthly: {
    monthLabel: string;
    totalMinutes: number;
    outsideWorkingHoursMinutes: number;
    lateCancellationMinutes: number;
    theoryMinutes: number;
  };
};

// Range-based reporting (mobile period selector). Buckets are days (span ≤ 14)
// or Mon–Sun weeks (longer spans).
export type InstructorHoursBucket = {
  key: string;
  label: string;
  startDate: string; // ISO YYYY-MM-DD (day, or week Monday)
  totalMinutes: number;
  outsideWorkingHoursMinutes: number;
  appointmentCount: number;
  theoryMinutes: number; // ore di lezione teorica, categoria separata
};

export type InstructorHoursRange = {
  instructorId: string;
  instructorName: string;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  rangeStart: string; // ISO YYYY-MM-DD (inclusive)
  rangeEnd: string; // ISO YYYY-MM-DD (inclusive)
  granularity: "day" | "week";
  total: { totalMinutes: number; outsideWorkingHoursMinutes: number; appointmentCount: number; theoryMinutes: number };
  buckets: InstructorHoursBucket[];
};

const ITALY_DAY_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const ITALY_MONTH_LABELS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function toItalyDate(date: Date): { year: number; month: number; day: number; dayOfWeek: number; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    dayOfWeek: dayMap[get("weekday")] ?? 0,
    minuteOfDay: parseInt(get("hour")) * 60 + parseInt(get("minute")),
  };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function computeOutsideMinutes(
  startDate: Date,
  endDate: Date,
  whStart: string | undefined,
  whEnd: string | undefined,
): number {
  if (!whStart || !whEnd) return 0;
  const whStartMin = hhmmToMinutes(whStart);
  const whEndMin = hhmmToMinutes(whEnd);
  if (whStartMin >= whEndMin) return 0;

  const s = toItalyDate(startDate);
  const e = toItalyDate(endDate);
  const apptStartMin = s.minuteOfDay;
  const apptEndMin = e.minuteOfDay;

  // Clamp the working-hours window against the appointment
  const overlapStart = Math.max(apptStartMin, whStartMin);
  const overlapEnd = Math.min(apptEndMin, whEndMin);
  const insideMinutes = Math.max(0, overlapEnd - overlapStart);
  const totalMinutes = Math.max(0, apptEndMin - apptStartMin);
  return Math.max(0, totalMinutes - insideMinutes);
}

export async function getInstructorDrivingHours(input: {
  instructorId?: string;
  weekStart: string;
  monthStart?: string;
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const role = membership.autoscuolaRole;
    const isOwnerOrAdmin = membership.role === "admin" || isOwner(role);
    const isSelfInstructor = isInstructor(role);

    // Resolve target instructors
    let targetInstructors: { id: string; name: string; settings: unknown }[];
    if (input.instructorId) {
      // Specific instructor requested
      if (!isOwnerOrAdmin) {
        // Instructor can only see own hours
        const own = await prisma.autoscuolaInstructor.findFirst({
          where: { companyId, userId: membership.userId, status: "active" },
          select: { id: true, name: true, settings: true },
        });
        if (!own || own.id !== input.instructorId) {
          return { success: false, message: "Non autorizzato." };
        }
        targetInstructors = [own];
      } else {
        const instr = await prisma.autoscuolaInstructor.findFirst({
          where: { companyId, id: input.instructorId },
          select: { id: true, name: true, settings: true },
        });
        if (!instr) return { success: false, message: "Istruttore non trovato." };
        targetInstructors = [instr];
      }
    } else if (isOwnerOrAdmin) {
      targetInstructors = await prisma.autoscuolaInstructor.findMany({
        where: {
          companyId,
          status: "active",
          userId: { not: null },
          user: {
            companyMembers: {
              some: { companyId, autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
            },
          },
        },
        select: { id: true, name: true, settings: true },
        orderBy: { name: "asc" },
      });
    } else if (isSelfInstructor) {
      const own = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId: membership.userId, status: "active" },
        select: { id: true, name: true, settings: true },
      });
      if (!own) return { success: false, message: "Istruttore non trovato." };
      targetInstructors = [own];
    } else {
      return { success: false, message: "Non autorizzato." };
    }

    if (!targetInstructors.length) {
      return { success: true, data: [] as InstructorHoursEntry[] };
    }

    // Parse date ranges
    const weekStartDate = new Date(input.weekStart + "T00:00:00Z");
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const monthStartStr = input.monthStart ?? input.weekStart.slice(0, 7) + "-01";
    const monthStartDate = new Date(monthStartStr + "T00:00:00Z");
    const monthEndDate = new Date(monthStartDate);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);

    // Combined range (min/max of week and month)
    const rangeStart = new Date(Math.min(weekStartDate.getTime(), monthStartDate.getTime()));
    const rangeEnd = new Date(Math.max(weekEndDate.getTime(), monthEndDate.getTime()));

    const instructorIds = targetInstructors.map((i) => i.id);

    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        instructorId: { in: instructorIds },
        status: { in: ["completed", "checked_in", "no_show"] },
        type: { not: "esame" },
        startsAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        instructorId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    // Lezioni teoriche (block `theory_lesson`) nello stesso range — categoria
    // separata, NON sommata alle ore di guida.
    const theoryBlocks = await prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId,
        instructorId: { in: instructorIds },
        reason: "theory_lesson",
        startsAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: { instructorId: true, startsAt: true, endsAt: true },
    });

    // Late cancellations: status = 'cancelled' AND cancelledAt > penaltyCutoffAt
    // AND cancellationKind = 'manual_cancel'. We fetch all candidates and then
    // filter in JS because Prisma's `where` cannot compare two fields directly.
    const lateCancelledCandidates = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        instructorId: { in: instructorIds },
        status: "cancelled",
        type: { not: "esame" },
        startsAt: { gte: rangeStart, lt: rangeEnd },
        cancelledAt: { not: null },
        penaltyCutoffAt: { not: null },
        cancellationKind: "manual_cancel",
      },
      select: {
        instructorId: true,
        startsAt: true,
        endsAt: true,
        cancelledAt: true,
        penaltyCutoffAt: true,
      },
    });
    const lateCancelledAppointments = lateCancelledCandidates.filter(
      (a) =>
        a.cancelledAt != null &&
        a.penaltyCutoffAt != null &&
        a.cancelledAt.getTime() > a.penaltyCutoffAt.getTime(),
    );

    // Build settings map
    const settingsMap = new Map<string, ReturnType<typeof parseInstructorSettings>>();
    for (const instr of targetInstructors) {
      settingsMap.set(instr.id, parseInstructorSettings(instr.settings));
    }

    // Build result per instructor
    const results: InstructorHoursEntry[] = targetInstructors.map((instr) => {
      const settings = settingsMap.get(instr.id)!;
      const instrAppts = appointments.filter((a) => a.instructorId === instr.id);
      const instrLateAppts = lateCancelledAppointments.filter(
        (a) => a.instructorId === instr.id,
      );
      const instrTheory = theoryBlocks.filter((b) => b.instructorId === instr.id);
      const blockMinutes = (b: { startsAt: Date; endsAt: Date }) =>
        Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);

      // Late cancellation totals (weekly + monthly)
      let weeklyLateCancellationMin = 0;
      let monthlyLateCancellationMin = 0;
      for (const appt of instrLateAppts) {
        const start = appt.startsAt.getTime();
        const end = appt.endsAt ? appt.endsAt.getTime() : start + 60 * 60 * 1000;
        const mins = Math.round((end - start) / 60000);
        if (appt.startsAt >= weekStartDate && appt.startsAt < weekEndDate) {
          weeklyLateCancellationMin += mins;
        }
        if (appt.startsAt >= monthStartDate && appt.startsAt < monthEndDate) {
          monthlyLateCancellationMin += mins;
        }
      }

      // Weekly breakdown by day
      const weekDays: InstructorHoursDayBreakdown[] = [];
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(weekStartDate.getTime() + d * 24 * 60 * 60 * 1000);
        const dateStr = dayDate.toISOString().slice(0, 10);
        const nextDay = new Date(dayDate.getTime() + 24 * 60 * 60 * 1000);
        const dayAppts = instrAppts.filter((a) => a.startsAt >= dayDate && a.startsAt < nextDay);
        let dayTotalMin = 0;
        let dayOutsideMin = 0;
        for (const appt of dayAppts) {
          const start = appt.startsAt.getTime();
          const end = appt.endsAt ? appt.endsAt.getTime() : start + 60 * 60 * 1000;
          const mins = Math.round((end - start) / 60000);
          dayTotalMin += mins;
          dayOutsideMin += computeOutsideMinutes(
            appt.startsAt,
            appt.endsAt ?? new Date(start + 60 * 60 * 1000),
            settings.workingHoursStart,
            settings.workingHoursEnd,
          );
        }
        const dayTheoryMin = instrTheory
          .filter((b) => b.startsAt >= dayDate && b.startsAt < nextDay)
          .reduce((s, b) => s + blockMinutes(b), 0);
        const dow = (dayDate.getUTCDay());
        weekDays.push({
          date: dateStr,
          dayLabel: ITALY_DAY_LABELS[dow],
          totalMinutes: dayTotalMin,
          outsideWorkingHoursMinutes: Math.round(dayOutsideMin),
          appointmentCount: dayAppts.length,
          theoryMinutes: dayTheoryMin,
        });
      }

      const weeklyTotal = weekDays.reduce((s, d) => s + d.totalMinutes, 0);
      const weeklyOutside = weekDays.reduce((s, d) => s + d.outsideWorkingHoursMinutes, 0);
      const weeklyTheory = weekDays.reduce((s, d) => s + d.theoryMinutes, 0);

      // Monthly totals
      const monthAppts = instrAppts.filter((a) => a.startsAt >= monthStartDate && a.startsAt < monthEndDate);
      let monthTotal = 0;
      let monthOutside = 0;
      for (const appt of monthAppts) {
        const start = appt.startsAt.getTime();
        const end = appt.endsAt ? appt.endsAt.getTime() : start + 60 * 60 * 1000;
        monthTotal += Math.round((end - start) / 60000);
        monthOutside += computeOutsideMinutes(
          appt.startsAt,
          appt.endsAt ?? new Date(start + 60 * 60 * 1000),
          settings.workingHoursStart,
          settings.workingHoursEnd,
        );
      }
      const monthTheory = instrTheory
        .filter((b) => b.startsAt >= monthStartDate && b.startsAt < monthEndDate)
        .reduce((s, b) => s + blockMinutes(b), 0);

      const monthLabel = `${ITALY_MONTH_LABELS[monthStartDate.getUTCMonth()]} ${monthStartDate.getUTCFullYear()}`;

      return {
        instructorId: instr.id,
        instructorName: instr.name,
        workingHoursStart: settings.workingHoursStart ?? null,
        workingHoursEnd: settings.workingHoursEnd ?? null,
        weekly: {
          totalMinutes: weeklyTotal,
          outsideWorkingHoursMinutes: weeklyOutside,
          lateCancellationMinutes: weeklyLateCancellationMin,
          theoryMinutes: weeklyTheory,
          byDay: weekDays,
        },
        monthly: {
          monthLabel,
          totalMinutes: monthTotal,
          outsideWorkingHoursMinutes: Math.round(monthOutside),
          lateCancellationMinutes: monthlyLateCancellationMin,
          theoryMinutes: monthTheory,
        },
      };
    });

    return { success: true, data: results };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getInstructorDrivingHoursRange(input: {
  instructorId?: string;
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const companyId = membership.companyId;
    const role = membership.autoscuolaRole;
    const isOwnerOrAdmin = membership.role === "admin" || isOwner(role);
    const isSelfInstructor = isInstructor(role);

    // Resolve target instructors (mirrors getInstructorDrivingHours).
    let targetInstructors: { id: string; name: string; settings: unknown }[];
    if (input.instructorId) {
      if (!isOwnerOrAdmin) {
        const own = await prisma.autoscuolaInstructor.findFirst({
          where: { companyId, userId: membership.userId, status: "active" },
          select: { id: true, name: true, settings: true },
        });
        if (!own || own.id !== input.instructorId) {
          return { success: false, message: "Non autorizzato." };
        }
        targetInstructors = [own];
      } else {
        const instr = await prisma.autoscuolaInstructor.findFirst({
          where: { companyId, id: input.instructorId },
          select: { id: true, name: true, settings: true },
        });
        if (!instr) return { success: false, message: "Istruttore non trovato." };
        targetInstructors = [instr];
      }
    } else if (isOwnerOrAdmin) {
      targetInstructors = await prisma.autoscuolaInstructor.findMany({
        where: {
          companyId,
          status: "active",
          userId: { not: null },
          user: {
            companyMembers: {
              some: { companyId, autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
            },
          },
        },
        select: { id: true, name: true, settings: true },
        orderBy: { name: "asc" },
      });
    } else if (isSelfInstructor) {
      const own = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId: membership.userId, status: "active" },
        select: { id: true, name: true, settings: true },
      });
      if (!own) return { success: false, message: "Istruttore non trovato." };
      targetInstructors = [own];
    } else {
      return { success: false, message: "Non autorizzato." };
    }

    if (!targetInstructors.length) {
      return { success: true, data: [] as InstructorHoursRange[] };
    }

    // Range [from 00:00, to+1 00:00) in UTC; granularity by span.
    const rangeStartDate = new Date(input.from + "T00:00:00Z");
    const rangeEndExclusive = new Date(new Date(input.to + "T00:00:00Z").getTime() + DAY_MS);
    const spanDays = Math.round((rangeEndExclusive.getTime() - rangeStartDate.getTime()) / DAY_MS);
    const granularity: "day" | "week" = spanDays <= 14 ? "day" : "week";

    const instructorIds = targetInstructors.map((i) => i.id);
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        instructorId: { in: instructorIds },
        status: { in: ["completed", "checked_in", "no_show"] },
        type: { not: "esame" },
        startsAt: { gte: rangeStartDate, lt: rangeEndExclusive },
      },
      select: { instructorId: true, startsAt: true, endsAt: true },
    });

    // Lezioni teoriche nello stesso range — categoria separata.
    const theoryBlocks = await prisma.autoscuolaInstructorBlock.findMany({
      where: {
        companyId,
        instructorId: { in: instructorIds },
        reason: "theory_lesson",
        startsAt: { gte: rangeStartDate, lt: rangeEndExclusive },
      },
      select: { instructorId: true, startsAt: true, endsAt: true },
    });

    const settingsMap = new Map<string, ReturnType<typeof parseInstructorSettings>>();
    for (const instr of targetInstructors) {
      settingsMap.set(instr.id, parseInstructorSettings(instr.settings));
    }

    const sumTheory = (blocks: { startsAt: Date; endsAt: Date }[]) =>
      blocks.reduce((s, b) => s + Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000), 0);

    const sumAppts = (
      appts: { startsAt: Date; endsAt: Date | null }[],
      settings: ReturnType<typeof parseInstructorSettings>,
    ) => {
      let total = 0;
      let outside = 0;
      for (const appt of appts) {
        const start = appt.startsAt.getTime();
        const end = appt.endsAt ? appt.endsAt.getTime() : start + 60 * 60 * 1000;
        total += Math.round((end - start) / 60000);
        outside += computeOutsideMinutes(
          appt.startsAt,
          appt.endsAt ?? new Date(start + 60 * 60 * 1000),
          settings.workingHoursStart,
          settings.workingHoursEnd,
        );
      }
      return { total, outside: Math.round(outside) };
    };

    const results: InstructorHoursRange[] = targetInstructors.map((instr) => {
      const settings = settingsMap.get(instr.id)!;
      const instrAppts = appointments.filter((a) => a.instructorId === instr.id);
      const instrTheory = theoryBlocks.filter((b) => b.instructorId === instr.id);
      const buckets: InstructorHoursBucket[] = [];

      if (granularity === "day") {
        for (let t = rangeStartDate.getTime(); t < rangeEndExclusive.getTime(); t += DAY_MS) {
          const dayDate = new Date(t);
          const nextDay = new Date(t + DAY_MS);
          const dayAppts = instrAppts.filter((a) => a.startsAt >= dayDate && a.startsAt < nextDay);
          const { total, outside } = sumAppts(dayAppts, settings);
          const dateStr = dayDate.toISOString().slice(0, 10);
          buckets.push({
            key: dateStr,
            label: ITALY_DAY_LABELS[dayDate.getUTCDay()],
            startDate: dateStr,
            totalMinutes: total,
            outsideWorkingHoursMinutes: outside,
            appointmentCount: dayAppts.length,
            theoryMinutes: sumTheory(instrTheory.filter((b) => b.startsAt >= dayDate && b.startsAt < nextDay)),
          });
        }
      } else {
        // Mon–Sun weeks covering the range.
        const firstMonday = new Date(rangeStartDate);
        const dow = firstMonday.getUTCDay();
        firstMonday.setUTCDate(firstMonday.getUTCDate() - (dow === 0 ? 6 : dow - 1));
        for (let ws = firstMonday.getTime(); ws < rangeEndExclusive.getTime(); ws += 7 * DAY_MS) {
          const weekStartD = new Date(ws);
          const weekEndD = new Date(ws + 7 * DAY_MS);
          const wAppts = instrAppts.filter((a) => a.startsAt >= weekStartD && a.startsAt < weekEndD);
          const { total, outside } = sumAppts(wAppts, settings);
          const startStr = weekStartD.toISOString().slice(0, 10);
          buckets.push({
            key: startStr,
            label: `${weekStartD.getUTCDate()} ${ITALY_MONTH_LABELS[weekStartD.getUTCMonth()].slice(0, 3).toLowerCase()}`,
            startDate: startStr,
            totalMinutes: total,
            outsideWorkingHoursMinutes: outside,
            appointmentCount: wAppts.length,
            theoryMinutes: sumTheory(instrTheory.filter((b) => b.startsAt >= weekStartD && b.startsAt < weekEndD)),
          });
        }
      }

      return {
        instructorId: instr.id,
        instructorName: instr.name,
        workingHoursStart: settings.workingHoursStart ?? null,
        workingHoursEnd: settings.workingHoursEnd ?? null,
        rangeStart: input.from,
        rangeEnd: input.to,
        granularity,
        total: {
          totalMinutes: buckets.reduce((s, b) => s + b.totalMinutes, 0),
          outsideWorkingHoursMinutes: buckets.reduce((s, b) => s + b.outsideWorkingHoursMinutes, 0),
          appointmentCount: buckets.reduce((s, b) => s + b.appointmentCount, 0),
          theoryMinutes: buckets.reduce((s, b) => s + b.theoryMinutes, 0),
        },
        buckets,
      };
    });

    return { success: true, data: results };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
