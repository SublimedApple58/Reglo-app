/**
 * Luogo precompilato in creazione guida (REG-409, rivisto in REG-725).
 *
 * Il titolare assegna a ogni luogo i tipi di patente che fa e, per ognuno, il
 * CAMBIO (Impostazioni → Sede e luoghi). La stessa patente può stare in più
 * luoghi (REG-725: è caduta l'esclusività di REG-409). Creando una guida il
 * campo "Luogo" si precompila con un luogo COMPATIBILE con patente e cambio
 * della guida.
 *
 * PRECEDENZA (decisioni di Tiziano, 05/11/2026):
 *   1. luogo principale dell'ALLIEVO (`CompanyMember.defaultLocationId`), se compatibile
 *   2. l'UNICO compatibile tra gli altri luoghi dell'allievo (REG-705)
 *   3. l'UNICO luogo compatibile dell'autoscuola
 *   4. più compatibili: la SEDE se è tra questi, altrimenti NESSUNA precompilazione
 *      (il campo resta vuoto e la UI mette i compatibili in cima)
 *   5. nessun compatibile: la SEDE
 *
 * «Compatibile»: il luogo ha la patente e il cambio (patente senza cambio
 * indicato = entrambi). Una patente che NON è assegnata a nessun luogo vale
 * ovunque: così chi non usa la funzione (o non ha assegnato quella patente)
 * resta esattamente al comportamento di prima — default dell'allievo, poi sede.
 *
 * La patente della guida è quella del veicolo quando è scelto (un allievo A2
 * su una moto A1 fa una guida A1), altrimenti il percorso dell'allievo. Lo
 * stesso per il cambio.
 *
 * Modulo PURO e client-safe: nessun accesso al DB. Usato dall'agenda web, dal
 * dialog guide di gruppo e dai resolver server-side; il mobile ne ha una copia
 * 1:1 in `reglo-mobile/src/utils/locationForLicense.ts` (stessi casi di test).
 */

export type LessonTransmission = "manual" | "automatic";

/** Sottoinsieme di `AutoscuolaLocation` che serve al resolver. */
export type LicenseAwareLocation = {
  id: string;
  isDefault: boolean;
  licenseCategories?: string[] | null;
  /**
   * REG-725: cambio per patente, `{ "B": "automatic" }`. Patente assente =
   * entrambi i cambi. Arriva dal DB come JSON, quindi è letto con prudenza.
   */
  licenseTransmissions?: unknown;
};

/** La patente della guida, già normalizzata, con il suo cambio (null = ignoto). */
export type LessonLicense = {
  category: string;
  transmission: LessonTransmission | null;
};

/**
 * Qualificazioni che non sono patenti (consorzi): per loro il cambio non ha
 * senso, la UI non lo chiede e il resolver lo ignora.
 */
export const TRANSMISSIONLESS_CATEGORIES: readonly string[] = ["CQC", "ADR"];

function normalizeCategory(value: string | null | undefined): string | null {
  const v = value?.trim().toUpperCase();
  return v ? v : null;
}

function normalizeTransmission(value: unknown): LessonTransmission | null {
  return value === "manual" || value === "automatic" ? value : null;
}

/**
 * La mappa dei cambi di un luogo, ripulita: solo valori validi, chiavi
 * maiuscole. Tutto il resto (null, array, stringhe) è «nessuna restrizione».
 */
export function parseLicenseTransmissions(
  value: unknown,
): Record<string, LessonTransmission> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, LessonTransmission> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const category = normalizeCategory(key);
    const transmission = normalizeTransmission(raw);
    if (category && transmission) out[category] = transmission;
  }
  return out;
}

/**
 * Categoria patente della guida: quella del VEICOLO se ne è stato scelto uno
 * (è il veicolo a definire che guida è), altrimenti il percorso dell'allievo.
 * `null` quando nessuna delle due è nota.
 */
export function lessonLicenseCategory(
  student: { licenseCategory?: string | null } | null | undefined,
  vehicle: { licenseCategory?: string | null } | null | undefined,
): string | null {
  const fromVehicle = vehicle?.licenseCategory?.trim();
  if (fromVehicle) return fromVehicle;
  const fromStudent = student?.licenseCategory?.trim();
  return fromStudent || null;
}

/** Cambio della guida: stessa regola della patente (veicolo, poi allievo). */
export function lessonTransmission(
  student: { transmission?: string | null } | null | undefined,
  vehicle: { transmission?: string | null } | null | undefined,
): LessonTransmission | null {
  return (
    normalizeTransmission(vehicle?.transmission) ??
    normalizeTransmission(student?.transmission)
  );
}

/** Patente + cambio della guida; `null` se la patente non è nota. */
export function lessonLicense(
  student: { licenseCategory?: string | null; transmission?: string | null } | null | undefined,
  vehicle: { licenseCategory?: string | null; transmission?: string | null } | null | undefined,
): LessonLicense | null {
  // Il cambio segue la stessa fonte della patente: un veicolo scelto definisce
  // entrambi; senza veicolo valgono quelli dell'allievo.
  const category = normalizeCategory(lessonLicenseCategory(student, vehicle));
  if (!category) return null;
  const fromVehicle = normalizeCategory(vehicle?.licenseCategory);
  const transmission = fromVehicle
    ? normalizeTransmission(vehicle?.transmission) ?? normalizeTransmission(student?.transmission)
    : normalizeTransmission(student?.transmission);
  return { category, transmission };
}

/** Il luogo fa questa patente con questo cambio? (cambio ignoto = qualsiasi) */
export function locationServesLicense(
  location: LicenseAwareLocation,
  license: LessonLicense,
): boolean {
  const categories = (location.licenseCategories ?? []).map(normalizeCategory);
  if (!categories.includes(license.category)) return false;
  if (!license.transmission || TRANSMISSIONLESS_CATEGORIES.includes(license.category)) return true;
  const only = parseLicenseTransmissions(location.licenseTransmissions)[license.category];
  return !only || only === license.transmission;
}

/** La patente è assegnata ad almeno un luogo (a prescindere dal cambio)? */
function isAssignedAnywhere(
  locations: readonly LicenseAwareLocation[],
  category: string,
): boolean {
  return locations.some((l) =>
    (l.licenseCategories ?? []).some((c) => normalizeCategory(c) === category),
  );
}

/**
 * Gli id dei luoghi compatibili con TUTTE le patenti date, nell'ordine della
 * lista (`isDefault desc, name asc`). Una patente non assegnata a nessun luogo
 * non restringe niente. `filtered` dice se almeno una patente ha ristretto la
 * scelta: è il segnale per la UI di mostrare la sezione «Fanno …» in cima.
 */
export function compatibleLocations(
  locations: readonly LicenseAwareLocation[],
  licenses: readonly LessonLicense[],
): { ids: string[]; filtered: boolean } {
  const restricting = licenses.filter((l) => isAssignedAnywhere(locations, l.category));
  if (!restricting.length) return { ids: locations.map((l) => l.id), filtered: false };
  return {
    ids: locations
      .filter((loc) => restricting.every((lic) => locationServesLicense(loc, lic)))
      .map((l) => l.id),
    filtered: true,
  };
}

// ─── L'interruttore «Luoghi diversi per tipo di patente» ─────────────────────
// L'assegnazione delle patenti ai luoghi è OPZIONALE (ottobre 2026). Quando
// l'interruttore è spento patenti e cambi assegnati **restano salvati** ma non
// si leggono: spegnere un'impostazione non cancella dati, e riaccendendola si
// ritrova tutto com'era.
//
// La regola è applicata in un punto solo per ogni lettore — chi carica i luoghi
// li passa da `withoutLicenseCategories` — così nessun consumatore deve
// ricordarsi del flag. Vedi `lib/autoscuole/locations.ts`.

/**
 * Stato effettivo dell'interruttore. `stored` è `limits.locationsByLicense`:
 * quando manca (nessuno l'ha mai toccato) si deduce dal dato, così le
 * autoscuole che avevano già assegnato delle patenti continuano a comportarsi
 * come prima senza bisogno di toccare loro i dati.
 */
export function locationsByLicenseEnabled(
  stored: unknown,
  locations: readonly LicenseAwareLocation[],
): boolean {
  if (typeof stored === "boolean") return stored;
  return locations.some((l) => (l.licenseCategories ?? []).length > 0);
}

/** Gli stessi luoghi, senza patenti né cambi assegnati. Non tocca il database. */
export function withoutLicenseCategories<T extends LicenseAwareLocation>(
  locations: readonly T[],
): T[] {
  return locations.map((l) => ({ ...l, licenseCategories: [], licenseTransmissions: {} }));
}

export type PrefilledLocation = {
  /** Luogo da precompilare; `null` = nessuna precompilazione (vedi `ambiguous`). */
  locationId: string | null;
  /** Più luoghi compatibili e la sede non è tra questi: si sceglie a mano. */
  ambiguous: boolean;
  /** Luoghi compatibili, nell'ordine della lista. */
  compatibleIds: string[];
  /** Le patenti della guida hanno ristretto la scelta (UI: «Fanno …» in cima). */
  filtered: boolean;
};

/**
 * Passi 3–5, comuni a guida singola e di gruppo. Senza restrizioni
 * (`filtered` falso: nessuna patente assegnata) è la regola di prima: sede.
 */
function pickFromCompatible(
  locations: readonly LicenseAwareLocation[],
  compatibleIds: readonly string[],
  filtered: boolean,
): { locationId: string | null; ambiguous: boolean } {
  const sede = locations.find((l) => l.isDefault)?.id ?? null;
  if (!filtered) return { locationId: sede, ambiguous: false };
  if (compatibleIds.length === 1) return { locationId: compatibleIds[0], ambiguous: false };
  if (compatibleIds.length > 1) {
    return sede && compatibleIds.includes(sede)
      ? { locationId: sede, ambiguous: false }
      : { locationId: null, ambiguous: true };
  }
  return { locationId: sede, ambiguous: false };
}

export type ResolveLocationInput = {
  /** Luoghi attivi della company (ordine: `isDefault desc, name asc`). */
  locations: readonly LicenseAwareLocation[];
  /** `CompanyMember.defaultLocationId` dell'allievo selezionato (REG-392). */
  studentDefaultLocationId?: string | null;
  /** I luoghi dell'allievo (REG-705, `CompanyMemberLocation`); vuoto = nessuno. */
  studentLocationIds?: readonly string[] | null;
  student?: { licenseCategory?: string | null; transmission?: string | null } | null;
  vehicle?: { licenseCategory?: string | null; transmission?: string | null } | null;
};

/** Luogo da precompilare nel form di creazione guida, con il perché. */
export function resolvePrefilledLocation({
  locations,
  studentDefaultLocationId,
  studentLocationIds,
  student,
  vehicle,
}: ResolveLocationInput): PrefilledLocation {
  const license = lessonLicense(student, vehicle);
  const { ids: compatibleIds, filtered } = compatibleLocations(
    locations,
    license ? [license] : [],
  );
  const compatible = new Set(compatibleIds);

  // 1. Principale dell'allievo, se compatibile (e se esiste ancora: un luogo
  //    archiviato non è nella lista, quindi non è nemmeno compatibile).
  if (studentDefaultLocationId && compatible.has(studentDefaultLocationId)) {
    return { locationId: studentDefaultLocationId, ambiguous: false, compatibleIds, filtered };
  }

  // 2. L'unico compatibile tra gli altri luoghi dell'allievo. Solo quando le
  //    patenti restringono la scelta: senza, vale la regola di prima.
  const ownCompatible = filtered
    ? (studentLocationIds ?? []).filter((id) => compatible.has(id))
    : [];
  if (ownCompatible.length === 1) {
    return { locationId: ownCompatible[0], ambiguous: false, compatibleIds, filtered };
  }

  // 3–5. I luoghi dell'autoscuola.
  return { ...pickFromCompatible(locations, compatibleIds, filtered), compatibleIds, filtered };
}

/**
 * Solo l'id da precompilare: `null` quando la scelta è ambigua o la company non
 * ha nemmeno la sede (onboarding non completato).
 */
export function resolvePrefilledLocationId(input: ResolveLocationInput): string | null {
  return resolvePrefilledLocation(input).locationId;
}

// ─── Guide di GRUPPO (REG-409, follow-up) ────────────────────────────────────
// Una guida di gruppo è UN evento in UN luogo, ma ha più allievi e (in moto)
// più veicoli: la precedenza della guida singola va letta al plurale.

export type ResolveGroupLocationInput = {
  /** Luoghi attivi della company (ordine: `isDefault desc, name asc`). */
  locations: readonly LicenseAwareLocation[];
  /**
   * `CompanyMember.defaultLocationId` degli allievi pre-inseriti (REG-392).
   * Chi non ne ha uno non esprime preferenza: non blocca gli altri.
   */
  studentDefaultLocationIds?: readonly (string | null | undefined)[];
  /**
   * Patente e cambio dei veicoli della guida: il veicolo condiviso
   * (kind="standard") o la flotta di moto (kind="moto"). **Non** l'auto al
   * seguito: è un accessorio di categoria B e manderebbe ogni gruppo moto al
   * luogo della B. Si accettano anche semplici stringhe (solo categoria).
   */
  licenseCategories?: readonly (
    | string
    | { licenseCategory?: string | null; transmission?: string | null }
    | null
    | undefined
  )[];
};

/**
 * L'unico valore su cui la lista è concorde, ignorando i vuoti. `null` se non
 * c'è nessun valore o se ce ne sono due diversi: con due preferenze in
 * conflitto nessuna delle due può vincere senza essere arbitraria.
 */
function unanimous(values: readonly (string | null | undefined)[]): string | null {
  let found: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (found === null) found = value;
    else if (found !== value) return null;
  }
  return found;
}

/**
 * Luogo da precompilare creando una guida di GRUPPO. Stessa regola della guida
 * singola, letta al plurale:
 *
 *   1. default degli ALLIEVI pre-inseriti — solo se sono tutti d'accordo
 *      (chi non ha un default non conta) e il luogo è compatibile;
 *   2. un luogo è compatibile se va bene per TUTTI i veicoli (flotta moto mista
 *      → serve un luogo che le faccia tutte);
 *   3–5. come la guida singola (unico compatibile → quello; più → sede o
 *      nessuno; nessuno → sede).
 */
export function resolveGroupPrefilledLocation({
  locations,
  studentDefaultLocationIds = [],
  licenseCategories = [],
}: ResolveGroupLocationInput): PrefilledLocation {
  const licenses: LessonLicense[] = [];
  for (const entry of licenseCategories) {
    const raw = typeof entry === "string" ? { licenseCategory: entry } : entry;
    const category = normalizeCategory(raw?.licenseCategory);
    if (!category) continue;
    const transmission = normalizeTransmission(raw?.transmission);
    if (!licenses.some((l) => l.category === category && l.transmission === transmission)) {
      licenses.push({ category, transmission });
    }
  }
  const { ids: compatibleIds, filtered } = compatibleLocations(locations, licenses);

  const sharedDefault = unanimous(studentDefaultLocationIds);
  if (sharedDefault && compatibleIds.includes(sharedDefault)) {
    return { locationId: sharedDefault, ambiguous: false, compatibleIds, filtered };
  }
  return { ...pickFromCompatible(locations, compatibleIds, filtered), compatibleIds, filtered };
}

export function resolveGroupPrefilledLocationId(
  input: ResolveGroupLocationInput,
): string | null {
  return resolveGroupPrefilledLocation(input).locationId;
}
