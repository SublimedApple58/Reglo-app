import { prisma } from "@/db/prisma";

/**
 * Busy intervals contributed by scheduled group-lesson CONTAINERS.
 *
 * Group-lesson participants are regular AutoscuolaAppointment rows, so a
 * lesson with at least one seat taken already blocks its instructor/vehicle
 * through the normal appointment-based conflict checks. An EMPTY group lesson
 * (0 participants, open seats waiting for invites) has no appointment rows and
 * was therefore invisible to the booking engine: students could book single
 * guides right on top of it (real incident at Autoscuola Robatto, 2026-06-12).
 *
 * Every consumer that builds per-owner busy intervals (slot proposals, booking
 * confirm, slot-matcher) must ALSO merge these container intervals, keyed by
 * instructorId and vehicleId.
 */
export type GroupLessonBusyRow = {
  instructorId: string | null;
  vehicleId: string | null;
  startsAt: Date;
  endsAt: Date | null;
};

export async function fetchGroupLessonBusyRows(
  companyId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<GroupLessonBusyRow[]> {
  return prisma.autoscuolaGroupLesson.findMany({
    where: {
      companyId,
      status: "scheduled",
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
    select: {
      instructorId: true,
      vehicleId: true,
      startsAt: true,
      endsAt: true,
    },
  });
}

/**
 * Merges group-lesson container intervals into a per-owner busy-intervals map
 * (`ownerId -> [{start, end}]`, epoch ms) — same shape used by the slot search
 * and the slot matcher.
 */
export function addGroupLessonBusyIntervals(
  intervals: Map<string, Array<{ start: number; end: number }>>,
  rows: GroupLessonBusyRow[],
): void {
  for (const gl of rows) {
    if (!gl.endsAt) continue;
    const start = gl.startsAt.getTime();
    const end = gl.endsAt.getTime();
    for (const ownerId of [gl.instructorId, gl.vehicleId]) {
      if (!ownerId) continue;
      const list = intervals.get(ownerId) ?? [];
      list.push({ start, end });
      intervals.set(ownerId, list);
    }
  }
}
