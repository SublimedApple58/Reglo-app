import { prisma } from "@/db/prisma";

import { FOLLOW_CAR_CATEGORY } from "./follow-car";
import { instructorCanUseVehicle } from "./group-moto";

/**
 * Lazy follow-car assignment for MOTO group lessons (2026-07-06).
 *
 * At creation the follow car is always OPTIONAL: the owner/instructor may pick
 * one by hand, but leaving "Nessuna" is fine even when `followCarRules` require
 * it for the fleet categories. The car becomes necessary only when the lesson
 * actually gets riders — so it is auto-assigned at the FIRST seat taken
 * (pre-add at creation, staff add, or student invite accept), mirroring how the
 * student single-booking flow auto-resolves its follow car.
 *
 * Picks the first ACTIVE category-B car the lesson's instructor can use
 * (exclusive to them, or open / in a pool they belong to) that is free for the
 * whole lesson window: no overlapping appointment holds it (directly or via the
 * appointmentVehicles join) and no other scheduled group container reserves it
 * (as shared vehicle, follow car, or fleet moto). Returns null when none free.
 */
export async function findFreeGroupFollowCar(args: {
  companyId: string;
  instructorId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  /** The lesson being served — its own container reservation must not count. */
  excludeGroupLessonId?: string | null;
}): Promise<string | null> {
  const windowEnd = args.endsAt ?? args.startsAt;

  const cars = await prisma.autoscuolaVehicle.findMany({
    where: {
      companyId: args.companyId,
      status: "active",
      licenseCategory: FOLLOW_CAR_CATEGORY,
    },
    select: {
      id: true,
      assignedInstructorId: true,
      poolMembers: { select: { instructorId: true } },
    },
    orderBy: { name: "asc" },
  });

  const accessible = args.instructorId
    ? cars.filter((v) =>
        instructorCanUseVehicle(
          {
            assignedInstructorId: v.assignedInstructorId,
            poolInstructorIds: v.poolMembers.map((p) => p.instructorId),
          },
          args.instructorId!,
        ),
      )
    : cars;

  for (const car of accessible) {
    const [appointment, container] = await Promise.all([
      prisma.autoscuolaAppointment.findFirst({
        where: {
          companyId: args.companyId,
          status: { not: "cancelled" },
          startsAt: { lt: windowEnd },
          endsAt: { gt: args.startsAt },
          OR: [
            { vehicleId: car.id },
            { appointmentVehicles: { some: { vehicleId: car.id } } },
          ],
        },
        select: { id: true },
      }),
      prisma.autoscuolaGroupLesson.findFirst({
        where: {
          companyId: args.companyId,
          ...(args.excludeGroupLessonId ? { id: { not: args.excludeGroupLessonId } } : {}),
          status: "scheduled",
          startsAt: { lt: windowEnd },
          endsAt: { gt: args.startsAt },
          OR: [
            { vehicleId: car.id },
            { followVehicleId: car.id },
            { fleetVehicles: { some: { vehicleId: car.id } } },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (!appointment && !container) return car.id;
  }
  return null;
}

export const NO_FREE_FOLLOW_CAR_MESSAGE =
  "Per queste moto serve un'auto al seguito ma nessuna è libera in quell'orario: selezionane una a mano o cambia orario.";
