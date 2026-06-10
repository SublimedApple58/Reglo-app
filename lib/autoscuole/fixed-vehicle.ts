/**
 * Fixed-vehicle assignment helpers.
 *
 * A vehicle can be assigned as the "fixed" vehicle of a single instructor
 * (`assignedInstructorId`). When that happens:
 *  - bookings made WITH that instructor automatically use that vehicle, and
 *  - that vehicle is RESERVED: it is excluded from the automatic best-fit pool
 *    used for OTHER instructors (it can still be picked manually elsewhere).
 *
 * The per-vehicle flag `followsInstructorAvailability` (default true) decides
 * whether the fixed vehicle's own weekly availability is enforced:
 *  - true  → the vehicle is available whenever its instructor is (its own
 *            availability is ignored); overlap is still checked.
 *  - false → the vehicle's own availability is intersected as usual.
 *
 * These functions are PURE so the same coupling logic can be shared across the
 * matcher's multiple booking/availability sites without drift.
 */

export type FixedVehicleRow = {
  id: string;
  assignedInstructorId: string | null;
  followsInstructorAvailability: boolean;
  /** License category this vehicle serves (B | AM | A1 | A2 | A). */
  licenseCategory?: string | null;
  /** Transmission this vehicle serves (manual | automatic). */
  transmission?: string | null;
};

export type FixedVehicleMaps = {
  /** instructorId → its fixed vehicle */
  fixedByInstructor: Map<string, FixedVehicleRow>;
  /** ids of every vehicle reserved to some instructor */
  reservedVehicleIds: Set<string>;
};

export function buildFixedVehicleMaps(
  vehicles: FixedVehicleRow[],
): FixedVehicleMaps {
  const fixedByInstructor = new Map<string, FixedVehicleRow>();
  const reservedVehicleIds = new Set<string>();
  for (const vehicle of vehicles) {
    if (vehicle.assignedInstructorId) {
      // The DB unique constraint guarantees at most one vehicle per instructor.
      fixedByInstructor.set(vehicle.assignedInstructorId, vehicle);
      reservedVehicleIds.add(vehicle.id);
    }
  }
  return { fixedByInstructor, reservedVehicleIds };
}

/**
 * Resolve which vehicle a given instructor should use at a specific slot.
 *
 * Callbacks let each call site reuse its own availability resolver / overlap
 * maps / scoring without this module depending on them.
 *
 * Returns `null` when vehicles are enabled but none can serve this instructor
 * at this slot (caller should then skip the instructor for this slot).
 */
export function resolveVehicleForInstructor(args: {
  instructorId: string;
  activeVehicleIds: string[];
  maps: FixedVehicleMaps;
  /** true if the vehicle's own weekly availability covers the slot */
  isVehicleAvailable: (vehicleId: string) => boolean;
  /** true if the vehicle already has an overlapping appointment in the slot */
  hasOverlap: (vehicleId: string) => boolean;
  /** packing score (higher = tighter fit) for the vehicle in the slot */
  scoreVehicle: (vehicleId: string) => number;
  /**
   * true if the vehicle's license category + transmission serve the student's
   * pursued license. Defaults to always-true (no category constraint) so legacy
   * callers and the module-off path keep working unchanged.
   */
  matchesLicenseCategory?: (vehicleId: string) => boolean;
}): { id: string; score: number } | null {
  const {
    instructorId,
    activeVehicleIds,
    maps,
    isVehicleAvailable,
    hasOverlap,
    scoreVehicle,
    matchesLicenseCategory = () => true,
  } = args;

  const fixed = maps.fixedByInstructor.get(instructorId);
  if (fixed) {
    // Forced vehicle: it must also serve the student's license category. If it
    // doesn't, this instructor cannot serve this student (e.g. moto-only).
    if (!matchesLicenseCategory(fixed.id)) return null;
    // Forced vehicle: overlap is always disqualifying.
    if (hasOverlap(fixed.id)) return null;
    // Own availability enforced only when it does NOT follow the instructor.
    if (!fixed.followsInstructorAvailability && !isVehicleAvailable(fixed.id)) {
      return null;
    }
    return { id: fixed.id, score: scoreVehicle(fixed.id) };
  }

  // No fixed vehicle: best-fit from the pool, excluding reserved vehicles and
  // vehicles that don't serve the student's license category.
  let best: { id: string; score: number } | null = null;
  for (const vehicleId of activeVehicleIds) {
    if (maps.reservedVehicleIds.has(vehicleId)) continue;
    if (!matchesLicenseCategory(vehicleId)) continue;
    if (!isVehicleAvailable(vehicleId)) continue;
    if (hasOverlap(vehicleId)) continue;
    const score = scoreVehicle(vehicleId);
    if (!best || score > best.score) best = { id: vehicleId, score };
  }
  return best;
}

/**
 * Pick the best (instructor, vehicle) pair for a slot.
 *
 * Instructor and vehicle can no longer be chosen independently: a fixed vehicle
 * is bound to its instructor, so the choice is per-pair. When vehicles are
 * disabled, the vehicle is always null and the best instructor wins.
 */
export function pickBestInstructorVehiclePair(args: {
  availableInstructors: Array<{ id: string; score: number }>;
  vehiclesEnabled: boolean;
  resolveVehicle: (instructorId: string) => { id: string; score: number } | null;
}): { instructorId: string; vehicleId: string | null; score: number } | null {
  let best: { instructorId: string; vehicleId: string | null; score: number } | null =
    null;
  for (const instructor of args.availableInstructors) {
    let vehicle: { id: string; score: number } | null = null;
    if (args.vehiclesEnabled) {
      vehicle = args.resolveVehicle(instructor.id);
      if (!vehicle) continue; // vehicles required but none available for this instructor
    }
    const score = instructor.score + (vehicle?.score ?? 0);
    if (!best || score > best.score) {
      best = {
        instructorId: instructor.id,
        vehicleId: vehicle?.id ?? null,
        score,
      };
    }
  }
  return best;
}
