import { prisma } from "@/db/prisma";

const EXAM_PRIORITY_WINDOW_DAYS = 14;

export type ExamPriorityInfo = {
  active: boolean;
  examDate: string | null;
  source: "override" | "case" | "appointment" | null;
};

/**
 * Returns whether a student currently qualifies for exam priority booking.
 */
export async function hasExamPriority(
  companyId: string,
  studentId: string,
): Promise<boolean> {
  const info = await getExamPriorityInfo(companyId, studentId);
  return info.active;
}

/**
 * Returns detailed exam priority info including the exam date and detection source.
 */
export async function getExamPriorityInfo(
  companyId: string,
  studentId: string,
): Promise<ExamPriorityInfo> {
  // 1. Check manual override first
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId: studentId },
    select: { examPriorityOverride: true },
  });

  if (member?.examPriorityOverride === true) {
    // Force on — still try to find exam date for display, but active = true regardless
    const examDate = await findClosestExamDate(companyId, studentId);
    return { active: true, examDate, source: "override" };
  }
  if (member?.examPriorityOverride === false) {
    return { active: false, examDate: null, source: "override" };
  }

  // 2. Auto-detect: check AutoscuolaCase.drivingExamAt within window
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + EXAM_PRIORITY_WINDOW_DAYS);

  const caseWithExam = await prisma.autoscuolaCase.findFirst({
    where: {
      companyId,
      studentId,
      drivingExamAt: { gte: now, lte: windowEnd },
    },
    select: { drivingExamAt: true },
    orderBy: { drivingExamAt: "asc" },
  });

  if (caseWithExam?.drivingExamAt) {
    return {
      active: true,
      examDate: caseWithExam.drivingExamAt.toISOString(),
      source: "case",
    };
  }

  // 3. Auto-detect: check exam appointments within window
  const examAppointment = await prisma.autoscuolaAppointment.findFirst({
    where: {
      companyId,
      studentId,
      type: "esame",
      status: "scheduled",
      startsAt: { gte: now, lte: windowEnd },
    },
    select: { startsAt: true },
    orderBy: { startsAt: "asc" },
  });

  if (examAppointment) {
    return {
      active: true,
      examDate: examAppointment.startsAt.toISOString(),
      source: "appointment",
    };
  }

  return { active: false, examDate: null, source: null };
}

/**
 * Helper to find the closest exam date for display purposes (used when override = true).
 */
async function findClosestExamDate(
  companyId: string,
  studentId: string,
): Promise<string | null> {
  const now = new Date();

  const caseWithExam = await prisma.autoscuolaCase.findFirst({
    where: {
      companyId,
      studentId,
      drivingExamAt: { gte: now },
    },
    select: { drivingExamAt: true },
    orderBy: { drivingExamAt: "asc" },
  });

  if (caseWithExam?.drivingExamAt) {
    return caseWithExam.drivingExamAt.toISOString();
  }

  const examAppointment = await prisma.autoscuolaAppointment.findFirst({
    where: {
      companyId,
      studentId,
      type: "esame",
      status: "scheduled",
      startsAt: { gte: now },
    },
    select: { startsAt: true },
    orderBy: { startsAt: "asc" },
  });

  return examAppointment?.startsAt.toISOString() ?? null;
}
