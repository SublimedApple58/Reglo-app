/**
 * Appointment ↔ vehicles helpers (Vehicles module, M:N + auto al seguito).
 *
 * Pure-ish, dependency-injected helpers extracted from the server actions so the
 * decision logic is unit-testable without pulling the whole action graph (and its
 * heavy transitive imports). The transaction client is passed in structurally.
 */

/** The slice of a Prisma transaction client these helpers touch. */
export interface AppointmentVehicleTx {
  autoscuolaAppointmentVehicle: {
    deleteMany(args: { where: { appointmentId: string } }): Promise<unknown>;
    create(args: {
      data: { appointmentId: string; vehicleId: string; role: string };
    }): Promise<unknown>;
  };
}

/**
 * Reconcile the AutoscuolaAppointmentVehicle join rows for an appointment so they
 * match the desired primary + follow vehicles. Invariant: `appointment.vehicleId`
 * is always the role="primary" row; an optional role="follow" row is the auto al
 * seguito. Idempotent — wipes and rewrites the rows. A follow car without a
 * primary is impossible (cleared); a follow equal to the primary is de-duped.
 */
export async function reconcileAppointmentVehicles(
  tx: AppointmentVehicleTx,
  appointmentId: string,
  primaryVehicleId: string | null,
  followVehicleId: string | null,
): Promise<void> {
  await tx.autoscuolaAppointmentVehicle.deleteMany({ where: { appointmentId } });
  if (!primaryVehicleId) return;
  await tx.autoscuolaAppointmentVehicle.create({
    data: { appointmentId, vehicleId: primaryVehicleId, role: "primary" },
  });
  if (followVehicleId && followVehicleId !== primaryVehicleId) {
    await tx.autoscuolaAppointmentVehicle.create({
      data: { appointmentId, vehicleId: followVehicleId, role: "follow" },
    });
  }
}

/**
 * Decide the exclusive owner field when a vehicle is updated, encoding rule #4
 * (maintenance vs inactive):
 *  - `inactive` always RELEASES the exclusive owner (returns null),
 *  - otherwise the owner follows the payload: `undefined` = leave unchanged,
 *    `null` = unassign, a string = (re)assign.
 *
 * `maintenance` is therefore a no-op on the owner (payload usually undefined) —
 * the vehicle keeps its assignment while excluded from matching.
 *
 * Return contract: `undefined` = do not touch the column; `null` = set to null;
 * string = set to that instructor id.
 */
export function resolveVehicleOwnerOnUpdate(args: {
  nextStatus: string;
  payloadAssignedInstructorId: string | null | undefined;
}): string | null | undefined {
  if (args.nextStatus === "inactive") return null;
  return args.payloadAssignedInstructorId;
}
