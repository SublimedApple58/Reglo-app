import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { isInstructor } from "@/lib/autoscuole/roles";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  buildAutoscuoleCacheKey,
  hashCacheInput,
  readAutoscuoleCache,
  writeAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { canSeeAll, roadContext, type RoadCtx } from "@/lib/autoscuole/road/service";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import {
  buildHotspots,
  buildHotspotsWithMarkers,
  findHotspot,
  parseHotspotFilters,
  type CleanHotspotFilters,
  type Hotspot,
  type HotspotFilters,
  type HotspotMarker,
} from "@/lib/autoscuole/road/hotspots";

export type { HotspotFilters };

/**
 * REG-643 Reglo Road — punti critici (API).
 * - titolare (e admin): tutta l'autoscuola;
 * - istruttore: la stessa mappa aggregata (decisione di Tiziano, 29/10), ma nel
 *   dettaglio di un punto vede solo le guide e gli allievi suoi;
 * - allievo: niente.
 * La lista è in cache 10 minuti per autoscuola + filtri (uguale per tutti i
 * ruoli: è aggregata); il dettaglio si calcola al tocco.
 */

type Result<T> = { success: true; data: T } | { success: false; message: string; code?: string };
const ok = <T>(data: T): Result<T> => ({ success: true, data });
const fail = (message: string, code?: string): Result<never> => ({ success: false, message, code });

const HOTSPOTS_CACHE_TTL_S = 10 * 60;
/** Tetto di sicurezza delle segnalazioni lette per un calcolo. */
const MAX_MARKERS = 20_000;

async function ownInstructorId(ctx: RoadCtx) {
  if (!isInstructor(ctx.membership.autoscuolaRole)) return null;
  const row = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.membership.userId, status: { not: "inactive" } },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function loadCtx() {
  const ctx = await roadContext();
  if (!ctx.roadEnabled) return { error: fail("Reglo Road non è attivo.", "ROAD_DISABLED") };
  if (canSeeAll(ctx)) return { ctx, own: null as string | null, all: true };
  const own = await ownInstructorId(ctx);
  if (!own) return { error: fail("Non autorizzato.", "FORBIDDEN") };
  return { ctx, own, all: false };
}

const markerWhere = (companyId: string, f: CleanHotspotFilters): Prisma.RoadMarkerWhereInput => ({
  companyId,
  sentiment: "bad",
  recordedAt: { gte: f.from, lt: f.to },
  ...(f.kind ? { kind: f.kind } : {}),
  ...(f.instructorId || f.license
    ? {
        session: {
          ...(f.instructorId ? { instructorId: f.instructorId } : {}),
          ...(f.license ? { appointment: { vehicle: { licenseCategory: f.license } } } : {}),
        },
      }
    : {}),
});

async function loadMarkers(companyId: string, f: CleanHotspotFilters) {
  const rows = await prisma.roadMarker.findMany({
    where: markerWhere(companyId, f),
    orderBy: { recordedAt: "desc" },
    take: MAX_MARKERS,
    select: {
      id: true,
      sessionId: true,
      kind: true,
      label: true,
      lat: true,
      lng: true,
      street: true,
      recordedAt: true,
      session: { select: { studentId: true } },
    },
  });
  return rows.map(
    (r): HotspotMarker => ({
      id: r.id,
      sessionId: r.sessionId,
      studentId: r.session.studentId,
      kind: r.kind,
      label: r.label,
      lat: r.lat,
      lng: r.lng,
      street: r.street,
      recordedAt: r.recordedAt,
    }),
  );
}

async function loadExamRoutes(companyId: string) {
  const rows = await prisma.roadExamRoute.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, name: true, path: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, path: (Array.isArray(r.path) ? r.path : []) as LatLng[] }));
}

export type RoadHotspotsDTO = {
  from: string;
  to: string;
  hotspots: Hotspot[];
  /** Segnalazioni «da migliorare» nel periodo (anche quelle sotto soglia): per lo stato vuoto. */
  totalErrors: number;
  examRoutes: number;
};

async function cachedHotspots(companyId: string, f: CleanHotspotFilters, key: string | null): Promise<RoadHotspotsDTO> {
  if (key) {
    const cached = await readAutoscuoleCache<RoadHotspotsDTO>(key).catch(() => null);
    if (cached) return cached;
  }
  const [markers, routes] = await Promise.all([loadMarkers(companyId, f), loadExamRoutes(companyId)]);
  const data: RoadHotspotsDTO = {
    from: f.from.toISOString(),
    to: f.to.toISOString(),
    hotspots: buildHotspots(markers, routes),
    totalErrors: markers.length,
    examRoutes: routes.length,
  };
  if (key) await writeAutoscuoleCache(key, data, HOTSPOTS_CACHE_TTL_S).catch(() => undefined);
  return data;
}

const listCacheKey = (companyId: string, input: HotspotFilters, f: CleanHotspotFilters) => {
  // Il «fino a» arrotondato al minuto: con «adesso» la chiave cambierebbe a ogni chiamata.
  const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
  return buildAutoscuoleCacheKey({
    companyId,
    segment: AUTOSCUOLE_CACHE_SEGMENTS.ROAD,
    scope: `hotspots:${hashCacheInput({
      from: input.from ? minute(f.from) : "default",
      to: input.to ? minute(f.to) : "now",
      instructorId: f.instructorId,
      license: f.license,
      kind: f.kind,
    })}`,
  }).catch(() => null);
};

/**
 * REG-647: i punti critici di tutta l'autoscuola sugli ultimi 12 mesi, senza
 * filtri e senza controlli di ruolo (li fa chi chiama). Stessa cache della
 * lista senza filtri.
 */
export async function companyHotspots(companyId: string): Promise<Hotspot[]> {
  const parsed = parseHotspotFilters({});
  if (!parsed.ok) return [];
  const data = await cachedHotspots(companyId, parsed.value, await listCacheKey(companyId, {}, parsed.value));
  return data.hotspots;
}

export async function getRoadHotspots(input: HotspotFilters) {
  try {
    const loaded = await loadCtx();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const parsed = parseHotspotFilters(input);
    if (!parsed.ok) return fail(parsed.message, "INVALID");
    const f = parsed.value;

    const key = await listCacheKey(ctx.companyId, input, f);
    return ok(await cachedHotspots(ctx.companyId, f, key));
  } catch (error) {
    return fail(formatError(error));
  }
}

export type RoadHotspotDetailDTO = {
  hotspot: Hotspot;
  /** Guide in cui è successo, più recenti prima (istruttore: solo le sue). */
  sessions: Array<{
    id: string;
    startedAt: string;
    student: { id: string; name: string } | null;
    instructor: { id: string; name: string } | null;
    errors: number;
    lastAt: string;
  }>;
  /** Allievi che ci sbagliano (istruttore: solo i suoi). */
  students: Array<{ id: string; name: string; errors: number }>;
  /** Guide di altri istruttori non mostrate (0 per il titolare). */
  hiddenSessions: number;
};

export async function getRoadHotspotDetail(key: string, input: HotspotFilters) {
  try {
    const loaded = await loadCtx();
    if ("error" in loaded) return loaded.error!;
    const { ctx, own, all } = loaded;
    const parsed = parseHotspotFilters(input);
    if (!parsed.ok) return fail(parsed.message, "INVALID");

    const [markers, routes] = await Promise.all([
      loadMarkers(ctx.companyId, parsed.value),
      loadExamRoutes(ctx.companyId),
    ]);
    const found = findHotspot(buildHotspotsWithMarkers(markers, routes), key);
    if (!found) return fail("Punto critico non trovato.", "NOT_FOUND");
    const { markers: inside, ...hotspot } = found;

    const sessionIds = [...new Set(inside.map((m) => m.sessionId))];
    const sessions = await prisma.roadSession.findMany({
      where: { id: { in: sessionIds }, companyId: ctx.companyId },
      select: {
        id: true,
        startedAt: true,
        instructorId: true,
        appointment: {
          select: {
            student: { select: { id: true, name: true } },
            instructor: { select: { id: true, name: true } },
          },
        },
      },
    });
    const visible = sessions.filter((s) => all || s.instructorId === own);
    const perSession = new Map<string, { errors: number; lastAt: Date }>();
    for (const m of inside) {
      const cur = perSession.get(m.sessionId) ?? { errors: 0, lastAt: m.recordedAt };
      cur.errors++;
      if (m.recordedAt > cur.lastAt) cur.lastAt = m.recordedAt;
      perSession.set(m.sessionId, cur);
    }
    const studentErrors = new Map<string, { id: string; name: string; errors: number }>();
    for (const s of visible) {
      const st = s.appointment.student;
      if (!st) continue;
      const cur = studentErrors.get(st.id) ?? { id: st.id, name: st.name, errors: 0 };
      cur.errors += perSession.get(s.id)?.errors ?? 0;
      studentErrors.set(st.id, cur);
    }

    return ok<RoadHotspotDetailDTO>({
      hotspot,
      sessions: visible
        .map((s) => ({
          id: s.id,
          startedAt: s.startedAt.toISOString(),
          student: s.appointment.student,
          instructor: s.appointment.instructor,
          errors: perSession.get(s.id)?.errors ?? 0,
          lastAt: (perSession.get(s.id)?.lastAt ?? s.startedAt).toISOString(),
        }))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      students: [...studentErrors.values()].sort((a, b) => b.errors - a.errors || a.name.localeCompare(b.name)),
      hiddenSessions: sessions.length - visible.length,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}
