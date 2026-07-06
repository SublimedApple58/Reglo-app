/**
 * Group MOTORCYCLE lessons — decision logic (Vehicles module).
 *
 * A `kind="moto"` group lesson differs from a standard one: instead of a single
 * shared vehicle + single category, the instructor reserves a FLEET of motos
 * (chosen by hand) plus ONE shared follow car ("auto al seguito"). Participants
 * may pursue DIFFERENT moto categories (A1/A2/A together); when a student joins,
 * the system auto-assigns one moto from the fleet that serves their license and
 * is not already taken by a sibling participant. Eligibility is therefore
 * dynamic — a student can enrol only while a compatible moto remains free.
 *
 * This module is intentionally pure (no server imports) so the rules are unit
 * testable in isolation, mirroring `follow-car.ts` / `appointment-vehicles.ts`.
 * The follow car is reserved at the GROUP level only (see schema
 * `AutoscuolaGroupLesson.followVehicleId`), never on participant join rows.
 */

import { isMotoLicenseCategory, vehicleServesLicense } from "./license";
import { FOLLOW_CAR_CATEGORY, requiresFollowCar, type FollowCarRules } from "./follow-car";

/** A vehicle as seen by the fleet/assignment logic (category + transmission). */
export type FleetVehicle = {
  id: string;
  licenseCategory: string | null;
  transmission: string | null;
};

/**
 * Whether an instructor may actually use a vehicle (so the moto fleet / follow
 * car can only be drawn from vehicles they have access to): exclusively assigned
 * to them, or open / in a shared pool they belong to. A vehicle exclusive to a
 * DIFFERENT instructor is not accessible. Mirrors the vehicle-resolution rules.
 */
export const instructorCanUseVehicle = (
  v: { assignedInstructorId: string | null; poolInstructorIds: string[] },
  instructorId: string,
): boolean => {
  if (v.assignedInstructorId) return v.assignedInstructorId === instructorId;
  return v.poolInstructorIds.length === 0 || v.poolInstructorIds.includes(instructorId);
};

/** The license a participant pursues. */
export type StudentLicense = {
  licenseCategory: string | null;
  transmission: string | null;
};

/**
 * Pick a moto from the fleet for a student: the first vehicle that serves their
 * license (category + transmission) and is not already taken by a sibling.
 * Returns the vehicle id, or null when none is FREE. Since 2026-07-06 a null
 * assignment no longer blocks enrolment (students may outnumber motos and ride
 * in turns): eligibility is `eligibleForMotoGroup` (hierarchy-only), the
 * assignment is best-effort.
 */
export const assignMotoForStudent = (args: {
  fleet: FleetVehicle[];
  takenVehicleIds: Iterable<string>;
  student: StudentLicense;
}): string | null => {
  const taken = new Set(args.takenVehicleIds);
  for (const moto of args.fleet) {
    if (taken.has(moto.id)) continue;
    if (vehicleServesLicense(moto, args.student)) return moto.id;
  }
  return null;
};

/**
 * A student may enrol in a moto group iff AT LEAST ONE fleet moto serves their
 * license (moto hierarchy + transmission) — regardless of how many siblings
 * already ride it. Participants may outnumber motos (they take turns); the
 * only seat limit is the lesson capacity. (Rule change 2026-07-06: previously
 * a compatible moto also had to be FREE.)
 */
export const eligibleForMotoGroup = (args: {
  fleet: FleetVehicle[];
  student: StudentLicense;
}): boolean => args.fleet.some((moto) => vehicleServesLicense(moto, args.student));

/**
 * Assign motos to an ordered list of students (e.g. pre-added at creation),
 * best-effort: each student gets a distinct still-free compatible fleet moto
 * when one remains, `vehicleId: null` otherwise (they ride in turns). Fails
 * only when a student has NO compatible moto in the whole fleet (hierarchy),
 * returning that student's id so the caller can surface a clear error.
 */
export const assignMotosToStudents = (args: {
  fleet: FleetVehicle[];
  students: Array<{ studentId: string; license: StudentLicense }>;
}):
  | { ok: true; assignments: Array<{ studentId: string; vehicleId: string | null }> }
  | { ok: false; incompatibleStudentId: string } => {
  const taken = new Set<string>();
  const assignments: Array<{ studentId: string; vehicleId: string | null }> = [];
  for (const s of args.students) {
    if (!eligibleForMotoGroup({ fleet: args.fleet, student: s.license })) {
      return { ok: false, incompatibleStudentId: s.studentId };
    }
    const vehicleId = assignMotoForStudent({
      fleet: args.fleet,
      takenVehicleIds: taken,
      student: s.license,
    });
    if (vehicleId) taken.add(vehicleId);
    assignments.push({ studentId: s.studentId, vehicleId });
  }
  return { ok: true, assignments };
};

/**
 * True when the moto group needs a shared follow car: any fleet category whose
 * follow-car rule is enabled forces an auto al seguito for the whole group.
 */
export const groupMotoFollowCarRequired = (
  rules: FollowCarRules,
  fleetCategories: Array<string | null | undefined>,
): boolean => fleetCategories.some((c) => requiresFollowCar(rules, c));

/** Why a proposed moto-group setup is invalid (first failing rule). */
export type MotoGroupSetupError =
  | "empty_fleet"
  | "duplicate_fleet_vehicle"
  | "non_moto_in_fleet"
  | "follow_car_not_b"
  | "follow_car_in_fleet"
  | "follow_car_required_missing";

export const MOTO_GROUP_SETUP_MESSAGES: Record<MotoGroupSetupError, string> = {
  empty_fleet: "Seleziona almeno una moto per la guida di gruppo.",
  duplicate_fleet_vehicle: "Una moto è stata selezionata più volte.",
  non_moto_in_fleet: "La flotta può contenere solo moto (categorie AM, A1, A2, A).",
  follow_car_not_b: "L'auto al seguito dev'essere un'auto (categoria B).",
  follow_car_in_fleet: "L'auto al seguito non può essere anche una moto della flotta.",
  follow_car_required_missing:
    "Per queste moto è richiesta un'auto al seguito: selezionala.",
};

/**
 * Validate the setup of a moto group: a non-empty, distinct, all-moto fleet; a
 * follow car that is a category-B car distinct from the fleet, present whenever
 * the rules require it. Capacity is free (participants may outnumber motos and
 * ride in turns — rule change 2026-07-06). Returns the first failing rule, or
 * null when valid.
 */
export const validateMotoGroupSetup = (args: {
  fleet: FleetVehicle[];
  followVehicle: FleetVehicle | null;
  followCarRules: FollowCarRules;
  capacity?: number;
}): MotoGroupSetupError | null => {
  const { fleet, followVehicle, followCarRules } = args;

  if (fleet.length === 0) return "empty_fleet";

  const ids = new Set<string>();
  for (const moto of fleet) {
    if (ids.has(moto.id)) return "duplicate_fleet_vehicle";
    ids.add(moto.id);
    if (!isMotoLicenseCategory(moto.licenseCategory)) return "non_moto_in_fleet";
  }

  if (followVehicle) {
    if (followVehicle.licenseCategory !== FOLLOW_CAR_CATEGORY) return "follow_car_not_b";
    if (ids.has(followVehicle.id)) return "follow_car_in_fleet";
  } else if (groupMotoFollowCarRequired(followCarRules, fleet.map((m) => m.licenseCategory))) {
    return "follow_car_required_missing";
  }

  return null;
};
