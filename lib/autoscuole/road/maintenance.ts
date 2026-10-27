import type { PrismaClient } from "@prisma/client";

import { drivingSeconds, trackDistanceMeters, type RoadPoint } from "@/lib/autoscuole/road/geo";

/**
 * REG-638 Reglo Road — manutenzione, usata dal job Trigger
 * `autoscuole-road-maintenance` (prisma iniettato: niente import di Next qui).
 */

export const ROAD_ORPHAN_AFTER_MIN = 30;
export const ROAD_RETENTION_MONTHS = 12;

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
