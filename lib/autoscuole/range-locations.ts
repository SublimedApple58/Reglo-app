/**
 * Luogo delle fasce di disponibilità (REG-705c).
 *
 * Una fascia (`{ startMinutes, endMinutes }` nei JSON `ranges` / `rangesByDay`
 * di `AutoscuolaWeeklyAvailability` e `ranges` di
 * `AutoscuolaDailyAvailabilityOverride`) può portare un `locationId`: vale
 * allora solo per gli allievi di quel luogo. Senza = tutti i luoghi.
 *
 * Tutti i punti che SCRIVONO fasce passano da `sanitizeRangeLocations`: tiene
 * il luogo solo se è un luogo attivo dell'autoscuola e se il proprietario è un
 * istruttore (i veicoli non hanno luoghi), e lo omette quando è vuoto così il
 * JSON resta identico a prima per chi non usa la funzione.
 */

import { z } from "zod";

import { prisma } from "@/db/prisma";

export type LocatedRange = {
  startMinutes: number;
  endMinutes: number;
  locationId?: string;
};

/** Schema zod di una fascia, con il luogo opzionale. */
export const locatedRangeSchema = z.object({
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
  locationId: z.string().uuid().nullable().optional(),
});

type RangeInput = { startMinutes: number; endMinutes: number; locationId?: string | null };

/** Pura: applica l'insieme dei luoghi validi (o nessuno) a una lista di fasce. */
export function applyRangeLocations(
  ranges: readonly RangeInput[],
  validLocationIds: ReadonlySet<string> | null,
): LocatedRange[] {
  return ranges.map((r) => {
    const out: LocatedRange = { startMinutes: r.startMinutes, endMinutes: r.endMinutes };
    if (validLocationIds && r.locationId && validLocationIds.has(r.locationId)) {
      out.locationId = r.locationId;
    }
    return out;
  });
}

/** Luogo di una fascia letta dal database (JSON non tipizzato). */
export function rangeLocationId(range: unknown): string | null {
  if (!range || typeof range !== "object") return null;
  const id = (range as { locationId?: unknown }).locationId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Insieme dei luoghi validi per le fasce di questo proprietario: `null` per i
 * veicoli (nessun luogo ammesso) o se nessuna fascia ne chiede uno (niente
 * query).
 */
export async function loadValidRangeLocationIds(
  companyId: string,
  ownerType: string,
  anyRequested: boolean,
): Promise<ReadonlySet<string> | null> {
  if (ownerType !== "instructor" || !anyRequested) return null;
  const rows = await prisma.autoscuolaLocation.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/**
 * Sanifica in un colpo tutte le liste di fasce di una scrittura (fasce
 * condivise, mappa per giorno, override del giorno).
 */
export async function sanitizeRangeLocations<T extends Record<string, readonly RangeInput[]>>(
  companyId: string,
  ownerType: string,
  groups: T,
): Promise<{ [K in keyof T]: LocatedRange[] }> {
  const anyRequested = Object.values(groups).some((list) => list.some((r) => !!r.locationId));
  const valid = await loadValidRangeLocationIds(companyId, ownerType, anyRequested);
  const out = {} as { [K in keyof T]: LocatedRange[] };
  for (const key of Object.keys(groups) as (keyof T)[]) {
    out[key] = applyRangeLocations(groups[key], valid);
  }
  return out;
}

/** Stessa cosa per una mappa per giorno `{ "1": [...], ... }`. */
export async function sanitizeScheduleByDayLocations(
  companyId: string,
  ownerType: string,
  scheduleByDay: Record<string, readonly RangeInput[]>,
  extra: readonly RangeInput[] = [],
): Promise<{ scheduleByDay: Record<string, LocatedRange[]>; extra: LocatedRange[] }> {
  const all = [...Object.values(scheduleByDay).flat(), ...extra];
  const valid = await loadValidRangeLocationIds(
    companyId,
    ownerType,
    all.some((r) => !!r.locationId),
  );
  const map: Record<string, LocatedRange[]> = {};
  for (const [day, list] of Object.entries(scheduleByDay)) {
    map[day] = applyRangeLocations(list, valid);
  }
  return { scheduleByDay: map, extra: applyRangeLocations(extra, valid) };
}
