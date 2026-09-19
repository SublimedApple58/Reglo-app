/**
 * Luogo precompilato in creazione guida (REG-409).
 *
 * Il titolare assegna ogni tipo di patente a un luogo (Impostazioni → Sede e
 * luoghi); creando una guida il campo "Luogo" si precompila di conseguenza.
 *
 * PRECEDENZA (dal più specifico al più generico):
 *   1. luogo di default dell'ALLIEVO (REG-392, `CompanyMember.defaultLocationId`)
 *   2. luogo assegnato alla PATENTE della guida (questo modulo)
 *   3. SEDE dell'autoscuola (`isDefault`)
 *
 * Il "tipo guida" è determinato da allievo + veicolo: quando un veicolo è
 * selezionato vince la sua categoria (gerarchia moto — un allievo A2 che guida
 * una moto A1 fa una guida A1), altrimenti si usa il percorso dell'allievo.
 *
 * Modulo PURO e client-safe: nessun accesso al DB, usato sia dall'agenda web
 * sia (in futuro) dal mobile sulla stessa shape di `GET /api/autoscuole/locations`.
 */

/** Sottoinsieme di `AutoscuolaLocation` che serve al resolver. */
export type LicenseAwareLocation = {
  id: string;
  isDefault: boolean;
  licenseCategories?: string[] | null;
};

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

/**
 * Luogo assegnato a una categoria patente. `null` se la categoria non è
 * assegnata a nessun luogo. In caso di doppia assegnazione (possibile solo per
 * una scrittura concorrente: l'esclusività è applicata lato scrittura) vince il
 * primo della lista, che arriva già ordinata `isDefault desc, name asc` → esito
 * deterministico invece che casuale.
 */
export function locationIdForLicenseCategory(
  locations: readonly LicenseAwareLocation[],
  category: string | null | undefined,
): string | null {
  if (!category) return null;
  const wanted = category.trim().toUpperCase();
  if (!wanted) return null;
  for (const loc of locations) {
    const categories = loc.licenseCategories ?? [];
    if (categories.some((c) => c.trim().toUpperCase() === wanted)) return loc.id;
  }
  return null;
}

export type ResolveLocationInput = {
  /** Luoghi attivi della company (ordine: `isDefault desc, name asc`). */
  locations: readonly LicenseAwareLocation[];
  /** `CompanyMember.defaultLocationId` dell'allievo selezionato (REG-392). */
  studentDefaultLocationId?: string | null;
  student?: { licenseCategory?: string | null } | null;
  vehicle?: { licenseCategory?: string | null } | null;
};

/**
 * Luogo da precompilare nel form di creazione guida. Restituisce `null` solo se
 * la company non ha nemmeno la sede (caso di onboarding non completato).
 */
export function resolvePrefilledLocationId({
  locations,
  studentDefaultLocationId,
  student,
  vehicle,
}: ResolveLocationInput): string | null {
  // 1. Default dell'allievo — solo se il luogo esiste ancora (può essere stato
  //    archiviato dopo l'assegnazione).
  if (
    studentDefaultLocationId &&
    locations.some((l) => l.id === studentDefaultLocationId)
  ) {
    return studentDefaultLocationId;
  }

  // 2. Luogo del tipo di patente della guida.
  const byLicense = locationIdForLicenseCategory(
    locations,
    lessonLicenseCategory(student, vehicle),
  );
  if (byLicense) return byLicense;

  // 3. Sede.
  return locations.find((l) => l.isDefault)?.id ?? null;
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
   * Categorie patente dei veicoli della guida: il veicolo condiviso
   * (kind="standard") o la flotta di moto (kind="moto"). **Non** l'auto al
   * seguito: è un accessorio di categoria B e manderebbe ogni gruppo moto al
   * luogo della B.
   */
  licenseCategories?: readonly (string | null | undefined)[];
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
 * Luogo da precompilare creando una guida di GRUPPO. Stessa precedenza della
 * guida singola (`resolvePrefilledLocationId`), letta al plurale:
 *
 *   1. default degli ALLIEVI pre-inseriti — solo se sono tutti d'accordo
 *      (chi non ha un default non conta) e il luogo esiste ancora;
 *   2. luogo della PATENTE della guida — solo se i veicoli portano tutti allo
 *      stesso luogo (flotta moto mista → categorie che puntano altrove);
 *   3. SEDE.
 *
 * Il criterio dell'unanimità vale per entrambi i passi: a preferenze in
 * conflitto si scende al gradino dopo invece di scegliere a caso. Il luogo
 * resta sempre modificabile a mano.
 */
export function resolveGroupPrefilledLocationId({
  locations,
  studentDefaultLocationIds = [],
  licenseCategories = [],
}: ResolveGroupLocationInput): string | null {
  // 1. Default degli allievi.
  const sharedDefault = unanimous(studentDefaultLocationIds);
  if (sharedDefault && locations.some((l) => l.id === sharedDefault)) {
    return sharedDefault;
  }

  // 2. Luogo della patente, se i veicoli concordano.
  const byLicense = unanimous(
    licenseCategories.map((c) => locationIdForLicenseCategory(locations, c)),
  );
  if (byLicense) return byLicense;

  // 3. Sede.
  return locations.find((l) => l.isDefault)?.id ?? null;
}
