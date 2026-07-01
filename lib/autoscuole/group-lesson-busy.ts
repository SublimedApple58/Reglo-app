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
  /** Shared follow car of a kind="moto" group (reserved at the container level). */
  followVehicleId: string | null;
  /** Moto fleet of a kind="moto" group — reserved for the whole window even
   *  before all seats fill, so external bookings cannot grab the motos. */
  fleetVehicleIds: string[];
  startsAt: Date;
  endsAt: Date | null;
};

export async function fetchGroupLessonBusyRows(
  companyId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<GroupLessonBusyRow[]> {
  const rows = await prisma.autoscuolaGroupLesson.findMany({
    where: {
      companyId,
      status: "scheduled",
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
    select: {
      instructorId: true,
      vehicleId: true,
      followVehicleId: true,
      startsAt: true,
      endsAt: true,
      fleetVehicles: { select: { vehicleId: true } },
    },
  });
  return rows.map((r) => ({
    instructorId: r.instructorId,
    vehicleId: r.vehicleId,
    followVehicleId: r.followVehicleId,
    fleetVehicleIds: r.fleetVehicles.map((f) => f.vehicleId),
    startsAt: r.startsAt,
    endsAt: r.endsAt,
  }));
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
    for (const ownerId of [
      gl.instructorId,
      gl.vehicleId,
      gl.followVehicleId,
      ...gl.fleetVehicleIds,
    ]) {
      if (!ownerId) continue;
      const list = intervals.get(ownerId) ?? [];
      list.push({ start, end });
      intervals.set(ownerId, list);
    }
  }
}
