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

export const LICENSE_CATEGORIES = ["B", "AM", "A1", "A2", "A"] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];

export const TRANSMISSIONS = ["manual", "automatic"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const LICENSE_CATEGORY_LABELS: Record<LicenseCategory, string> = {
  B: "B (auto)",
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
 * Motorcycle license categories — every category except the car license "B".
 * Used to give moto guides a dedicated colour in the agenda (keyed off the
 * assigned vehicle's category, exactly like the automatic-transmission colour).
 */
export const MOTO_LICENSE_CATEGORIES = ["AM", "A1", "A2", "A"] as const;

export function isMotoLicenseCategory(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (MOTO_LICENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * True when a vehicle of `vehicleCategory` is eligible for a student pursuing
 * `studentCategory`, applying the real-world MOTO HIERARCHY:
 *   AM < A1 < A2 < A
 * A moto student may train on any moto of category ≤ their own (e.g. an A2
 * student → A2, A1, AM — but NOT A). The car license "B" is a separate class:
 * it only matches B. Car↔moto never match. Same category always matches.
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
  // Different classes (car vs moto), or two distinct cars — never eligible.
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
