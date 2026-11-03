/**
 * Motore di prenotazione per luogo (REG-705d) — regole pure + caricamento del
 * contesto di un allievo.
 *
 * Con «Disponibilità per luogo» accesa:
 * 1. **Filtro**: per le richieste di un allievo le fasce degli istruttori si
 *    vedono attraverso `scopeAvailabilityRecord`: restano solo quelle senza
 *    luogo o con un luogo dell'allievo (allievo senza luoghi = tutte). Tutti i
 *    controlli esistenti (`isOwnerAvailable`, `isAvailabilityCovering`, packing)
 *    lavorano sul record filtrato senza saperlo. Una guida sta sempre dentro
 *    UNA fascia, quindi non scavalca mai due luoghi.
 * 2. **Luogo della guida**: quello della fascia che la contiene
 *    (`locationOfCoveringRange`); se la fascia non ne ha uno vale la precedenza
 *    di sempre (default allievo → patente → sede).
 * 3. **Pausa tra luoghi**: uno start è scartato se l'istruttore ha una guida
 *    in un luogo DIVERSO a meno di N minuti prima o dopo
 *    (`violatesLocationChangeBuffer`). Guide senza luogo contano come la sede.
 */

import { prisma } from "@/db/prisma";

import { getCachedCompanyServiceLimits } from "./cached-service";
import {
  availabilityByLocationEnabled,
  effectiveLocationChangeBufferMinutes,
  readLocationAvailabilitySettings,
  rangeServesStudent,
  studentLocationScope,
} from "./location-availability";
import { getMemberLocationIds } from "./member-locations";

type Range = { startMinutes: number; endMinutes: number; locationId?: string | null };
type AvailabilityRecordLike = { daysOfWeek: number[]; ranges: Range[]; rangesByDay?: Record<number, Range[]> };

/** Il record con le sole fasce che valgono per l'allievo. `scope` null = tutto. */
export function scopeAvailabilityRecord<T extends AvailabilityRecordLike>(
  record: T | null | undefined,
  scope: ReadonlySet<string> | null,
): T | null {
  if (!record) return null;
  if (!scope) return record;
  const keep = (list: Range[]) => list.filter((r) => rangeServesStudent(r.locationId ?? null, scope));
  const ranges = keep(record.ranges);
  const rangesByDay = record.rangesByDay
    ? Object.fromEntries(Object.entries(record.rangesByDay).map(([d, list]) => [d, keep(list)]))
    : undefined;
  // I giorni senza fasce rimaste non sono più "attivi" per questo allievo.
  const daysOfWeek = rangesByDay
    ? record.daysOfWeek.filter((d) => (rangesByDay[d]?.length ?? 0) > 0)
    : ranges.length
      ? record.daysOfWeek
      : [];
  return { ...record, ranges, ...(rangesByDay ? { rangesByDay } : {}), daysOfWeek };
}

/** Avvolge un resolver di disponibilità con il filtro per luogo dell'allievo. */
export function scopeResolver<
  R extends { resolve: (ownerId: string, date: Date) => AvailabilityRecordLike | null },
>(resolver: R, scope: ReadonlySet<string> | null): R {
  if (!scope) return resolver;
  return {
    ...resolver,
    resolve: (ownerId: string, date: Date) => scopeAvailabilityRecord(resolver.resolve(ownerId, date), scope),
  };
}

/** Luogo della fascia che contiene [start, end) in minuti; null = nessuna o senza luogo. */
export function locationOfCoveringRange(
  ranges: readonly Range[] | null | undefined,
  startMinutes: number,
  endMinutes: number,
): string | null {
  const hit = (ranges ?? []).find(
    (r) => r.endMinutes > r.startMinutes && startMinutes >= r.startMinutes && endMinutes <= r.endMinutes,
  );
  return hit?.locationId ?? null;
}

export type LocatedBusy = { startsAt: Date; endsAt: Date; locationId: string | null };

/**
 * True se la guida candidata [startsAt, endsAt) nel luogo `locationId` sta a
 * meno di `bufferMinutes` da una guida dello stesso istruttore in un luogo
 * diverso. I luoghi `null` contano come `defaultLocationId` (la sede). Le
 * sovrapposizioni vere non sono affare di questa funzione (le scarta il
 * controllo dei conflitti).
 */
export function violatesLocationChangeBuffer(params: {
  startsAt: Date;
  endsAt: Date;
  locationId: string | null;
  busy: readonly LocatedBusy[];
  bufferMinutes: number;
  defaultLocationId: string | null;
}): boolean {
  if (params.bufferMinutes <= 0) return false;
  const here = params.locationId ?? params.defaultLocationId;
  const gap = params.bufferMinutes * 60_000;
  const start = params.startsAt.getTime();
  const end = params.endsAt.getTime();
  return params.busy.some((b) => {
    const there = b.locationId ?? params.defaultLocationId;
    if (there === here) return false;
    const bStart = b.startsAt.getTime();
    const bEnd = b.endsAt.getTime();
    // Prima della candidata: la sua fine deve stare almeno `gap` prima.
    if (bEnd <= start) return start - bEnd < gap;
    // Dopo la candidata: il suo inizio deve stare almeno `gap` dopo.
    if (bStart >= end) return bStart - end < gap;
    return false;
  });
}

export type StudentLocationContext = {
  /** Disponibilità per luogo accesa (≥ 2 luoghi). */
  enabled: boolean;
  /** Luoghi dell'allievo; null = nessun vincolo. */
  scope: ReadonlySet<string> | null;
  /** Pausa effettiva tra luoghi diversi, 0 = nessuna. */
  bufferMinutes: number;
  /** Sede: luogo delle guide senza luogo. */
  defaultLocationId: string | null;
  /** Luogo di riferimento per una fascia senza luogo (principale → sede). */
  fallbackLocationId: string | null;
};

export const DISABLED_LOCATION_CONTEXT: StudentLocationContext = {
  enabled: false,
  scope: null,
  bufferMinutes: 0,
  defaultLocationId: null,
  fallbackLocationId: null,
};

/**
 * Contesto per luogo di un allievo (o di nessuno, `studentId` null: staff /
 * vista senza allievo → nessun filtro, solo la pausa). Due query leggere più i
 * limits in cache; spento = nessuna query oltre ai limits e ai luoghi.
 */
export async function loadStudentLocationContext(
  companyId: string,
  studentId: string | null,
): Promise<StudentLocationContext> {
  const [limits, locations] = await Promise.all([
    getCachedCompanyServiceLimits(companyId),
    prisma.autoscuolaLocation.findMany({
      where: { companyId, archivedAt: null },
      select: { id: true, isDefault: true },
    }),
  ]);
  const settings = readLocationAvailabilitySettings(limits);
  const enabled = availabilityByLocationEnabled(settings.availabilityByLocation, locations.length);
  if (!enabled) return DISABLED_LOCATION_CONTEXT;
  const defaultLocationId = locations.find((l) => l.isDefault)?.id ?? null;

  let scope: ReadonlySet<string> | null = null;
  let fallbackLocationId = defaultLocationId;
  if (studentId) {
    const [assigned, member] = await Promise.all([
      getMemberLocationIds(companyId, [studentId]),
      prisma.companyMember.findFirst({
        where: { companyId, userId: studentId },
        select: { defaultLocationId: true },
      }),
    ]);
    scope = studentLocationScope(true, assigned.get(studentId) ?? []);
    const principal = member?.defaultLocationId ?? null;
    if (principal && locations.some((l) => l.id === principal)) fallbackLocationId = principal;
  }
  return {
    enabled,
    scope,
    bufferMinutes: effectiveLocationChangeBufferMinutes(settings, enabled),
    defaultLocationId,
    fallbackLocationId,
  };
}

/**
 * Guide degli istruttori con il loro luogo, per la pausa tra luoghi. Vuoto se
 * la pausa è spenta (nessuna query).
 */
export async function loadInstructorLocatedBusy(params: {
  companyId: string;
  instructorIds: readonly string[];
  rangeStart: Date;
  rangeEnd: Date;
  bufferMinutes: number;
}): Promise<Map<string, LocatedBusy[]>> {
  const out = new Map<string, LocatedBusy[]>();
  if (params.bufferMinutes <= 0 || params.instructorIds.length === 0) return out;
  const pad = params.bufferMinutes * 60_000;
  const rows = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId: params.companyId,
      instructorId: { in: [...params.instructorIds] },
      status: { notIn: ["cancelled"] },
      startsAt: { lt: new Date(params.rangeEnd.getTime() + pad) },
      OR: [{ endsAt: null }, { endsAt: { gt: new Date(params.rangeStart.getTime() - pad) } }],
    },
    select: { instructorId: true, startsAt: true, endsAt: true, locationId: true },
  });
  for (const r of rows) {
    if (!r.instructorId) continue;
    const item: LocatedBusy = {
      startsAt: r.startsAt,
      endsAt: r.endsAt ?? new Date(r.startsAt.getTime() + 60 * 60_000),
      locationId: r.locationId ?? null,
    };
    const list = out.get(r.instructorId);
    if (list) list.push(item);
    else out.set(r.instructorId, [item]);
  }
  return out;
}

/** Comodo: la candidata di un istruttore rispetta la pausa? */
export function passesLocationChangeBuffer(
  ctx: StudentLocationContext,
  busyByInstructor: Map<string, LocatedBusy[]>,
  instructorId: string,
  startsAt: Date,
  endsAt: Date,
  rangeLocationId: string | null,
): boolean {
  if (ctx.bufferMinutes <= 0) return true;
  return !violatesLocationChangeBuffer({
    startsAt,
    endsAt,
    locationId: rangeLocationId ?? ctx.fallbackLocationId,
    busy: busyByInstructor.get(instructorId) ?? [],
    bufferMinutes: ctx.bufferMinutes,
    defaultLocationId: ctx.defaultLocationId,
  });
}

export type LocationAssignmentContext = {
  enabled: boolean;
  bufferMinutes: number;
  defaultLocationId: string | null;
  locatedBusy: Map<string, LocatedBusy[]>;
  /** studentId → luoghi (null = tutti) e luogo per le fasce senza luogo. */
  students: Map<string, { scope: ReadonlySet<string> | null; fallbackLocationId: string | null }>;
};

/**
 * Contesto per luogo condiviso da più allievi (waitlist: broadcast, offerte,
 * accettazione). Una query per i luoghi degli allievi, una per i loro
 * principali, una per le guide col luogo (solo con la pausa).
 */
export async function loadLocationAssignmentContext(params: {
  companyId: string;
  studentIds: readonly string[];
  instructorIds: readonly string[];
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<LocationAssignmentContext> {
  const base = await loadStudentLocationContext(params.companyId, null);
  if (!base.enabled) {
    return {
      enabled: false,
      bufferMinutes: 0,
      defaultLocationId: null,
      locatedBusy: new Map(),
      students: new Map(),
    };
  }
  const ids = Array.from(new Set(params.studentIds));
  const [assigned, members, locatedBusy] = await Promise.all([
    getMemberLocationIds(params.companyId, ids),
    ids.length
      ? prisma.companyMember.findMany({
          where: { companyId: params.companyId, userId: { in: ids } },
          select: { userId: true, defaultLocationId: true },
        })
      : Promise.resolve([] as { userId: string; defaultLocationId: string | null }[]),
    loadInstructorLocatedBusy({
      companyId: params.companyId,
      instructorIds: params.instructorIds,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
      bufferMinutes: base.bufferMinutes,
    }),
  ]);
  const principal = new Map(members.map((m) => [m.userId, m.defaultLocationId]));
  const students = new Map<string, { scope: ReadonlySet<string> | null; fallbackLocationId: string | null }>();
  for (const id of ids) {
    const list = assigned.get(id) ?? [];
    students.set(id, {
      scope: studentLocationScope(true, list),
      fallbackLocationId: principal.get(id) ?? base.defaultLocationId,
    });
  }
  return {
    enabled: true,
    bufferMinutes: base.bufferMinutes,
    defaultLocationId: base.defaultLocationId,
    locatedBusy,
    students,
  };
}

/**
 * Un allievo può prendere (scambio) una guida in questo luogo? Guida senza
 * luogo = la sede. Allievo senza luoghi (`scope` null) = sì.
 */
export function studentCanTakeLocation(
  scope: ReadonlySet<string> | null | undefined,
  appointmentLocationId: string | null | undefined,
  defaultLocationId: string | null,
): boolean {
  if (!scope) return true;
  const loc = appointmentLocationId ?? defaultLocationId;
  return loc ? scope.has(loc) : true;
}

/**
 * REG-705e: aggiunge `locationId` + `locationName` a un elemento mostrato
 * all'allievo (offerta della lista d'attesa). `null` = fascia senza luogo;
 * luogo sparito (archiviato) = nome `null`.
 */
export function withLocationName<T extends object>(
  item: T,
  locationId: string | null | undefined,
  names: ReadonlyMap<string, string>,
): T & { locationId: string | null; locationName: string | null } {
  const id = locationId ?? null;
  return { ...item, locationId: id, locationName: id ? names.get(id) ?? null : null };
}
