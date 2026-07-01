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
 * match the desired vehicles. Invariant: `appointment.vehicleId` is always THE
 * representative role="primary" row. A moto guida may additionally occupy more
 * motos (`extraMotoVehicleIds`) — these are stored as further role="primary" rows
 * (ridden vehicles), distinguished from the representative only by their id. An
 * optional role="follow" row is the auto al seguito (a car).
 *
 * Idempotent — wipes and rewrites the rows. A follow/extra without a primary is
 * impossible (cleared); ids equal to the primary or already seen are de-duped.
 */
export async function reconcileAppointmentVehicles(
  tx: AppointmentVehicleTx,
  appointmentId: string,
  primaryVehicleId: string | null,
  followVehicleId: string | null,
  extraMotoVehicleIds: string[] = [],
): Promise<void> {
  await tx.autoscuolaAppointmentVehicle.deleteMany({ where: { appointmentId } });
  if (!primaryVehicleId) return;
  const seen = new Set<string>([primaryVehicleId]);
  await tx.autoscuolaAppointmentVehicle.create({
    data: { appointmentId, vehicleId: primaryVehicleId, role: "primary" },
  });
  for (const id of extraMotoVehicleIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    await tx.autoscuolaAppointmentVehicle.create({
      data: { appointmentId, vehicleId: id, role: "primary" },
    });
  }
  if (followVehicleId && !seen.has(followVehicleId)) {
    await tx.autoscuolaAppointmentVehicle.create({
      data: { appointmentId, vehicleId: followVehicleId, role: "follow" },
    });
  }
}

/**
 * Build the `AutoscuolaAppointmentVehicle.create[]` rows for a fresh appointment:
 * the representative primary moto, any extra motos (further role="primary" rows),
 * then the follow car (role="follow"). De-duped by vehicleId. Mirrors
 * `reconcileAppointmentVehicles` so create and edit stay consistent.
 */
export function buildAppointmentVehicleRows(args: {
  primaryVehicleId: string;
  extraMotoVehicleIds?: string[] | null;
  followVehicleId?: string | null;
}): Array<{ vehicleId: string; role: string }> {
  const rows: Array<{ vehicleId: string; role: string }> = [];
  const seen = new Set<string>([args.primaryVehicleId]);
  rows.push({ vehicleId: args.primaryVehicleId, role: "primary" });
  for (const id of args.extraMotoVehicleIds ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ vehicleId: id, role: "primary" });
  }
  if (args.followVehicleId && !seen.has(args.followVehicleId)) {
    rows.push({ vehicleId: args.followVehicleId, role: "follow" });
  }
  return rows;
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
