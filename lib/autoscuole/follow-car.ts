/**
 * "Auto al seguito" (follow car) rules — Vehicles module, opt-in per category.
 *
 * Some schools require a moto guida to physically occupy TWO vehicles at once:
 * the motorcycle (ridden by the student) AND a follow car (driven by the
 * instructor behind the student). This is NOT hardcoded: a school enables it
 * per license category. When a category's rule is on, a booking for that
 * category reserves the moto (primary) PLUS a follow car, and both show busy in
 * the agenda.
 *
 * The config lives in `CompanyService.limits.followCarRules` (same JSON bag as
 * `lessonPolicy*` / `defaultLicenseCategory`), so it is gated by `vehiclesEnabled`
 * and needs no dedicated table. Absent / empty = today's behavior (single
 * vehicle per lesson).
 */

import {
  LICENSE_CATEGORIES,
  MOTO_LICENSE_CATEGORIES,
  type LicenseCategory,
} from "./license";

/** The license category the follow car must serve. Italy: it's always a car (B). */
export const FOLLOW_CAR_CATEGORY: LicenseCategory = "B";

/** Per-category opt-in. Only moto categories are meaningful; B is ignored. */
export type FollowCarRules = Partial<Record<LicenseCategory, { enabled: boolean }>>;

const LICENSE_CATEGORY_SET = new Set<string>(LICENSE_CATEGORIES);
const MOTO_LICENSE_CATEGORY_SET = new Set<string>(MOTO_LICENSE_CATEGORIES);

/**
 * Parse `limits.followCarRules` into a normalized map. Tolerant of legacy/absent
 * data: anything not a `{ enabled: boolean }` for a known moto category is dropped.
 */
export const parseFollowCarRulesFromLimits = (
  limits: Record<string, unknown>,
): FollowCarRules => {
  const raw =
    limits.followCarRules && typeof limits.followCarRules === "object"
      ? (limits.followCarRules as Record<string, unknown>)
      : {};

  const rules: FollowCarRules = {};
  for (const [key, value] of Object.entries(raw)) {
    // Only moto categories can require a follow car; a car requiring a "follow
    // car" makes no sense, so ignore non-moto keys.
    if (!MOTO_LICENSE_CATEGORY_SET.has(key)) continue;
    if (!value || typeof value !== "object") continue;
    const enabled = (value as Record<string, unknown>).enabled;
    if (typeof enabled === "boolean") {
      rules[key as LicenseCategory] = { enabled };
    }
  }
  return rules;
};

/** True when a lesson for `category` must additionally reserve a follow car. */
export const requiresFollowCar = (
  rules: FollowCarRules,
  category: string | null | undefined,
): boolean => {
  if (!category || !LICENSE_CATEGORY_SET.has(category)) return false;
  return rules[category as LicenseCategory]?.enabled === true;
};

/** True when the vehicle can serve as a follow car (a car: category B). */
export const isFollowCarVehicle = (vehicle: {
  licenseCategory?: string | null;
}): boolean => vehicle.licenseCategory === FOLLOW_CAR_CATEGORY;

/**
 * Given the vehicles that are FREE at a single slot, return the set of bookable
 * license keys, applying the follow-car rule: a moto whose category requires an
 * auto al seguito is only truly bookable when a free category-B car ALSO exists
 * at that slot (the lesson reserves both). Cars and moto that don't need a follow
 * car are emitted unconditionally. Used by the empty-slot notification scan.
 */
export const bookableLicenseKeysAtSlot = (args: {
  freeVehicles: Array<{ category: string | null | undefined; licenseKey: string }>;
  followCarRules: FollowCarRules;
}): Set<string> => {
  const hasFreeFollowCar = args.freeVehicles.some(
    (v) => v.category === FOLLOW_CAR_CATEGORY,
  );
  const keys = new Set<string>();
  for (const v of args.freeVehicles) {
    if (requiresFollowCar(args.followCarRules, v.category) && !hasFreeFollowCar) {
      continue;
    }
    keys.add(v.licenseKey);
  }
  return keys;
};
