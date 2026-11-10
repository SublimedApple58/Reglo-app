import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { AUTOSCUOLE_CACHE_SEGMENTS, invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";
import { canSeeAll, roadContext } from "@/lib/autoscuole/road/service";
import {
  EXAM_ROUTE_MAX_WAYPOINTS,
  parseExamRouteInput,
  parseLatLngList,
  pathLengthMeters,
  simplifyPath,
  type LatLng,
} from "@/lib/autoscuole/road/exam-routes";
import { loadRoadTrack } from "@/lib/autoscuole/road/maintenance";
import { SnapError, snapWaypoints, waypointsFromTrack } from "@/lib/autoscuole/road/snap";
import { examRouteOrigin, groupExamRoutesByExaminer, type ExamRouteOrigin } from "@/lib/autoscuole/road/road-exam";

/**
 * REG-641 Reglo Road — percorsi d'esame dell'autoscuola (API).
 * - leggere: titolare e istruttori (servono alla mappa dei punti critici e al
 *   giro della prossima guida);
 * - creare / modificare / archiviare: solo titolare (o admin);
 * - aggancio alle strade e scorciatoia da guida Road (REG-642): solo titolare,
 *   perché servono solo all'editor (e l'aggancio costa a richiesta).
 * Tutto spento se Road non è attivo.
 */

type Result<T> = { success: true; data: T } | { success: false; message: string; code?: string };
const ok = <T>(data: T): Result<T> => ({ success: true, data });
const fail = (message: string, code?: string): Result<never> => ({ success: false, message, code });

const routeSelect = {
  id: true,
  name: true,
  examSite: true,
  licenseCategories: true,
  waypoints: true,
  path: true,
  lengthMeters: true,
  sourceSessionId: true,
  examiners: true,
  origin: true,
  examAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RouteRow = {
  id: string;
  name: string;
  examSite: string | null;
  licenseCategories: string[];
  waypoints: unknown;
  path: unknown;
  lengthMeters: number;
  sourceSessionId: string | null;
  examiners: string[];
  origin: string;
  examAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoadExamRouteDTO = {
  id: string;
  name: string;
  examSite: string | null;
  licenseCategories: string[];
  waypoints: LatLng[];
  path: LatLng[];
  lengthMeters: number;
  sourceSessionId: string | null;
  /** R4: esaminatori (vuoto = «Senza esaminatore»). */
  examiners: string[];
  /** R4: "drawn" = disegnato dal titolare, "exam" = registrato con Road Exam. */
  origin: ExamRouteOrigin;
  /** R4: quando si è svolto l'esame registrato. */
  examAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** I punti critici portano il segno «sul percorso d'esame»: vanno ricalcolati. */
const invalidateHotspots = (companyId: string) =>
  invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.ROAD] }).catch(() => undefined);

const asLatLng = (v: unknown): LatLng[] => (Array.isArray(v) ? (v as LatLng[]) : []);

function routeDTO(r: RouteRow): RoadExamRouteDTO {
  return {
    id: r.id,
    name: r.name,
    examSite: r.examSite,
    licenseCategories: r.licenseCategories,
    waypoints: asLatLng(r.waypoints),
    path: asLatLng(r.path),
    lengthMeters: r.lengthMeters,
    sourceSessionId: r.sourceSessionId,
    examiners: r.examiners,
    origin: examRouteOrigin(r.origin),
    examAt: r.examAt?.toISOString() ?? null,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function loadCtx(write: boolean) {
  const ctx = await roadContext();
  if (!ctx.roadEnabled) return { error: fail("Reglo Road non è attivo.", "ROAD_DISABLED") };
  if (write && !canSeeAll(ctx)) return { error: fail("Solo il titolare può modificare i percorsi d'esame.", "FORBIDDEN") };
  return { ctx };
}

/** Percorsi attivi dell'autoscuola (con `archived` anche quelli archiviati, solo titolare). */
export async function listRoadExamRoutes(input: { archived?: boolean } = {}) {
  try {
    const loaded = await loadCtx(false);
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const withArchived = input.archived === true && canSeeAll(ctx);
    const rows = await prisma.roadExamRoute.findMany({
      where: { companyId: ctx.companyId, ...(withArchived ? {} : { archivedAt: null }) },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      select: routeSelect,
    });
    return ok(rows.map(routeDTO));
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * R4b: percorsi attivi raggruppati per esaminatore (un percorso con due
 * esaminatori sta in entrambi; «Senza esaminatore» in fondo). Lo leggono tutti
 * (servono a «Prova il percorso» in guida); assegnare resta del titolare.
 */
export async function listRoadExamRoutesByExaminer() {
  const res = await listRoadExamRoutes();
  if (!res.success) return res;
  return ok(
    groupExamRoutesByExaminer(res.data).map((g) => ({
      key: g.key,
      name: g.name,
      lastExamAt: g.lastExamAt,
      routes: g.routes,
    })),
  );
}

/** Una guida di origine deve essere di questa autoscuola. */
async function sessionBelongs(companyId: string, sessionId: string | null | undefined) {
  if (!sessionId) return true;
  const row = await prisma.roadSession.findFirst({ where: { id: sessionId, companyId }, select: { id: true } });
  return Boolean(row);
}

export async function createRoadExamRoute(raw: unknown) {
  try {
    const loaded = await loadCtx(true);
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const parsed = parseExamRouteInput(raw, { partial: false });
    if (!parsed.ok) return fail(parsed.message, "INVALID");
    const v = parsed.value;
    if (!(await sessionBelongs(ctx.companyId, v.sourceSessionId))) return fail("Guida di origine non trovata.", "NOT_FOUND");
    const row = await prisma.roadExamRoute.create({
      data: {
        companyId: ctx.companyId,
        name: v.name!,
        examSite: v.examSite ?? null,
        licenseCategories: v.licenseCategories ?? [],
        waypoints: v.waypoints!,
        path: v.path!,
        lengthMeters: v.lengthMeters ?? 0,
        sourceSessionId: v.sourceSessionId ?? null,
        examiners: v.examiners ?? [],
        createdById: ctx.membership.userId,
      },
      select: routeSelect,
    });
    await invalidateHotspots(ctx.companyId);
    return ok(routeDTO(row));
  } catch (error) {
    return fail(formatError(error));
  }
}

/** Modifica (anche `restore: true` per togliere dall'archivio). */
export async function updateRoadExamRoute(id: string, raw: unknown) {
  try {
    const loaded = await loadCtx(true);
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const existing = await prisma.roadExamRoute.findFirst({ where: { id, companyId: ctx.companyId }, select: { id: true } });
    if (!existing) return fail("Percorso non trovato.", "NOT_FOUND");
    const parsed = parseExamRouteInput(raw, { partial: true });
    if (!parsed.ok) return fail(parsed.message, "INVALID");
    const v = parsed.value;
    if (!(await sessionBelongs(ctx.companyId, v.sourceSessionId))) return fail("Guida di origine non trovata.", "NOT_FOUND");
    const restore = (raw as Record<string, unknown>)?.restore === true;
    const row = await prisma.roadExamRoute.update({
      where: { id },
      data: {
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.examSite !== undefined ? { examSite: v.examSite } : {}),
        ...(v.licenseCategories !== undefined ? { licenseCategories: v.licenseCategories } : {}),
        ...(v.waypoints !== undefined ? { waypoints: v.waypoints } : {}),
        ...(v.path !== undefined ? { path: v.path, lengthMeters: v.lengthMeters ?? 0 } : {}),
        ...(v.sourceSessionId !== undefined ? { sourceSessionId: v.sourceSessionId } : {}),
        ...(v.examiners !== undefined ? { examiners: v.examiners } : {}),
        ...(restore ? { archivedAt: null } : {}),
      },
      select: routeSelect,
    });
    await invalidateHotspots(ctx.companyId);
    return ok(routeDTO(row));
  } catch (error) {
    return fail(formatError(error));
  }
}

/** Archivia (il percorso resta nel DB, esce dalla mappa e dal giro). */
export async function archiveRoadExamRoute(id: string) {
  try {
    const loaded = await loadCtx(true);
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const res = await prisma.roadExamRoute.updateMany({
      where: { id, companyId: ctx.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!res.count) return fail("Percorso non trovato.", "NOT_FOUND");
    await invalidateHotspots(ctx.companyId);
    return ok({ archived: true });
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * REG-642: i punti del titolare → la linea che segue le strade. Se Google non
 * risponde l'errore è esplicito: nessuna linea dritta salvata di nascosto.
 */
export async function snapRoadExamRoute(raw: unknown) {
  try {
    const loaded = await loadCtx(true);
    if ("error" in loaded) return loaded.error!;
    const waypoints = parseLatLngList((raw as Record<string, unknown> | null)?.waypoints, {
      min: 2,
      max: EXAM_ROUTE_MAX_WAYPOINTS,
    });
    if (!waypoints) return fail(`Servono da 2 a ${EXAM_ROUTE_MAX_WAYPOINTS} punti sulla mappa.`, "INVALID");
    const res = await snapWaypoints(waypoints);
    return ok({ segments: res.segments, path: res.path, lengthMeters: res.lengthMeters });
  } catch (error) {
    if (error instanceof SnapError) return fail(error.message, error.code);
    return fail(formatError(error));
  }
}

/**
 * REG-642 scorciatoia: un tratto del tracciato di una guida Road (fra `fromMs`
 * e `toMs`, istanti dei punti GPS; assenti = tutta la guida) diventa la bozza
 * di un percorso: la linea vera più i punti per riaprirla nell'editor.
 */
export async function examRouteFromSession(raw: unknown) {
  try {
    const loaded = await loadCtx(true);
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const body = (raw ?? {}) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const fromMs = num(body.fromMs);
    const toMs = num(body.toMs);
    if (fromMs != null && toMs != null && toMs <= fromMs) return fail("Il tratto scelto è vuoto.", "INVALID");
    if (!UUID_RE.test(sessionId)) return fail("Guida non valida.", "INVALID");
    if (!(await sessionBelongs(ctx.companyId, sessionId))) return fail("Guida non trovata.", "NOT_FOUND");
    const track = (await loadRoadTrack(prisma, sessionId))
      .filter((p) => (fromMs == null || p[0] >= fromMs) && (toMs == null || p[0] <= toMs))
      .map((p) => [p[1], p[2]] as LatLng);
    if (track.length < 2) return fail("In quel tratto la guida non ha abbastanza punti GPS.", "INVALID");
    const path = simplifyPath(track);
    return ok({
      sourceSessionId: sessionId,
      waypoints: waypointsFromTrack(track, EXAM_ROUTE_MAX_WAYPOINTS),
      path,
      lengthMeters: pathLengthMeters(path),
    });
  } catch (error) {
    return fail(formatError(error));
  }
}
