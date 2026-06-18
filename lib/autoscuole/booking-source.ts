/**
 * Booking source — how an AutoscuolaAppointment came to exist. This records the
 * CHANNEL/category, deliberately NOT a specific operator (there is no per-user
 * audit on the appointment). Stored in `AutoscuolaAppointment.bookingSource`.
 *
 * Why it exists: schools (e.g. Robatto) ask "who booked the guide that exceeds
 * the 2/week limit?". The student self-booking flow always enforces the weekly
 * limit; the over-limit guide therefore always come from another channel —
 * staff creation (confirming past the warning), a swap, or a slot fill. This
 * field makes that answerable directly in the agenda/reports.
 *
 * Limit interaction (informational — the enforcement lives in each flow):
 *  - student_self  → enforces the weekly limit (hard block).
 *  - swap          → enforces the weekly limit (hard block on accept).
 *  - slot_fill     → intentionally EXEMPT (fills a freed slot; not new demand).
 *  - staff_*       → enforces, but staff may confirm past the warning (override).
 *  - group_lesson  → not counted as a normal guida cap.
 *  - exam          → exempt (exams are not driving lessons).
 *  - voice         → school-operated phone assistant (treated like staff).
 */
export const BOOKING_SOURCE = {
  studentSelf: "student_self",
  swap: "swap",
  slotFill: "slot_fill",
  staffInstructor: "staff_instructor",
  staffOwner: "staff_owner",
  voice: "voice",
  groupLesson: "group_lesson",
  exam: "exam",
} as const;

export type BookingSource = (typeof BOOKING_SOURCE)[keyof typeof BOOKING_SOURCE];

/** Sources that intentionally do NOT count against the weekly booking limit. */
export const LIMIT_EXEMPT_BOOKING_SOURCES: readonly BookingSource[] = [
  BOOKING_SOURCE.slotFill,
  BOOKING_SOURCE.groupLesson,
  BOOKING_SOURCE.exam,
];

/** Staff source for a given actor role (instructor vs owner/segreteria). */
export function staffBookingSource(isInstructorActor: boolean): BookingSource {
  return isInstructorActor ? BOOKING_SOURCE.staffInstructor : BOOKING_SOURCE.staffOwner;
}
