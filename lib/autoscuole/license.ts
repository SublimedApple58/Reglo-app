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
  "C1",
  "C1E",
  "CE",
  "D",
  "D1",
  "D1E",
  "DE",
  "CQC",
  "ADR",
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
  C1: "C1 (camion fino a 7,5 t)",
  C1E: "C1E (C1 + rimorchio)",
  CE: "CE (camion + rimorchio)",
  D: "D (autobus)",
  D1: "D1 (minibus)",
  D1E: "D1E (D1 + rimorchio)",
  DE: "DE (autobus + rimorchio)",
  CQC: "CQC (qualificazione)",
  ADR: "ADR (merci pericolose)",
  AM: "AM (ciclomotore)",
  A1: "A1 (125)",
  A2: "A2 (media)",
  A: "A (moto)",
};

/**
 * Categorie usate dal CONSORZIO (patenti superiori + qualificazioni): pilotano
 * i picker allievi/veicoli del consorzio e la tabella tariffe in Impostazioni →
 * Prenotazioni e allievi → Prezzi. CQC e ADR non sono patenti ma qualificazioni:
 * le modelliamo come pseudo-categorie per non introdurre una seconda dimensione
 * su allievi/veicoli/tariffe. I picker delle autoscuole normali e del mobile
 * restano su B/BE + moto: le categorie superiori NON devono comparire lì.
 * La BE (auto + rimorchio) c'è anche qui: i consorzi la fanno con i loro
 * rimorchi (REG-456). Ordine = ordine di visualizzazione nella tabella Prezzi.
 */
export const CONSORTIUM_LICENSE_CATEGORIES = [
  "BE",
  "C",
  "CE",
  "D",
  "DE",
  "C1",
  "D1",
  "CQC",
  "ADR",
] as const satisfies readonly LicenseCategory[];
export type ConsortiumLicenseCategory =
  (typeof CONSORTIUM_LICENSE_CATEGORIES)[number];

/** Titolo + descrizione per la tabella "Tariffa oraria per patente" (dal prototipo). */
export const CONSORTIUM_LICENSE_INFO: Record<
  ConsortiumLicenseCategory,
  { title: string; description: string }
> = {
  BE: { title: "Auto con rimorchio", description: "Autovettura con rimorchio oltre 750 kg." },
  C: { title: "Autocarro oltre 3,5 t", description: "Veicoli merci sopra le 3,5 tonnellate." },
  CE: { title: "Autoarticolato e autotreno", description: "Motrice con semirimorchio o rimorchio." },
  D: { title: "Autobus", description: "Trasporto persone oltre 8 posti." },
  DE: { title: "Autobus con rimorchio", description: "Autobus con rimorchio oltre 750 kg." },
  C1: { title: "Autocarro fino a 7,5 t", description: "Veicoli merci tra 3,5 e 7,5 tonnellate." },
  D1: { title: "Minibus fino a 16 posti", description: "Trasporto persone fino a 16 passeggeri." },
  CQC: { title: "Carta di qualificazione", description: "Corsi CQC merci e persone." },
  ADR: { title: "Trasporto merci pericolose", description: "Abilitazione ADR, base e specializzazioni." },
};

export function isConsortiumLicenseCategory(
  value: unknown,
): value is ConsortiumLicenseCategory {
  return (
    typeof value === "string" &&
    (CONSORTIUM_LICENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Le categorie storiche pre-consorzio (B/BE + superiori "piene" + moto): i
 * picker delle autoscuole normali restano su questa lista per non far comparire
 * all'improvviso C1/CQC/ADR fuori dal contesto consorzio.
 */
export const AUTOSCUOLA_LICENSE_CATEGORIES = [
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
] as const satisfies readonly LicenseCategory[];

/**
 * Lista categorie per i picker UI in base alla modalità della company:
 * consorzio → BE + superiori + qualificazioni; autoscuola → lista storica.
 */
export function licenseCategoriesForMode(
  consortium: boolean,
): readonly LicenseCategory[] {
  return consortium ? CONSORTIUM_LICENSE_CATEGORIES : AUTOSCUOLA_LICENSE_CATEGORIES;
}

/**
 * Le stesse categorie di `licenseCategoriesForMode`, raggruppate per famiglia:
 * serve ai picker che mostrano TUTTE le patenti insieme (assegnazione luogo →
 * tipi di patente, REG-409), dove una lista piatta di 10-16 chip è illeggibile.
 * I gruppi vuoti per la modalità corrente non vengono restituiti.
 */
const LICENSE_CATEGORY_GROUP_DEFS: Array<{
  label: string;
  categories: readonly LicenseCategory[];
}> = [
  { label: "Auto", categories: ["B", "BE"] },
  { label: "Moto", categories: ["AM", "A1", "A2", "A"] },
  { label: "Camion", categories: ["C", "CE", "C1", "C1E"] },
  { label: "Autobus", categories: ["D", "DE", "D1", "D1E"] },
  { label: "Qualificazioni", categories: ["CQC", "ADR"] },
];

export function licenseCategoryGroupsForMode(
  consortium: boolean,
): Array<{ label: string; categories: LicenseCategory[] }> {
  const allowed = new Set<string>(licenseCategoriesForMode(consortium));
  return LICENSE_CATEGORY_GROUP_DEFS.map((group) => ({
    label: group.label,
    categories: group.categories.filter((c) => allowed.has(c)),
  })).filter((group) => group.categories.length > 0);
}

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

const PRO_LICENSE_CATEGORIES = new Set<string>([
  "C",
  "C1",
  "C1E",
  "CE",
  "D",
  "D1",
  "D1E",
  "DE",
  "CQC",
  "ADR",
]);

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
 * Motrice (towing vehicle) of each trailer category — REG-507.
 *
 * A trailer is NOT a drivable vehicle: no engine, no driving position, no
 * availability of its own. A truck **is** a C vehicle and **becomes** an
 * autotreno (CE) when a trailer is hitched to it. So a fleet records motrici,
 * and a CE course must be able to run on the C truck the school actually owns.
 *
 * Until 2026-09-22 it could not: BE/C/CE/D/DE were added (commit `6c83277`,
 * 02/07/2026) inside the branch written for "B only matches B" — correct for B,
 * inherited without discussion by the professional categories. The Prisma
 * schema comment still described a world of `B | AM | A1 | A2 | A` months
 * later. In production that left the consorzio with 2 CE students and 0 usable
 * vehicles, while another school had mislabelled its own truck as "CE" to work
 * around it.
 */
const TRAILER_CATEGORY_MOTRICE: Record<string, string> = {
  BE: "B",
  C1E: "C1",
  CE: "C",
  D1E: "D1",
  DE: "D",
};

/**
 * True when a vehicle of `vehicleCategory` is eligible for a student pursuing
 * `studentCategory`, applying two real-world hierarchies:
 *
 *   MOTO:    AM < A1 < A2 < A
 *   TRAILER: B < BE · C1 < C1E · C < CE · D1 < D1E · D < DE
 *
 * A moto student may train on any moto of category ≤ their own (an A2 student →
 * A2, A1, AM — but NOT A). A trailer student may train on the corresponding
 * motrice (a CE student → a C truck) or on a vehicle already marked with the
 * trailer category.
 *
 * Both hierarchies run **one way only**: a C student may NOT use a CE-marked
 * vehicle, because driving a combination requires the CE licence. Only the
 * motrici that make sense for that category — never "any vehicle".
 *
 * Cross-class never matches. Same category always matches.
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
  // Trailer course on its motrice: CE → C, DE → D, BE → B, …
  if (TRAILER_CATEGORY_MOTRICE[studentCategory] === vehicleCategory) return true;
  // Different classes (moto vs non-moto), or two unrelated non-moto categories
  // (e.g. B vs C, or a C student on a CE vehicle) — never eligible.
  return false;
}

/** The motrice category a trailer course can also run on, if any. */
export function motriceCategoryFor(category: string): string | null {
  return TRAILER_CATEGORY_MOTRICE[category] ?? null;
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
