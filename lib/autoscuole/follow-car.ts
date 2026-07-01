/**
 * "Auto al seguito" (follow car) rule — Vehicles module, ONE global toggle.
 *
 * Some schools require a moto guida to physically occupy TWO vehicles at once:
 * the motorcycle (ridden by the student) AND a follow car (driven by the
 * instructor behind the student). This is NOT hardcoded: a school enables it
 * with a single switch that applies to ALL moto categories (AM/A1/A2/A). When
 * on, a moto booking also reserves a follow car and both show busy in the agenda.
 *
 * The config lives in `CompanyService.limits.followCarMotoEnabled` (same JSON bag
 * as `lessonPolicy*` / `defaultLicenseCategory`), so it is gated by
 * `vehiclesEnabled` and needs no dedicated table. Absent / false = today's
 * behavior (single vehicle per lesson).
 *
 * Back-compat: the rule used to be per-category (`limits.followCarRules`). When
 * the new flag is absent we fall back to that legacy map and treat the global
 * rule as ON if ANY moto category was enabled. `parseFollowCarRulesFromLimits`
 * still returns a per-category map (now all-moto-on / all-off) so every existing
 * call site keeps working unchanged.
 */

import {
  MOTO_LICENSE_CATEGORIES,
  type LicenseCategory,
} from "./license";

/** The license category the follow car must serve. Italy: it's always a car (B). */
export const FOLLOW_CAR_CATEGORY: LicenseCategory = "B";

/** Limits key holding the single global follow-car flag. */
export const FOLLOW_CAR_LIMITS_KEY = "followCarMotoEnabled";

/**
 * Per-category map kept for call-site compatibility. With the global rule it is
 * now all-or-nothing across moto categories (every moto category shares the flag).
 */
export type FollowCarRules = Partial<Record<LicenseCategory, { enabled: boolean }>>;

const MOTO_LICENSE_CATEGORY_SET = new Set<string>(MOTO_LICENSE_CATEGORIES);

/** Build the per-category map from the single global flag (all moto share it). */
export const followCarRulesForEnabled = (enabled: boolean): FollowCarRules => {
  if (!enabled) return {};
  const rules: FollowCarRules = {};
  for (const cat of MOTO_LICENSE_CATEGORIES) rules[cat] = { enabled: true };
  return rules;
};

/**
 * Read the single global follow-car flag from `limits`. Back-compat: when the
 * new flag is absent, fall back to the legacy per-category `followCarRules` map
 * and return true if ANY moto category was enabled.
 */
export const readFollowCarMotoEnabled = (
  limits: Record<string, unknown>,
): boolean => {
  const flag = limits[FOLLOW_CAR_LIMITS_KEY];
  if (typeof flag === "boolean") return flag;
  const raw =
    limits.followCarRules && typeof limits.followCarRules === "object"
      ? (limits.followCarRules as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(raw)) {
    if (!MOTO_LICENSE_CATEGORY_SET.has(key)) continue;
    if (
      value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).enabled === true
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Parse the follow-car config into the per-category map used across the matcher
 * and UI. Now derived from the single global flag (with legacy fallback), so a
 * moto category requires a follow car iff the school enabled the global rule.
 */
export const parseFollowCarRulesFromLimits = (
  limits: Record<string, unknown>,
): FollowCarRules => followCarRulesForEnabled(readFollowCarMotoEnabled(limits));

/** True when a lesson for `category` must additionally reserve a follow car. */
export const requiresFollowCar = (
  rules: FollowCarRules,
  category: string | null | undefined,
): boolean => {
  if (!category || !MOTO_LICENSE_CATEGORY_SET.has(category)) return false;
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
