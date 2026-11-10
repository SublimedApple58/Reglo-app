/** REG-656: indirizzo per «Usa la mia posizione attuale» (`/api/places/nearby`). */

/**
 * Fra i luoghi più vicini (in ordine di distanza) il primo con via e numero
 * («Via Roma, 42, …»); poi il primo con almeno la via; altrimenti il primo. Il
 * più vicino in assoluto a volte è solo la zona («20123 Milano MI, Italia»).
 */
export function pickStreetAddress(addresses: Array<string | undefined>): string | null {
  const list = addresses.filter((a): a is string => !!a?.trim());
  return (
    list.find((a) => /^[^\d,][^,]*,\s*\d+[a-zA-Z]?\s*,/.test(a)) ??
    list.find((a) => /^[^\d,]/.test(a) && a.split(",").length >= 3) ??
    list[0] ??
    null
  );
}

/**
 * Road novembre R3: dalla riga d'indirizzo il solo nome della via
 * («Via Roma, 42, 20123 Milano…» → «Via Roma»); null se è solo la zona.
 */
export function streetFromAddress(address: string | null | undefined): string | null {
  const first = address?.split(",")[0]?.trim();
  if (!first || /^\d/.test(first)) return null;
  return first.slice(0, 120);
}
