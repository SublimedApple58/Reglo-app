import { prisma } from "@/db/prisma";
import { normalizeBookingSlotDurations } from "@/lib/autoscuole/lesson-policy";
import type {
  AppBookingActors,
  InstructorBookingMode,
  StudentBookingMode,
} from "@/lib/autoscuole/booking-governance";
import {
  APP_BOOKING_ACTOR_OPTIONS,
  INSTRUCTOR_BOOKING_MODE_OPTIONS,
  STUDENT_BOOKING_MODE_OPTIONS,
  DEFAULT_APP_BOOKING_ACTORS,
  DEFAULT_INSTRUCTOR_BOOKING_MODE,
  DEFAULT_STUDENT_BOOKING_MODE,
} from "@/lib/autoscuole/booking-governance";

export type InstructorSettings = {
  bookingSlotDurations?: number[];
  roundedHoursOnly?: boolean;
  // Governance prenotazione
  appBookingActors?: AppBookingActors;
  instructorBookingMode?: InstructorBookingMode;
  studentBookingMode?: StudentBookingMode;
  // Scambio guide
  swapEnabled?: boolean;
  swapNotifyMode?: "all" | "available_only";
  // Cutoff prenotazione
  bookingCutoffEnabled?: boolean;
  bookingCutoffTime?: string;
  // Limite settimanale
  weeklyBookingLimitEnabled?: boolean;
  weeklyBookingLimit?: number;
  // Notifiche slot vuoti
  emptySlotNotificationEnabled?: boolean;
  emptySlotNotificationTarget?: "all" | "availability_matching";
  emptySlotNotificationTimes?: string[];
  // Fascia oraria ristretta (Task 6)
  restrictedTimeRangeEnabled?: boolean;
  restrictedTimeRangeStart?: string;
  restrictedTimeRangeEnd?: string;
  // Assenza settimanale (Task 8)
  weeklyAbsenceEnabled?: boolean;
};

export type EffectiveBookingSettings = {
  bookingSlotDurations: number[];
  roundedHoursOnly: boolean;
  assignedInstructorId: string | null;
  assignedInstructorName: string | null;
  assignedInstructorPhone: string | null;
  isLockedToInstructor: boolean;
  // Governance prenotazione
  appBookingActors: AppBookingActors;
  instructorBookingMode: InstructorBookingMode;
  studentBookingMode: StudentBookingMode;
  // Scambio guide
  swapEnabled: boolean;
  swapNotifyMode: "all" | "available_only";
  // Cutoff prenotazione
  bookingCutoffEnabled: boolean;
  bookingCutoffTime: string;
  // Limite settimanale
  weeklyBookingLimitEnabled: boolean;
  weeklyBookingLimit: number;
  // Notifiche slot vuoti
  emptySlotNotificationEnabled: boolean;
  emptySlotNotificationTarget: "all" | "availability_matching";
  emptySlotNotificationTimes: string[];
  // Fascia oraria ristretta (Task 6)
  restrictedTimeRangeEnabled: boolean;
  restrictedTimeRangeStart: string;
  restrictedTimeRangeEnd: string;
  // Assenza settimanale (Task 8)
  weeklyAbsenceEnabled: boolean;
};

export async function isInstructorClustersEnabled(
  _companyId: string,
): Promise<boolean> {
  // Always enabled — the per-instructor `autonomousMode` flag is the real gate.
  return true;
}

const SWAP_NOTIFY_MODES = new Set(["all", "available_only"]);
const EMPTY_SLOT_TARGETS = new Set(["all", "availability_matching"]);
const BOOKING_CUTOFF_TIME_RE = /^\d{2}:\d{2}$/;
const HH_MM_RE = /^\d{2}:\d{2}$/;

export function parseInstructorSettings(raw: unknown): InstructorSettings {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const result: InstructorSettings = {};

  if (Array.isArray(obj.bookingSlotDurations)) {
    const durations = normalizeBookingSlotDurations(obj.bookingSlotDurations);
    if (durations.length) result.bookingSlotDurations = durations;
  }

  if (typeof obj.roundedHoursOnly === "boolean") {
    result.roundedHoursOnly = obj.roundedHoursOnly;
  }

  // Governance prenotazione
  if (typeof obj.appBookingActors === "string" && (APP_BOOKING_ACTOR_OPTIONS as readonly string[]).includes(obj.appBookingActors)) {
    result.appBookingActors = obj.appBookingActors as AppBookingActors;
  }
  if (typeof obj.instructorBookingMode === "string" && (INSTRUCTOR_BOOKING_MODE_OPTIONS as readonly string[]).includes(obj.instructorBookingMode)) {
    result.instructorBookingMode = obj.instructorBookingMode as InstructorBookingMode;
  }
  if (typeof obj.studentBookingMode === "string" && (STUDENT_BOOKING_MODE_OPTIONS as readonly string[]).includes(obj.studentBookingMode)) {
    result.studentBookingMode = obj.studentBookingMode as StudentBookingMode;
  }

  // Scambio guide
  if (typeof obj.swapEnabled === "boolean") result.swapEnabled = obj.swapEnabled;
  if (typeof obj.swapNotifyMode === "string" && SWAP_NOTIFY_MODES.has(obj.swapNotifyMode)) {
    result.swapNotifyMode = obj.swapNotifyMode as "all" | "available_only";
  }

  // Cutoff prenotazione
  if (typeof obj.bookingCutoffEnabled === "boolean") result.bookingCutoffEnabled = obj.bookingCutoffEnabled;
  if (typeof obj.bookingCutoffTime === "string" && BOOKING_CUTOFF_TIME_RE.test(obj.bookingCutoffTime)) {
    result.bookingCutoffTime = obj.bookingCutoffTime;
  }

  // Limite settimanale
  if (typeof obj.weeklyBookingLimitEnabled === "boolean") result.weeklyBookingLimitEnabled = obj.weeklyBookingLimitEnabled;
  if (typeof obj.weeklyBookingLimit === "number" && Number.isInteger(obj.weeklyBookingLimit) && obj.weeklyBookingLimit >= 1 && obj.weeklyBookingLimit <= 50) {
    result.weeklyBookingLimit = obj.weeklyBookingLimit;
  }

  // Notifiche slot vuoti
  if (typeof obj.emptySlotNotificationEnabled === "boolean") result.emptySlotNotificationEnabled = obj.emptySlotNotificationEnabled;
  if (typeof obj.emptySlotNotificationTarget === "string" && EMPTY_SLOT_TARGETS.has(obj.emptySlotNotificationTarget)) {
    result.emptySlotNotificationTarget = obj.emptySlotNotificationTarget as "all" | "availability_matching";
  }
  if (Array.isArray(obj.emptySlotNotificationTimes)) {
    const times = obj.emptySlotNotificationTimes.filter((t): t is string => typeof t === "string" && HH_MM_RE.test(t));
    if (times.length) result.emptySlotNotificationTimes = times;
  }

  // Fascia oraria ristretta
  if (typeof obj.restrictedTimeRangeEnabled === "boolean") result.restrictedTimeRangeEnabled = obj.restrictedTimeRangeEnabled;
  if (typeof obj.restrictedTimeRangeStart === "string" && HH_MM_RE.test(obj.restrictedTimeRangeStart)) {
    result.restrictedTimeRangeStart = obj.restrictedTimeRangeStart;
  }
  if (typeof obj.restrictedTimeRangeEnd === "string" && HH_MM_RE.test(obj.restrictedTimeRangeEnd)) {
    result.restrictedTimeRangeEnd = obj.restrictedTimeRangeEnd;
  }

  // Assenza settimanale
  if (typeof obj.weeklyAbsenceEnabled === "boolean") result.weeklyAbsenceEnabled = obj.weeklyAbsenceEnabled;

  return result;
}

export type CompanyBookingDefaults = {
  bookingSlotDurations: number[];
  roundedHoursOnly: boolean;
  appBookingActors: AppBookingActors;
  instructorBookingMode: InstructorBookingMode;
  studentBookingMode: StudentBookingMode;
  swapEnabled: boolean;
  swapNotifyMode: "all" | "available_only";
  bookingCutoffEnabled: boolean;
  bookingCutoffTime: string;
  weeklyBookingLimitEnabled: boolean;
  weeklyBookingLimit: number;
  emptySlotNotificationEnabled: boolean;
  emptySlotNotificationTarget: "all" | "availability_matching";
  emptySlotNotificationTimes: string[];
  restrictedTimeRangeEnabled: boolean;
  restrictedTimeRangeStart: string;
  restrictedTimeRangeEnd: string;
  weeklyAbsenceEnabled: boolean;
};

export function buildCompanyBookingDefaults(limits: Record<string, unknown>): CompanyBookingDefaults {
  const { parseBookingGovernanceFromLimits } = require("@/lib/autoscuole/booking-governance");
  const governance = parseBookingGovernanceFromLimits(limits);
  return {
    bookingSlotDurations: normalizeBookingSlotDurations(limits.bookingSlotDurations),
    roundedHoursOnly: limits.roundedHoursOnly === true,
    appBookingActors: governance.appBookingActors,
    instructorBookingMode: governance.instructorBookingMode,
    studentBookingMode: governance.studentBookingMode,
    swapEnabled: limits.swapEnabled === true,
    swapNotifyMode: limits.swapNotifyMode === "available_only" ? "available_only" : "all",
    bookingCutoffEnabled: limits.bookingCutoffEnabled === true,
    bookingCutoffTime: typeof limits.bookingCutoffTime === "string" && BOOKING_CUTOFF_TIME_RE.test(limits.bookingCutoffTime) ? limits.bookingCutoffTime : "18:00",
    weeklyBookingLimitEnabled: limits.weeklyBookingLimitEnabled === true,
    weeklyBookingLimit: typeof limits.weeklyBookingLimit === "number" && limits.weeklyBookingLimit >= 1 ? limits.weeklyBookingLimit : 3,
    emptySlotNotificationEnabled: limits.emptySlotNotificationEnabled === true,
    emptySlotNotificationTarget: limits.emptySlotNotificationTarget === "availability_matching" ? "availability_matching" : "all",
    emptySlotNotificationTimes: Array.isArray(limits.emptySlotNotificationTimes) ? limits.emptySlotNotificationTimes.filter((t): t is string => typeof t === "string" && HH_MM_RE.test(t)) : ["08:00"],
    restrictedTimeRangeEnabled: limits.restrictedTimeRangeEnabled === true,
    restrictedTimeRangeStart: typeof limits.restrictedTimeRangeStart === "string" && HH_MM_RE.test(limits.restrictedTimeRangeStart) ? limits.restrictedTimeRangeStart : "08:00",
    restrictedTimeRangeEnd: typeof limits.restrictedTimeRangeEnd === "string" && HH_MM_RE.test(limits.restrictedTimeRangeEnd) ? limits.restrictedTimeRangeEnd : "13:00",
    weeklyAbsenceEnabled: limits.weeklyAbsenceEnabled === true,
  };
}

export async function resolveEffectiveBookingSettings(
  companyId: string,
  studentId: string,
  companyDefaults: CompanyBookingDefaults | { bookingSlotDurations: number[]; roundedHoursOnly: boolean },
): Promise<EffectiveBookingSettings> {
  // Build full defaults — backward-compatible with old 2-field callers
  const defaults: CompanyBookingDefaults = "appBookingActors" in companyDefaults
    ? companyDefaults
    : {
        ...companyDefaults,
        appBookingActors: DEFAULT_APP_BOOKING_ACTORS,
        instructorBookingMode: DEFAULT_INSTRUCTOR_BOOKING_MODE,
        studentBookingMode: DEFAULT_STUDENT_BOOKING_MODE,
        swapEnabled: false,
        swapNotifyMode: "all" as const,
        bookingCutoffEnabled: false,
        bookingCutoffTime: "18:00",
        weeklyBookingLimitEnabled: false,
        weeklyBookingLimit: 3,
        emptySlotNotificationEnabled: false,
        emptySlotNotificationTarget: "all" as const,
        emptySlotNotificationTimes: ["08:00"],
        restrictedTimeRangeEnabled: false,
        restrictedTimeRangeStart: "08:00",
        restrictedTimeRangeEnd: "13:00",
        weeklyAbsenceEnabled: false,
      };

  const base: EffectiveBookingSettings = {
    bookingSlotDurations: defaults.bookingSlotDurations,
    roundedHoursOnly: defaults.roundedHoursOnly,
    assignedInstructorId: null,
    assignedInstructorName: null,
    assignedInstructorPhone: null,
    isLockedToInstructor: false,
    appBookingActors: defaults.appBookingActors,
    instructorBookingMode: defaults.instructorBookingMode,
    studentBookingMode: defaults.studentBookingMode,
    swapEnabled: defaults.swapEnabled,
    swapNotifyMode: defaults.swapNotifyMode,
    bookingCutoffEnabled: defaults.bookingCutoffEnabled,
    bookingCutoffTime: defaults.bookingCutoffTime,
    weeklyBookingLimitEnabled: defaults.weeklyBookingLimitEnabled,
    weeklyBookingLimit: defaults.weeklyBookingLimit,
    emptySlotNotificationEnabled: defaults.emptySlotNotificationEnabled,
    emptySlotNotificationTarget: defaults.emptySlotNotificationTarget,
    emptySlotNotificationTimes: defaults.emptySlotNotificationTimes,
    restrictedTimeRangeEnabled: defaults.restrictedTimeRangeEnabled,
    restrictedTimeRangeStart: defaults.restrictedTimeRangeStart,
    restrictedTimeRangeEnd: defaults.restrictedTimeRangeEnd,
    weeklyAbsenceEnabled: defaults.weeklyAbsenceEnabled,
  };

  const enabled = await isInstructorClustersEnabled(companyId);
  if (!enabled) return base;

  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId: studentId, autoscuolaRole: "STUDENT" },
    select: {
      assignedInstructorId: true,
      assignedInstructor: {
        select: {
          id: true,
          name: true,
          phone: true,
          autonomousMode: true,
          settings: true,
          status: true,
          user: { select: { phone: true } },
        },
      },
    },
  });

  if (!member?.assignedInstructorId || !member.assignedInstructor) return base;

  const instructor = member.assignedInstructor;
  if (instructor.status === "inactive" || !instructor.autonomousMode) return base;

  base.assignedInstructorId = instructor.id;
  base.assignedInstructorName = instructor.name;
  base.assignedInstructorPhone = instructor.phone ?? instructor.user?.phone ?? null;
  base.isLockedToInstructor = true;

  const settings = parseInstructorSettings(instructor.settings);

  // Waterfall: cluster override → company default
  if (settings.bookingSlotDurations?.length) base.bookingSlotDurations = settings.bookingSlotDurations;
  if (typeof settings.roundedHoursOnly === "boolean") base.roundedHoursOnly = settings.roundedHoursOnly;
  if (settings.appBookingActors !== undefined) base.appBookingActors = settings.appBookingActors;
  if (settings.instructorBookingMode !== undefined) base.instructorBookingMode = settings.instructorBookingMode;
  if (settings.studentBookingMode !== undefined) base.studentBookingMode = settings.studentBookingMode;
  if (typeof settings.swapEnabled === "boolean") base.swapEnabled = settings.swapEnabled;
  if (settings.swapNotifyMode !== undefined) base.swapNotifyMode = settings.swapNotifyMode;
  if (typeof settings.bookingCutoffEnabled === "boolean") base.bookingCutoffEnabled = settings.bookingCutoffEnabled;
  if (settings.bookingCutoffTime !== undefined) base.bookingCutoffTime = settings.bookingCutoffTime;
  if (typeof settings.weeklyBookingLimitEnabled === "boolean") base.weeklyBookingLimitEnabled = settings.weeklyBookingLimitEnabled;
  if (settings.weeklyBookingLimit !== undefined) base.weeklyBookingLimit = settings.weeklyBookingLimit;
  if (typeof settings.emptySlotNotificationEnabled === "boolean") base.emptySlotNotificationEnabled = settings.emptySlotNotificationEnabled;
  if (settings.emptySlotNotificationTarget !== undefined) base.emptySlotNotificationTarget = settings.emptySlotNotificationTarget;
  if (settings.emptySlotNotificationTimes?.length) base.emptySlotNotificationTimes = settings.emptySlotNotificationTimes;
  if (typeof settings.restrictedTimeRangeEnabled === "boolean") base.restrictedTimeRangeEnabled = settings.restrictedTimeRangeEnabled;
  if (settings.restrictedTimeRangeStart !== undefined) base.restrictedTimeRangeStart = settings.restrictedTimeRangeStart;
  if (settings.restrictedTimeRangeEnd !== undefined) base.restrictedTimeRangeEnd = settings.restrictedTimeRangeEnd;
  if (typeof settings.weeklyAbsenceEnabled === "boolean") base.weeklyAbsenceEnabled = settings.weeklyAbsenceEnabled;

  return base;
}

/** Resolve effective settings for a given instructor (by instructor ID, not student ID) */
export async function resolveEffectiveSettingsForInstructor(
  companyId: string,
  instructorId: string,
  companyDefaults: CompanyBookingDefaults,
): Promise<Omit<EffectiveBookingSettings, "assignedInstructorId" | "assignedInstructorName" | "assignedInstructorPhone" | "isLockedToInstructor">> {
  const instructor = await prisma.autoscuolaInstructor.findFirst({
    where: { id: instructorId, companyId, status: { not: "inactive" } },
    select: { autonomousMode: true, settings: true },
  });

  if (!instructor?.autonomousMode) return { ...companyDefaults };

  const settings = parseInstructorSettings(instructor.settings);
  const result = { ...companyDefaults };

  if (settings.bookingSlotDurations?.length) result.bookingSlotDurations = settings.bookingSlotDurations;
  if (typeof settings.roundedHoursOnly === "boolean") result.roundedHoursOnly = settings.roundedHoursOnly;
  if (settings.appBookingActors !== undefined) result.appBookingActors = settings.appBookingActors;
  if (settings.instructorBookingMode !== undefined) result.instructorBookingMode = settings.instructorBookingMode;
  if (settings.studentBookingMode !== undefined) result.studentBookingMode = settings.studentBookingMode;
  if (typeof settings.swapEnabled === "boolean") result.swapEnabled = settings.swapEnabled;
  if (settings.swapNotifyMode !== undefined) result.swapNotifyMode = settings.swapNotifyMode;
  if (typeof settings.bookingCutoffEnabled === "boolean") result.bookingCutoffEnabled = settings.bookingCutoffEnabled;
  if (settings.bookingCutoffTime !== undefined) result.bookingCutoffTime = settings.bookingCutoffTime;
  if (typeof settings.weeklyBookingLimitEnabled === "boolean") result.weeklyBookingLimitEnabled = settings.weeklyBookingLimitEnabled;
  if (settings.weeklyBookingLimit !== undefined) result.weeklyBookingLimit = settings.weeklyBookingLimit;
  if (typeof settings.emptySlotNotificationEnabled === "boolean") result.emptySlotNotificationEnabled = settings.emptySlotNotificationEnabled;
  if (settings.emptySlotNotificationTarget !== undefined) result.emptySlotNotificationTarget = settings.emptySlotNotificationTarget;
  if (settings.emptySlotNotificationTimes?.length) result.emptySlotNotificationTimes = settings.emptySlotNotificationTimes;
  if (typeof settings.restrictedTimeRangeEnabled === "boolean") result.restrictedTimeRangeEnabled = settings.restrictedTimeRangeEnabled;
  if (settings.restrictedTimeRangeStart !== undefined) result.restrictedTimeRangeStart = settings.restrictedTimeRangeStart;
  if (settings.restrictedTimeRangeEnd !== undefined) result.restrictedTimeRangeEnd = settings.restrictedTimeRangeEnd;
  if (typeof settings.weeklyAbsenceEnabled === "boolean") result.weeklyAbsenceEnabled = settings.weeklyAbsenceEnabled;

  return result;
}

export async function getAssignedStudentIds(
  companyId: string,
  instructorId: string,
): Promise<string[]> {
  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
      assignedInstructorId: instructorId,
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
