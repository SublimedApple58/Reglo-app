import type { Prisma, PrismaClient } from "@prisma/client";

import { buildCleanTrack, CLEAN_TRACK_VERSION, type CleanTrack } from "@/lib/autoscuole/road/clean-track";
import { drivingSeconds, trackDistanceMeters, type RoadPoint } from "@/lib/autoscuole/road/geo";

/**
 * REG-638 Reglo Road — manutenzione, usata dal job Trigger
 * `autoscuole-road-maintenance` (prisma iniettato: niente import di Next qui).
 */

export const ROAD_ORPHAN_AFTER_MIN = 30;
export const ROAD_RETENTION_MONTHS = 12;
/** REG-713: per quanti giorni dopo la fine il job prova ancora ad agganciare la traccia. */
export const ROAD_CLEAN_TRACK_DAYS = 7;
/** REG-713: tracce agganciate per giro del job (REG-722: calamita OSM, niente Google). */
const CLEAN_TRACKS_PER_RUN = 25;

type Db = Pick<PrismaClient, "roadSession" | "roadPointBatch">;

const lessonEnd = (a: { startsAt: Date; endsAt: Date | null }) =>
  a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60 * 1000);

export async function loadRoadTrack(db: Db, sessionId: string): Promise<RoadPoint[]> {
  const batches = await db.roadPointBatch.findMany({
    where: { sessionId },
    orderBy: { seq: "asc" },
    select: { points: true },
  });
  const all = batches.flatMap((b) => (Array.isArray(b.points) ? (b.points as unknown as RoadPoint[]) : []));
  all.sort((a, b) => a[0] - b[0]);
  return all;
}

/** Chiude la sessione ricalcolando i km su tutto il percorso, in ordine. */
export async function finalizeRoadSession(
  db: Db,
  sessionId: string,
  status: "completed" | "abandoned",
  endedAt: Date,
) {
  const track = await loadRoadTrack(db, sessionId);
  const s = await db.roadSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { startedAt: true, appointment: { select: { startsAt: true } } },
  });
  await db.roadSession.update({
    where: { id: sessionId },
    data: {
      status,
      endedAt,
      distanceMeters: Math.round(trackDistanceMeters(track)),
      pointCount: track.length,
      durationSec: drivingSeconds(s.startedAt, endedAt, s.appointment?.startsAt),
    },
  });
}

/**
 * REG-665 / REG-713: calcola e salva la traccia pulita di una guida finita, con
 * i suoi km (gli unici che app, web, storico e riepilogo mostrano). È l'unico
 * punto che scrive `cleanTrack`: a «Termina guida», dal job e dopo i punti
 * arrivati in ritardo; la lettura del dettaglio non scrive mai.
 * `snap: false` = solo pulita, senza aggancio: il job la aggancia al giro dopo.
 */
export async function saveRoadCleanTrack(
  db: Db,
  sessionId: string,
  opts: { snap?: boolean; now?: number } & Pick<Parameters<typeof buildCleanTrack>[1] & object, "osmGraph" | "googleFallback" | "fetchSnap"> = {},
): Promise<CleanTrack> {
  const now = opts.now ?? Date.now();
  const track = await buildCleanTrack(await loadRoadTrack(db, sessionId), { ...opts, now });
  const stored: CleanTrack = opts.snap === false && track.path.length >= 2 ? { ...track, retryAfter: now } : track;
  await db.roadSession.update({
    where: { id: sessionId },
    data: { cleanTrack: stored as unknown as Prisma.InputJsonValue, distanceMeters: track.distanceMeters },
  });
  return stored;
}

/**
 * REG-713: guide finite negli ultimi 7 giorni senza traccia agganciata
 * (abbandonate, punti arrivati in ritardo, aggancio fallito alla chiusura e ora di
 * riprovare, versione cambiata). Una volta agganciata non si tocca più.
 */
export async function runRoadCleanTracks(db: Db & Pick<PrismaClient, "$queryRaw">, now = new Date()) {
  const since = new Date(now.getTime() - ROAD_CLEAN_TRACK_DAYS * 24 * 3600_000);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM "RoadSession"
    WHERE status <> 'active' AND "endedAt" >= ${since}
      AND (
        "cleanTrack" IS NULL
        OR ("cleanTrack"->>'v')::int IS DISTINCT FROM ${CLEAN_TRACK_VERSION}
        OR (("cleanTrack"->>'snapped') = 'false' AND ("cleanTrack"->>'retryAfter')::bigint <= ${now.getTime()})
      )
    ORDER BY "endedAt" ASC
    LIMIT ${CLEAN_TRACKS_PER_RUN}`;
  let snapped = 0;
  for (const r of rows) {
    const t = await saveRoadCleanTrack(db, r.id, { now: now.getTime() });
    if (t.snapped) snapped++;
  }
  return { cleanTracks: rows.length, snapped };
}

/** Sessioni dimenticate aperte → abbandonate; oltre 12 mesi → cancellate. */
export async function runRoadMaintenance(db: Db, now = new Date()) {
  const stale = await db.roadSession.findMany({
    where: { status: "active" },
    select: { id: true, startedAt: true, lastPointAt: true, appointment: { select: { startsAt: true, endsAt: true } } },
  });
  let closed = 0;
  for (const s of stale) {
    const end = lessonEnd(s.appointment);
    if (now.getTime() < end.getTime() + ROAD_ORPHAN_AFTER_MIN * 60 * 1000) continue;
    const endedAt = s.lastPointAt && s.lastPointAt > s.startedAt ? s.lastPointAt : end;
    await finalizeRoadSession(db, s.id, "abandoned", endedAt);
    closed++;
  }
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - ROAD_RETENTION_MONTHS);
  const purged = await db.roadSession.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return { closed, purged: purged.count };
}
