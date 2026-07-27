/**
 * Fascia oraria ristretta come **priorità morbida** (non un muro).
 *
 * Quando un'autoscuola ha `restrictedTimeRangeEnabled` e l'allievo ha una
 * disponibilità dichiarata che si sovrappone alla fascia, la prenotazione da app
 * privilegia gli slot DENTRO la fascia. Ma se in un dato giorno non esiste alcuno
 * slot dentro la fascia, si ripiega mostrando anche quelli fuori (per-giorno),
 * così l'allievo non resta senza alcuna disponibilità visibile.
 *
 * Usato da `getAllAvailableSlots` e `getDateAvailabilityMap`
 * (lib/actions/autoscuole-availability.actions.ts).
 */

/**
 * True se uno slot che parte a `startMinutes` e dura `durationMinutes` (minuti dal
 * mezzanotte, ora locale) sta interamente dentro la fascia [rangeStartMin, rangeEndMin].
 */
export function isWithinRestrictedWindow(
  startMinutes: number,
  durationMinutes: number,
  rangeStartMin: number,
  rangeEndMin: number,
): boolean {
  return startMinutes >= rangeStartMin && startMinutes + durationMinutes <= rangeEndMin;
}

/**
 * Priorità morbida: se esiste almeno uno slot dentro la fascia restituisce SOLO
 * quelli; altrimenti (nessuno dentro) restituisce l'intera lista (fallback).
 * Preserva l'ordine originale.
 */
export function pickRestrictedWindowSlots<T extends { inRestrictedWindow: boolean }>(
  slots: T[],
): T[] {
  const inside = slots.filter((s) => s.inRestrictedWindow);
  return inside.length > 0 ? inside : slots;
}
