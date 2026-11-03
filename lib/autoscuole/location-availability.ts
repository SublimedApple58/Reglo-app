/**
 * Disponibilità per luogo (REG-705) — regole pure, senza database.
 *
 * Con l'interruttore «Disponibilità per luogo» acceso (Impostazioni → Sede e
 * luoghi):
 * - ogni fascia oraria dell'istruttore può avere un luogo (`range.locationId`);
 *   una fascia SENZA luogo vale per tutti i luoghi;
 * - ogni allievo può avere più luoghi (`CompanyMemberLocation`); un allievo
 *   SENZA luoghi vede tutti i luoghi;
 * - l'allievo vede una fascia se è senza luogo o se il suo luogo è tra i suoi;
 * - tra due guide consecutive dello stesso istruttore in luoghi diversi si può
 *   imporre una pausa minima (`locationChangeBuffer*`).
 *
 * Con l'interruttore spento nessuna di queste regole si applica: i luoghi
 * delle fasce e degli allievi restano in database e tornano identici
 * riaccendendo, come per «Luoghi diversi per tipo di patente».
 *
 * Setting per autoscuola nel JSON `CompanyService.limits`:
 * - `availabilityByLocation`         (boolean, default false)
 * - `locationChangeBufferEnabled`    (boolean, default false)
 * - `locationChangeBufferMinutes`    (int 5..120 a passi di 5, default 30)
 */

export const DEFAULT_LOCATION_CHANGE_BUFFER_MINUTES = 30;
export const LOCATION_CHANGE_BUFFER_MIN_MINUTES = 5;
export const LOCATION_CHANGE_BUFFER_MAX_MINUTES = 120;
export const LOCATION_CHANGE_BUFFER_STEP_MINUTES = 5;

/** Servono almeno due luoghi perché «per luogo» voglia dire qualcosa. */
export const MIN_LOCATIONS_FOR_AVAILABILITY_BY_LOCATION = 2;

type LimitsLike = Record<string, unknown> | null | undefined;

/** Valore salvato dell'interruttore (false se mai toccato). */
export function readAvailabilityByLocation(limits: LimitsLike): boolean {
  return limits?.availabilityByLocation === true;
}

/**
 * Stato effettivo: acceso solo se salvato acceso E l'autoscuola ha ancora
 * almeno due luoghi attivi. Archiviando i luoghi fino a restare con la sola
 * sede la funzione si spegne da sé, senza che nessuno debba ricordarsene.
 */
export function availabilityByLocationEnabled(
  stored: unknown,
  activeLocationCount: number,
): boolean {
  return (
    stored === true &&
    activeLocationCount >= MIN_LOCATIONS_FOR_AVAILABILITY_BY_LOCATION
  );
}

export function normalizeLocationChangeBufferMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LOCATION_CHANGE_BUFFER_MINUTES;
  }
  const stepped =
    Math.round(value / LOCATION_CHANGE_BUFFER_STEP_MINUTES) *
    LOCATION_CHANGE_BUFFER_STEP_MINUTES;
  return Math.min(
    LOCATION_CHANGE_BUFFER_MAX_MINUTES,
    Math.max(LOCATION_CHANGE_BUFFER_MIN_MINUTES, stepped),
  );
}

export type LocationAvailabilitySettings = {
  /** Valore salvato; lo stato effettivo dipende anche dai luoghi attivi. */
  availabilityByLocation: boolean;
  locationChangeBufferEnabled: boolean;
  locationChangeBufferMinutes: number;
};

export function readLocationAvailabilitySettings(
  limits: LimitsLike,
): LocationAvailabilitySettings {
  return {
    availabilityByLocation: readAvailabilityByLocation(limits),
    locationChangeBufferEnabled: limits?.locationChangeBufferEnabled === true,
    locationChangeBufferMinutes: normalizeLocationChangeBufferMinutes(
      limits?.locationChangeBufferMinutes,
    ),
  };
}

/**
 * Pausa effettiva tra luoghi diversi, in minuti: 0 se la funzione è spenta o
 * la pausa non è attiva.
 */
export function effectiveLocationChangeBufferMinutes(
  settings: LocationAvailabilitySettings,
  enabled: boolean,
): number {
  if (!enabled || !settings.locationChangeBufferEnabled) return 0;
  return settings.locationChangeBufferMinutes;
}

/**
 * I luoghi entro cui l'allievo può prenotare. `null` = nessun vincolo (funzione
 * spenta, oppure allievo senza luoghi assegnati → vede tutti i luoghi).
 */
export function studentLocationScope(
  enabled: boolean,
  assignedLocationIds: readonly string[],
): ReadonlySet<string> | null {
  if (!enabled || assignedLocationIds.length === 0) return null;
  return new Set(assignedLocationIds);
}

/** Una fascia (o un suo luogo) vale per l'allievo? Senza luogo = per tutti. */
export function rangeServesStudent(
  rangeLocationId: string | null | undefined,
  scope: ReadonlySet<string> | null,
): boolean {
  if (!scope) return true;
  if (!rangeLocationId) return true;
  return scope.has(rangeLocationId);
}

/**
 * Normalizza la lista dei luoghi di un allievo e il suo luogo principale
 * (REG-392) tenendo l'invariante: se l'allievo ha dei luoghi, il principale è
 * uno di questi.
 *
 * - `locationIds` deduplicati, nell'ordine dei luoghi attivi (`orderedActiveIds`:
 *   sede prima, poi nome), scartando quelli non più attivi;
 * - principale richiesto (`preferredDefaultId`) tenuto se è tra i luoghi;
 *   altrimenti il primo luogo; senza luoghi resta quello richiesto (solo
 *   precompilazione, non limita niente).
 */
export function normalizeMemberLocations(params: {
  locationIds: readonly string[];
  preferredDefaultId: string | null;
  orderedActiveIds: readonly string[];
}): { locationIds: string[]; defaultLocationId: string | null } {
  const wanted = new Set(params.locationIds);
  const locationIds = params.orderedActiveIds.filter((id) => wanted.has(id));
  const preferred =
    params.preferredDefaultId &&
    params.orderedActiveIds.includes(params.preferredDefaultId)
      ? params.preferredDefaultId
      : null;
  if (locationIds.length === 0) {
    return { locationIds, defaultLocationId: preferred };
  }
  return {
    locationIds,
    defaultLocationId:
      preferred && locationIds.includes(preferred) ? preferred : locationIds[0],
  };
}
