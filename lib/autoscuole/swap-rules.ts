/**
 * Swap eligibility rules — which appointments may NOT enter the student/instructor
 * swap engine. Pure + framework-free so both swap entry points share one source
 * of truth and it stays unit-testable.
 *
 *  - group-lesson seats: the group flow has its own opt-in/seat/license rules,
 *  - exams: personal, not swappable,
 *  - auto al seguito (follow car): reserves two vehicles; not swappable in phase 1
 *    (a takeover would need to re-resolve and re-reserve the follow car).
 */

export type SwapBlockReason = "group_lesson" | "exam" | "follow_car";

export function appointmentSwapBlockReason(appt: {
  type: string;
  groupLessonId?: string | null;
  hasFollowCar?: boolean;
}): SwapBlockReason | null {
  if (appt.groupLessonId || appt.type === "group_lesson") return "group_lesson";
  if (appt.type === "esame") return "exam";
  if (appt.hasFollowCar) return "follow_car";
  return null;
}

export const SWAP_BLOCK_MESSAGES: Record<SwapBlockReason, string> = {
  group_lesson: "I posti delle guide di gruppo non si possono scambiare.",
  exam: "Gli esami non si possono scambiare.",
  follow_car: "Le guide con auto al seguito non si possono scambiare.",
};
