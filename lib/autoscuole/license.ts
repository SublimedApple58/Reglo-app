/**
 * License categories & transmission — shared taxonomy for the Vehicles module.
 *
 * A student in PRATICA pursues one license (category + transmission); a vehicle
 * serves exactly one (category + transmission). The slot matcher pairs a student
 * only with an instructor whose vehicle matches BOTH dimensions — but only when
 * the Vehicles module is enabled (`vehiclesEnabled`). When the module is off, the
 * path is informational only and no matching logic applies.
 *
 * NB: "A" is the full motorcycle license in Italy (there is no "A3").
 */

export const LICENSE_CATEGORIES = [
  "B",
  "BE",
  "C",
  "CE",
  "D",
  "DE",
  "AM",
  "A1",
  "A2",
  "A",
] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];

export const TRANSMISSIONS = ["manual", "automatic"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

/**
 * License paths a student can pick for themselves at first access (REG-410).
 * A realistic subset of LICENSE_CATEGORIES: the everyday car licence plus the
 * moto "A" family. Professional/trailer categories (BE/C/CE/D/DE) are set by
 * staff on the web, not chosen by the student. Order = display order in the gate.
 */
export const STUDENT_LICENSE_CATEGORIES = ["B", "AM", "A1", "A2", "A"] as const;
export type StudentLicenseCategory = (typeof STUDENT_LICENSE_CATEGORIES)[number];

export function isStudentLicenseCategory(
  value: unknown,
): value is StudentLicenseCategory {
  return (
    typeof value === "string" &&
    (STUDENT_LICENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export const LICENSE_CATEGORY_LABELS: Record<LicenseCategory, string> = {
  B: "B (auto)",
  BE: "BE (auto + rimorchio)",
  C: "C (camion)",
  CE: "CE (camion + rimorchio)",
  D: "D (autobus)",
  DE: "DE (autobus + rimorchio)",
  AM: "AM (ciclomotore)",
  A1: "A1 (125)",
  A2: "A2 (media)",
  A: "A (moto)",
};

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manual: "Manuale",
  automatic: "Automatico",
};

export function isLicenseCategory(value: unknown): value is LicenseCategory {
  return (
    typeof value === "string" &&
    (LICENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isTransmission(value: unknown): value is Transmission {
  return (
    typeof value === "string" &&
    (TRANSMISSIONS as readonly string[]).includes(value)
  );
}

/**
 * Motorcycle license categories — the "A" family only (BE/C/CE/D/DE are
 * non-moto like B). Used to give moto guides a dedicated colour in the agenda
 * (keyed off the assigned vehicle's category, like the automatic colour).
 */
export const MOTO_LICENSE_CATEGORIES = ["AM", "A1", "A2", "A"] as const;

export function isMotoLicenseCategory(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (MOTO_LICENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * License-path buckets (REG-426) — used to differentiate per-path settings such
 * as "chi prenota dall'app". Three groups so the professional categories are
 * NOT hidden under "auto":
 * - moto: AM · A1 · A2 · A
 * - auto: B · BE  (everyday car + trailer)
 * - pro:  C · CE · D · DE  (truck/bus, professional)
 */
export const LICENSE_PATH_BUCKETS = ["moto", "auto", "pro"] as const;
export type LicensePathBucket = (typeof LICENSE_PATH_BUCKETS)[number];

export const LICENSE_PATH_BUCKET_LABELS: Record<LicensePathBucket, string> = {
  moto: "Percorso moto",
  auto: "Percorso auto",
  pro: "Percorso professionali",
};

/** Short list of the categories in each bucket, for UI captions. */
export const LICENSE_PATH_BUCKET_CATEGORIES: Record<LicensePathBucket, string> = {
  moto: "AM · A1 · A2 · A",
  auto: "B · BE",
  pro: "C · CE · D · DE",
};

const PRO_LICENSE_CATEGORIES = new Set<string>(["C", "CE", "D", "DE"]);

/**
 * Map a license category to its path bucket. Unknown/empty → "auto" (the safe
 * default: the everyday car path, never accidentally moto or pro).
 */
export function licensePathBucket(value: unknown): LicensePathBucket {
  if (isMotoLicenseCategory(value)) return "moto";
  if (typeof value === "string" && PRO_LICENSE_CATEGORIES.has(value)) return "pro";
  return "auto";
}

/**
 * True when a vehicle of `vehicleCategory` is eligible for a student pursuing
 * `studentCategory`, applying the real-world MOTO HIERARCHY:
 *   AM < A1 < A2 < A
 * A moto student may train on any moto of category ≤ their own (e.g. an A2
 * student → A2, A1, AM — but NOT A). Non-moto categories (B, BE, C, CE, D, DE)
 * have NO hierarchy: each only matches itself (a BE course needs a BE-marked
 * vehicle). Cross-class never matches. Same category always matches.
 */
export function licenseCategoryEligible(
  vehicleCategory: string,
  studentCategory: string,
): boolean {
  if (vehicleCategory === studentCategory) return true;
  const vMoto = isMotoLicenseCategory(vehicleCategory);
  const sMoto = isMotoLicenseCategory(studentCategory);
  if (vMoto && sMoto) {
    return (
      (MOTO_LICENSE_CATEGORIES as readonly string[]).indexOf(vehicleCategory) <=
      (MOTO_LICENSE_CATEGORIES as readonly string[]).indexOf(studentCategory)
    );
  }
  // Different classes (moto vs non-moto), or two distinct non-moto categories
  // (e.g. B vs C, BE vs B) — never eligible.
  return false;
}

/**
 * True when a vehicle's (category, transmission) serves a student's pursued
 * license. Category uses the moto hierarchy (`licenseCategoryEligible`);
 * transmission must still match exactly. Null/absent on either side is treated
 * permissively (no constraint) so incomplete data never blocks a booking; in
 * practice both are always set.
 */
export function vehicleServesLicense(
  vehicle: { licenseCategory?: string | null; transmission?: string | null },
  student: { licenseCategory?: string | null; transmission?: string | null },
): boolean {
  if (!student.licenseCategory || !student.transmission) return true;
  if (!vehicle.licenseCategory || !vehicle.transmission) return true;
  if (vehicle.transmission !== student.transmission) return false;
  return licenseCategoryEligible(vehicle.licenseCategory, student.licenseCategory);
}
