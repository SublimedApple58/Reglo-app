/**
 * REG-705 — nome del luogo dentro le fasce di disponibilità dell'agenda web.
 *
 * Il nome va in testa alla fascia; se una guida ne copre l'inizio scende nel
 * primo tratto libero della fascia alto almeno `minPx`. Se la fascia è tutta
 * occupata non si scrive (resta il tooltip della fascia).
 */
export type MinuteInterval = { startMinutes: number; endMinutes: number };

export function bandLabelStartMinutes(
  band: MinuteInterval,
  occupied: readonly MinuteInterval[],
  pixelsPerMinute: number,
  minPx = 16,
): number | null {
  const inside = occupied
    .filter((o) => o.endMinutes > band.startMinutes && o.startMinutes < band.endMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  let cursor = band.startMinutes;
  for (const o of inside) {
    if ((o.startMinutes - cursor) * pixelsPerMinute >= minPx) return cursor;
    cursor = Math.max(cursor, o.endMinutes);
  }
  return (band.endMinutes - cursor) * pixelsPerMinute >= minPx ? cursor : null;
}

/** Testo della fascia: il luogo, oppure «Tutti i luoghi» per la fascia senza luogo. */
export const bandLocationLabel = (locationName: string | null) => locationName ?? "Tutti i luoghi";
