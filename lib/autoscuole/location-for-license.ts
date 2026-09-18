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
