import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { canSeeAll, roadContext } from "@/lib/autoscuole/road/service";
import { parseExamRouteInput, type LatLng } from "@/lib/autoscuole/road/exam-routes";

/**
 * REG-641 Reglo Road — percorsi d'esame dell'autoscuola (API).
 * - leggere: titolare e istruttori (servono alla mappa dei punti critici e al
 *   giro della prossima guida);
 * - creare / modificare / archiviare: solo titolare (o admin).
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
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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
        createdById: ctx.membership.userId,
      },
      select: routeSelect,
    });
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
        ...(restore ? { archivedAt: null } : {}),
      },
      select: routeSelect,
    });
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
    return ok({ archived: true });
  } catch (error) {
    return fail(formatError(error));
  }
}
