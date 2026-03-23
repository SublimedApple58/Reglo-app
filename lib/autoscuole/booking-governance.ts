import { prisma } from "@/db/prisma";

export const APP_BOOKING_ACTOR_OPTIONS = [
  "students",
  "instructors",
  "both",
] as const;
export type AppBookingActors = (typeof APP_BOOKING_ACTOR_OPTIONS)[number];

export const INSTRUCTOR_BOOKING_MODE_OPTIONS = [
  "manual_full",
  "manual_engine",
  "guided_proposal",
] as const;
export type InstructorBookingMode = (typeof INSTRUCTOR_BOOKING_MODE_OPTIONS)[number];

export const STUDENT_BOOKING_MODE_OPTIONS = ["engine", "free_choice"] as const;
export type StudentBookingMode = (typeof STUDENT_BOOKING_MODE_OPTIONS)[number];

export type BookingGovernanceSettings = {
  appBookingActors: AppBookingActors;
  instructorBookingMode: InstructorBookingMode;
  studentBookingMode: StudentBookingMode;
};

export const DEFAULT_APP_BOOKING_ACTORS: AppBookingActors = "students";
export const DEFAULT_INSTRUCTOR_BOOKING_MODE: InstructorBookingMode = "manual_engine";
export const DEFAULT_STUDENT_BOOKING_MODE: StudentBookingMode = "engine";

const APP_BOOKING_ACTOR_SET = new Set<string>(APP_BOOKING_ACTOR_OPTIONS);
const INSTRUCTOR_BOOKING_MODE_SET = new Set<string>(INSTRUCTOR_BOOKING_MODE_OPTIONS);
const STUDENT_BOOKING_MODE_SET = new Set<string>(STUDENT_BOOKING_MODE_OPTIONS);

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const parseBookingGovernanceFromLimits = (
  limits: Record<string, unknown>,
): BookingGovernanceSettings => {
  const appBookingActorsRaw = normalizeString(limits.appBookingActors);
  const instructorBookingModeRaw = normalizeString(limits.instructorBookingMode);
  const studentBookingModeRaw = normalizeString(limits.studentBookingMode);

  const appBookingActors = APP_BOOKING_ACTOR_SET.has(appBookingActorsRaw)
    ? (appBookingActorsRaw as AppBookingActors)
    : DEFAULT_APP_BOOKING_ACTORS;
  const instructorBookingMode = INSTRUCTOR_BOOKING_MODE_SET.has(
    instructorBookingModeRaw,
  )
    ? (instructorBookingModeRaw as InstructorBookingMode)
    : DEFAULT_INSTRUCTOR_BOOKING_MODE;
  const studentBookingMode = STUDENT_BOOKING_MODE_SET.has(studentBookingModeRaw)
    ? (studentBookingModeRaw as StudentBookingMode)
    : DEFAULT_STUDENT_BOOKING_MODE;

  return {
    appBookingActors,
    instructorBookingMode,
    studentBookingMode,
  };
};

export const isStudentAppBookingEnabled = (
  governance: BookingGovernanceSettings,
) =>
  governance.appBookingActors === "students" ||
  governance.appBookingActors === "both";

export const isInstructorAppBookingEnabled = (
  governance: BookingGovernanceSettings,
) =>
  governance.appBookingActors === "instructors" ||
  governance.appBookingActors === "both";

export const getBookingGovernanceForCompany = async (
  companyId: string,
): Promise<BookingGovernanceSettings> => {
  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  const limits = (service?.limits ?? {}) as Record<string, unknown>;
  return parseBookingGovernanceFromLimits(limits);
};
