import { prisma } from "@/db/prisma";
import { normalizeBookingSlotDurations } from "@/lib/autoscuole/lesson-policy";

export type InstructorSettings = {
  bookingSlotDurations?: number[];
  roundedHoursOnly?: boolean;
};

export type EffectiveBookingSettings = {
  bookingSlotDurations: number[];
  roundedHoursOnly: boolean;
  assignedInstructorId: string | null;
  assignedInstructorName: string | null;
  assignedInstructorPhone: string | null;
  isLockedToInstructor: boolean;
};

export async function isInstructorClustersEnabled(
  _companyId: string,
): Promise<boolean> {
  // Always enabled — the per-instructor `autonomousMode` flag is the real gate.
  return true;
}

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

  return result;
}

export async function resolveEffectiveBookingSettings(
  companyId: string,
  studentId: string,
  companyDefaults: {
    bookingSlotDurations: number[];
    roundedHoursOnly: boolean;
  },
): Promise<EffectiveBookingSettings> {
  const base: EffectiveBookingSettings = {
    bookingSlotDurations: companyDefaults.bookingSlotDurations,
    roundedHoursOnly: companyDefaults.roundedHoursOnly,
    assignedInstructorId: null,
    assignedInstructorName: null,
    assignedInstructorPhone: null,
    isLockedToInstructor: false,
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

  if (settings.bookingSlotDurations?.length) {
    base.bookingSlotDurations = settings.bookingSlotDurations;
  }
  if (typeof settings.roundedHoursOnly === "boolean") {
    base.roundedHoursOnly = settings.roundedHoursOnly;
  }

  return base;
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
