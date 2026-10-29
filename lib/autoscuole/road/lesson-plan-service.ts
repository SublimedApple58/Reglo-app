import { prisma } from "@/db/prisma";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import type { RoadPoint } from "@/lib/autoscuole/road/geo";
import type { HotspotMarker } from "@/lib/autoscuole/road/hotspots";
import { companyHotspots } from "@/lib/autoscuole/road/hotspots-service";
import {
  buildLessonPlan,
  buildStudentHotspots,
  examRouteCoverage,
  studentErrorKinds,
  type LessonPlan,
  type StudentHotspot,
} from "@/lib/autoscuole/road/lesson-plan";
import { ROAD_RETENTION_MONTHS } from "@/lib/autoscuole/road/maintenance";

/**
 * REG-647 Reglo Road — giro della prossima guida: carica i dati e chiama il
 * motore puro (`lesson-plan.ts`). Nessun controllo di ruolo né di interruttori:
 * li fa l'API (REG-648) prima di chiamare qui, sempre con un `companyId` già
 * verificato e un allievo di quell'autoscuola.
 */

/** Tetto delle segnalazioni dell'allievo lette per un calcolo. */
const MAX_STUDENT_MARKERS = 2_000;
/** Le guide più recenti dell'allievo usate per la copertura dei percorsi d'esame. */
const COVERAGE_SESSIONS = 30;
/** Un punto ogni N del tracciato basta per la copertura (un fix al secondo ≈ 4 m a 50 km/h). */
const COVERAGE_TRACK_STRIDE = 3;
const COVERAGE_CACHE_TTL_S = 10 * 60;

function retentionStart(now: Date) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - ROAD_RETENTION_MONTHS);
  return d;
}

async function loadStudentMarkers(companyId: string, studentId: string, now: Date): Promise<HotspotMarker[]> {
  const rows = await prisma.roadMarker.findMany({
    where: { companyId, sentiment: "bad", recordedAt: { gte: retentionStart(now) }, session: { studentId } },
    orderBy: { recordedAt: "desc" },
    take: MAX_STUDENT_MARKERS,
    select: { id: true, sessionId: true, kind: true, label: true, lat: true, lng: true, street: true, recordedAt: true },
  });
  return rows.map((r) => ({ ...r, studentId }));
}

/** I punti critici dell'allievo (i suoi errori ripetuti): per la tappa 1 e la mappa in Road. */
export async function loadStudentHotspots(companyId: string, studentId: string, now = new Date()) {
  return buildStudentHotspots(await loadStudentMarkers(companyId, studentId, now));
}

async function loadExamRoutesWithCoverage(companyId: string, studentId: string, now: Date) {
  const routes = await prisma.roadExamRoute.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, name: true, path: true, lengthMeters: true, updatedAt: true },
  });
  if (!routes.length) return [];
  const paths = routes.map((r) => ({
    id: r.id,
    name: r.name,
    lengthMeters: r.lengthMeters,
    path: (Array.isArray(r.path) ? r.path : []) as LatLng[],
  }));

  const sessions = await prisma.roadSession.findMany({
    where: { companyId, studentId, status: { not: "active" }, startedAt: { gte: retentionStart(now) } },
    orderBy: { startedAt: "desc" },
    take: COVERAGE_SESSIONS,
    select: { id: true },
  });
  if (!sessions.length) return paths.map((p) => ({ ...p, coverage: 0 }));

  // Stesse guide e stessi percorsi = stessa copertura: in cache 10 minuti.
  const key = await buildAutoscuoleCacheKey({
    companyId,
    segment: AUTOSCUOLE_CACHE_SEGMENTS.ROAD,
    scope: `plan-coverage:${hashCacheInput({
      studentId,
      sessions: sessions.map((s) => s.id),
      routes: routes.map((r) => [r.id, r.updatedAt.getTime()]),
    })}`,
  }).catch(() => null);
  const cached = key ? await readAutoscuoleCache<Record<string, number>>(key).catch(() => null) : null;
  if (cached) return paths.map((p) => ({ ...p, coverage: cached[p.id] ?? 0 }));

  const batches = await prisma.roadPointBatch.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
    select: { sessionId: true, points: true },
  });
  const bySession = new Map<string, LatLng[]>();
  for (const b of batches) {
    const pts = Array.isArray(b.points) ? (b.points as unknown as RoadPoint[]) : [];
    const list = bySession.get(b.sessionId) ?? [];
    for (let i = 0; i < pts.length; i += COVERAGE_TRACK_STRIDE) {
      const p = pts[i];
      if (Array.isArray(p) && Number.isFinite(p[1]) && Number.isFinite(p[2])) list.push([p[1], p[2]]);
    }
    bySession.set(b.sessionId, list);
  }
  const tracks = [...bySession.values()];
  const coverage: Record<string, number> = {};
  for (const p of paths) coverage[p.id] = Number(examRouteCoverage(p.path, tracks).toFixed(3));
  if (key) await writeAutoscuoleCache(key, coverage, COVERAGE_CACHE_TTL_S).catch(() => undefined);
  return paths.map((p) => ({ ...p, coverage: coverage[p.id] ?? 0 }));
}

export type LessonPlanResult = {
  plan: LessonPlan;
  /** I punti critici dell'allievo, anche quelli rimasti fuori dalle tappe (mappa in Road). */
  studentHotspots: StudentHotspot[];
};

export async function computeLessonPlan(input: {
  companyId: string;
  studentId: string;
  durationMin: number;
  start: { lat: number; lng: number } | null;
  now?: Date;
}): Promise<LessonPlanResult> {
  const now = input.now ?? new Date();
  const [markers, schoolHotspots, examRoutes] = await Promise.all([
    loadStudentMarkers(input.companyId, input.studentId, now),
    companyHotspots(input.companyId),
    loadExamRoutesWithCoverage(input.companyId, input.studentId, now),
  ]);
  const studentHotspots = buildStudentHotspots(markers);
  const plan = buildLessonPlan({
    durationMin: input.durationMin,
    start: input.start,
    studentHotspots,
    studentKinds: studentErrorKinds(markers),
    schoolHotspots,
    examRoutes,
  });
  return { plan, studentHotspots };
}
