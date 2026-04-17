import { prisma } from "@/db/prisma";

export const DEFAULT_EXAM_PRIORITY_DAYS_BEFORE = 14;

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
  daysBeforeExam?: number,
): Promise<boolean> {
  const info = await getExamPriorityInfo(companyId, studentId, daysBeforeExam);
  return info.active;
}

/**
 * Returns detailed exam priority info including the exam date and detection source.
 * @param daysBeforeExam - configurable window (default 14)
 */
export async function getExamPriorityInfo(
  companyId: string,
  studentId: string,
  daysBeforeExam: number = DEFAULT_EXAM_PRIORITY_DAYS_BEFORE,
): Promise<ExamPriorityInfo> {
  // 1. Check manual override first
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId: studentId },
    select: { examPriorityOverride: true },
  });

  if (member?.examPriorityOverride === true) {
    const examDate = await findClosestExamDate(companyId, studentId);
    return { active: true, examDate, source: "override" };
  }
  if (member?.examPriorityOverride === false) {
    return { active: false, examDate: null, source: "override" };
  }

  // 2. Auto-detect: check AutoscuolaCase.drivingExamAt within window
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + daysBeforeExam);

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

/**
 * Determine if there are students with exam priority in scope.
 * Scope: if studentInstructorId is given (student is in a cluster), only check that cluster.
 * Otherwise check the entire company.
 * Returns the list of student IDs that have exam priority in the given scope.
 */
export async function getExamStudentsInScope({
  companyId,
  studentInstructorId,
  daysBeforeExam = DEFAULT_EXAM_PRIORITY_DAYS_BEFORE,
}: {
  companyId: string;
  studentInstructorId: string | null;
  daysBeforeExam?: number;
}): Promise<string[]> {
  // Get all students in scope
  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
      ...(studentInstructorId ? { assignedInstructorId: studentInstructorId } : {}),
    },
    select: { userId: true },
  });

  const examStudentIds: string[] = [];
  for (const member of members) {
    const hasPriority = await hasExamPriority(companyId, member.userId, daysBeforeExam);
    if (hasPriority) {
      examStudentIds.push(member.userId);
    }
  }

  return examStudentIds;
}

/**
 * Per-day block check: returns true if a non-exam student is blocked from booking
 * on the given day because NOT ALL exam students in scope have booked a lesson on that day yet.
 *
 * Logic:
 * - If there are no exam students in scope → not blocked
 * - If every exam student in scope has at least one scheduled/confirmed/proposal/checked_in booking on that day → not blocked
 * - Otherwise → blocked (at least one exam student still needs to secure their slot)
 *
 * Exam-day refinement: on the actual day of an exam, slots that start AFTER
 * the exam end time are free for everyone — the priority only covers the
 * window before the exam.  Pass `slotStartsAt` to enable this check.
 */
export async function isDayBlockedByExamPriority({
  companyId,
  studentInstructorId,
  dayStart,
  dayEnd,
  daysBeforeExam = DEFAULT_EXAM_PRIORITY_DAYS_BEFORE,
  slotStartsAt,
}: {
  companyId: string;
  studentInstructorId: string | null;
  dayStart: Date;
  dayEnd: Date;
  daysBeforeExam?: number;
  /** The start time of the slot being booked. When provided, exam students
   *  whose exam ends before this time on the same day are excluded from the
   *  blocking set (the exam is already over). */
  slotStartsAt?: Date;
}): Promise<boolean> {
  const examStudentIds = await getExamStudentsInScope({
    companyId,
    studentInstructorId,
    daysBeforeExam,
  });
  if (examStudentIds.length === 0) return false;

  // On the exam day itself, remove students whose exam ends before the
  // requested slot — their priority window is over.
  let effectiveBlockingIds = examStudentIds;
  if (slotStartsAt) {
    const examsDoneBeforeSlot = await getExamEndTimesOnDay(
      companyId,
      examStudentIds,
      dayStart,
      dayEnd,
    );
    if (examsDoneBeforeSlot.size > 0) {
      effectiveBlockingIds = examStudentIds.filter((id) => {
        const examEnd = examsDoneBeforeSlot.get(id);
        // If this student has an exam today that ends before the slot → not blocking
        if (examEnd && examEnd <= slotStartsAt) return false;
        return true;
      });
      if (effectiveBlockingIds.length === 0) return false;
    }
  }

  // Which exam students already have a booking that day?
  const existing = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId: { in: effectiveBlockingIds },
      status: { in: ["scheduled", "confirmed", "proposal", "checked_in"] },
      startsAt: { gte: dayStart, lt: dayEnd },
    },
    select: { studentId: true },
  });
  const bookedStudentIds = new Set(existing.map((a) => a.studentId));

  // Blocked if at least one exam student has not yet booked this day
  return bookedStudentIds.size < effectiveBlockingIds.length;
}

/**
 * For a set of exam students, find those who have an exam on the given day
 * and return a map of studentId → exam end time.
 */
async function getExamEndTimesOnDay(
  companyId: string,
  studentIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();

  // Check exam appointments (type = 'esame') on this day
  const examAppointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId: { in: studentIds },
      type: "esame",
      status: { in: ["scheduled", "confirmed", "checked_in"] },
      startsAt: { gte: dayStart, lt: dayEnd },
    },
    select: { studentId: true, startsAt: true, endsAt: true },
  });
  for (const appt of examAppointments) {
    const end = appt.endsAt ?? new Date(appt.startsAt.getTime() + 60 * 60 * 1000);
    const existing = result.get(appt.studentId);
    // Keep the latest exam end time if a student somehow has multiple
    if (!existing || end > existing) {
      result.set(appt.studentId, end);
    }
  }

  // Also check drivingExamAt from AutoscuolaCase (may not have an appointment yet)
  const casesWithExam = await prisma.autoscuolaCase.findMany({
    where: {
      companyId,
      studentId: { in: studentIds },
      drivingExamAt: { gte: dayStart, lt: dayEnd },
    },
    select: { studentId: true, drivingExamAt: true },
  });
  for (const c of casesWithExam) {
    if (!c.drivingExamAt) continue;
    // Assume exam lasts ~1h if we only have the start from the case
    const end = new Date(c.drivingExamAt.getTime() + 60 * 60 * 1000);
    const existing = result.get(c.studentId);
    if (!existing || end > existing) {
      result.set(c.studentId, end);
    }
  }

  return result;
}
