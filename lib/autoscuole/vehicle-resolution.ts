/**
 * Vehicle resolution — generalizes the old 1:1 "fixed vehicle" model to:
 *  - many-to-many instructor↔vehicle (an instructor may own several EXCLUSIVE
 *    vehicles, e.g. their car + their moto),
 *  - an OPTIONAL explicit shared POOL per vehicle (else the vehicle is open to
 *    all instructors — today's default),
 *  - multi-vehicle lessons (a moto guida may additionally reserve a follow car).
 *
 * Resolution of "which vehicle does instructor I use for a student of category C"
 * is PER CATEGORY and preserves the old behavior exactly for covered categories:
 *
 *   1. If I owns EXCLUSIVE vehicle(s) that serve C → I is FORCED to them (no pool
 *      dilution, no fallback). Pick the usable/best among them; null if none
 *      usable (I is unavailable — same as the old "fixed vehicle busy" case).
 *   2. Else (I has no exclusive vehicle for C) → draw from the POOL: vehicles
 *      serving C that are either explicitly pooled to I, or OPEN (no exclusive
 *      owner and no explicit pool). Exclusive-to-others are never offered.
 *
 * This makes the common single-fixed-vehicle school behave bit-for-bit as before,
 * while letting an instructor pick up a pool vehicle for a category their own
 * exclusive vehicles don't cover (the "Mario does the occasional moto" case).
 *
 * Pure module: callbacks inject each call site's availability/overlap/score maps.
 */

export type VehicleRow = {
  id: string;
  /** Exclusive owner (was the 1:1 "fixed" instructor). Null = not exclusive. */
  assignedInstructorId: string | null;
  followsInstructorAvailability: boolean;
  licenseCategory?: string | null;
  transmission?: string | null;
};

export type PoolMemberRow = { vehicleId: string; instructorId: string };

export type PreferredRow = {
  instructorId: string;
  licenseCategory: string;
  vehicleId: string;
};

export type VehicleResolutionMaps = {
  vehiclesById: Map<string, VehicleRow>;
  /** instructorId → ids of vehicles EXCLUSIVELY owned by them (1:N). */
  exclusiveByInstructor: Map<string, string[]>;
  /** every vehicle that is exclusive to SOME instructor (hidden from others). */
  exclusiveVehicleIds: Set<string>;
  /** vehicleId → instructorIds allowed by an EXPLICIT pool. Absent = open. */
  poolByVehicle: Map<string, Set<string>>;
  /** `${instructorId}|${category}` → preferred vehicleId (tie-break). */
  preferredByInstructorCategory: Map<string, string>;
};

export function buildVehicleResolutionMaps(args: {
  vehicles: VehicleRow[];
  poolMembers?: PoolMemberRow[];
  preferred?: PreferredRow[];
}): VehicleResolutionMaps {
  const vehiclesById = new Map<string, VehicleRow>();
  const exclusiveByInstructor = new Map<string, string[]>();
  const exclusiveVehicleIds = new Set<string>();
  for (const vehicle of args.vehicles) {
    vehiclesById.set(vehicle.id, vehicle);
    if (vehicle.assignedInstructorId) {
      exclusiveVehicleIds.add(vehicle.id);
      const list = exclusiveByInstructor.get(vehicle.assignedInstructorId);
      if (list) list.push(vehicle.id);
      else exclusiveByInstructor.set(vehicle.assignedInstructorId, [vehicle.id]);
    }
  }

  const poolByVehicle = new Map<string, Set<string>>();
  for (const member of args.poolMembers ?? []) {
    const set = poolByVehicle.get(member.vehicleId);
    if (set) set.add(member.instructorId);
    else poolByVehicle.set(member.vehicleId, new Set([member.instructorId]));
  }

  const preferredByInstructorCategory = new Map<string, string>();
  for (const pref of args.preferred ?? []) {
    preferredByInstructorCategory.set(
      `${pref.instructorId}|${pref.licenseCategory}`,
      pref.vehicleId,
    );
  }

  return {
    vehiclesById,
    exclusiveByInstructor,
    exclusiveVehicleIds,
    poolByVehicle,
    preferredByInstructorCategory,
  };
}

export type ResolvedVehicle = { id: string; score: number };

type ResolveArgs = {
  instructorId: string;
  studentCategory: string | null;
  activeVehicleIds: string[];
  maps: VehicleResolutionMaps;
  isVehicleAvailable: (vehicleId: string) => boolean;
  hasOverlap: (vehicleId: string) => boolean;
  scoreVehicle: (vehicleId: string) => number;
  /** true if the vehicle serves the student's license (category + transmission). */
  matchesLicenseCategory?: (vehicleId: string) => boolean;
  /** when true, additionally resolve a follow car (auto al seguito). */
  requireFollowCar?: boolean;
  /** true if the vehicle can serve as a follow car (a car, category B). */
  matchesFollowCar?: (vehicleId: string) => boolean;
  /** license category the follow car is resolved against (defaults to "B"). */
  followCarCategory?: string;
};

/**
 * Resolve the vehicle set an instructor uses at a slot: the primary vehicle and,
 * when required, a follow car. Returns null when vehicles are required but the
 * instructor cannot be served at this slot.
 */
export function resolveVehiclesForInstructor(
  args: ResolveArgs,
): { primary: ResolvedVehicle; follow?: ResolvedVehicle } | null {
  const matchesLicenseCategory = args.matchesLicenseCategory ?? (() => true);

  const primary = pickVehicleForInstructor(args, {
    predicate: matchesLicenseCategory,
    preferredCategory: args.studentCategory,
  });
  if (!primary) return null;

  if (!args.requireFollowCar) return { primary };

  const matchesFollowCar = args.matchesFollowCar ?? (() => false);
  const follow = pickVehicleForInstructor(args, {
    predicate: matchesFollowCar,
    preferredCategory: args.followCarCategory ?? "B",
    excludeId: primary.id,
  });
  if (!follow) return null;

  return { primary, follow };
}

function pickVehicleForInstructor(
  args: ResolveArgs,
  opts: {
    predicate: (vehicleId: string) => boolean;
    preferredCategory: string | null;
    excludeId?: string;
  },
): ResolvedVehicle | null {
  const { instructorId, maps } = args;
  const { predicate, excludeId } = opts;

  const isUsable = (id: string): boolean => {
    if (id === excludeId) return false;
    if (args.hasOverlap(id)) return false;
    const vehicle = maps.vehiclesById.get(id);
    // An exclusive vehicle of THIS instructor that follows the instructor is
    // available whenever the instructor is (its own availability is ignored).
    if (
      vehicle?.assignedInstructorId === instructorId &&
      vehicle.followsInstructorAvailability
    ) {
      return true;
    }
    return args.isVehicleAvailable(id);
  };

  const preferredId = opts.preferredCategory
    ? maps.preferredByInstructorCategory.get(
        `${instructorId}|${opts.preferredCategory}`,
      )
    : undefined;

  const best = (candidateIds: string[]): ResolvedVehicle | null => {
    const usable = candidateIds.filter((id) => predicate(id) && isUsable(id));
    if (usable.length === 0) return null;
    if (preferredId && usable.includes(preferredId)) {
      return { id: preferredId, score: args.scoreVehicle(preferredId) };
    }
    let chosen: ResolvedVehicle | null = null;
    for (const id of usable) {
      const score = args.scoreVehicle(id);
      if (!chosen || score > chosen.score) chosen = { id, score };
    }
    return chosen;
  };

  // (1) Exclusive vehicles of this instructor that serve the category → FORCED.
  const exclusiveIds = (maps.exclusiveByInstructor.get(instructorId) ?? []).filter(
    (id) => predicate(id) && id !== excludeId,
  );
  if (exclusiveIds.length > 0) {
    return best(exclusiveIds);
  }

  // (2) Pool/open vehicles serving the category (exclude exclusive-to-others and
  // explicit pools that don't list this instructor).
  const poolCandidates = args.activeVehicleIds.filter((id) => {
    if (maps.exclusiveVehicleIds.has(id)) return false;
    const pool = maps.poolByVehicle.get(id);
    if (pool && !pool.has(instructorId)) return false;
    return true;
  });
  return best(poolCandidates);
}

/**
 * Pick the best (instructor, vehicle set) for a slot. Instructor and vehicle are
 * coupled (exclusive vehicles are bound to their instructor). When vehicles are
 * disabled the vehicle ids are null and the best instructor wins.
 */
export function pickBestInstructorVehicleSet(args: {
  availableInstructors: Array<{ id: string; score: number }>;
  vehiclesEnabled: boolean;
  resolveVehicles: (
    instructorId: string,
  ) => { primary: ResolvedVehicle; follow?: ResolvedVehicle } | null;
}): {
  instructorId: string;
  vehicleId: string | null;
  followVehicleId: string | null;
  score: number;
} | null {
  let best: {
    instructorId: string;
    vehicleId: string | null;
    followVehicleId: string | null;
    score: number;
  } | null = null;

  for (const instructor of args.availableInstructors) {
    let vehicleId: string | null = null;
    let followVehicleId: string | null = null;
    let vehicleScore = 0;
    if (args.vehiclesEnabled) {
      const resolved = args.resolveVehicles(instructor.id);
      if (!resolved) continue; // vehicles required but none available
      vehicleId = resolved.primary.id;
      followVehicleId = resolved.follow?.id ?? null;
      vehicleScore = resolved.primary.score + (resolved.follow?.score ?? 0);
    }
    const score = instructor.score + vehicleScore;
    if (!best || score > best.score) {
      best = { instructorId: instructor.id, vehicleId, followVehicleId, score };
    }
  }
  return best;
}
