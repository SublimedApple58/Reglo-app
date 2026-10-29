import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import { joinSegments, pathLengthMeters } from "@/lib/autoscuole/road/exam-routes";
import { ownInstructorId, roadContext } from "@/lib/autoscuole/road/service";
import { snapWaypoints } from "@/lib/autoscuole/road/snap";
import { computeLessonPlan } from "@/lib/autoscuole/road/lesson-plan-service";
import {
  parseStoredPlan,
  planRoutePieces,
  planSettings,
  planStart,
  type LessonPlan,
  type StoredPlanStop,
  type StudentHotspot,
} from "@/lib/autoscuole/road/lesson-plan";

/**
 * REG-648 Reglo Road — API del giro della prossima guida (solo istruttore).
 * - `getRoadPlan`: il giro proposto per un allievo e una durata, più i suoi
 *   punti critici (per la mappa in Road, REG-652). Con «Proponi il giro»
 *   spento il giro è `null`, i punti dell'allievo restano.
 * - `getRoadPlanRoute`: la navigazione SUGGERITA, una linea sulle strade vere
 *   partenza → tappe → percorso d'esame. La mobile la chiede UNA volta alla
 *   partenza (niente ricalcoli). Google giù = `line: null`, non un errore.
 */

type Result<T> = { success: true; data: T } | { success: false; message: string; code?: string };
const ok = <T>(data: T): Result<T> => ({ success: true, data });
const fail = (message: string, code?: string): Result<never> => ({ success: false, message, code });

const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));
function point(latRaw: unknown, lngRaw: unknown) {
  const lat = num(latRaw);
  const lng = num(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function instructorCtx() {
  const ctx = await roadContext();
  if (!ctx.roadEnabled) return { error: fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED") };
  const instructorId = await ownInstructorId(ctx);
  if (!instructorId) return { error: fail("Il giro è per gli istruttori.", "FORBIDDEN") };
  return { ctx, instructorId };
}

async function headquarters(companyId: string) {
  const hq = await prisma.autoscuolaLocation.findFirst({
    where: { companyId, latitude: { not: null }, longitude: { not: null } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { latitude: true, longitude: true },
  });
  return hq?.latitude != null && hq.longitude != null ? { lat: Number(hq.latitude), lng: Number(hq.longitude) } : null;
}

export type RoadPlanDTO = {
  planEnabled: boolean;
  planAlertsEnabled: boolean;
  /** Null con «Proponi il giro» spento; `stops: []` se non c'è niente da proporre. */
  plan: LessonPlan | null;
  /** I punti critici dell'allievo (i suoi errori ripetuti), anche fuori dalle tappe. */
  studentHotspots: StudentHotspot[];
};

export async function getRoadPlan(input: { studentId?: unknown; durationMin?: unknown; lat?: unknown; lng?: unknown }) {
  try {
    const loaded = await instructorCtx();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    if (typeof input.studentId !== "string" || !input.studentId) return fail("Allievo mancante.", "INVALID");
    const durationMin = Math.round(num(input.durationMin));
    if (!Number.isFinite(durationMin) || durationMin < 15 || durationMin > 240) return fail("Durata non valida.", "INVALID");

    const student = await prisma.companyMember.findFirst({
      where: { companyId: ctx.companyId, userId: input.studentId, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    if (!student) return fail("Allievo non trovato.", "NOT_FOUND");

    const settings = planSettings(ctx.limits);
    const start = planStart(point(input.lat, input.lng), await headquarters(ctx.companyId));
    const { plan, studentHotspots } = await computeLessonPlan({
      companyId: ctx.companyId,
      studentId: input.studentId,
      durationMin,
      start,
    });
    return ok<RoadPlanDTO>({ ...settings, plan: settings.planEnabled ? plan : null, studentHotspots });
  } catch (error) {
    return fail(formatError(error));
  }
}

export type RoadPlanRouteDTO = {
  /** La linea suggerita `[[lat,lng],…]`, o null se Google non risponde. */
  line: LatLng[] | null;
  lengthMeters: number | null;
};

export async function getRoadPlanRoute(input: { start?: unknown; stops?: unknown }) {
  try {
    const loaded = await instructorCtx();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const s = (input.start ?? {}) as { lat?: unknown; lng?: unknown };
    const rawStart = point(s.lat, s.lng);
    if (!rawStart) return fail("Partenza non valida.", "INVALID");
    const parsed = parseStoredPlan({ stops: input.stops });
    if (!parsed) return fail("Tappe non valide.", "INVALID");
    const stops: StoredPlanStop[] = parsed.stops;

    const examIds = [...new Set(stops.map((x) => x.examRouteId).filter((x): x is string => !!x))];
    const routes = examIds.length
      ? await prisma.roadExamRoute.findMany({
          where: { companyId: ctx.companyId, id: { in: examIds }, archivedAt: null },
          select: { id: true, path: true },
        })
      : [];
    const examPaths = new Map(routes.map((r) => [r.id, (Array.isArray(r.path) ? r.path : []) as LatLng[]]));
    const start = planStart(rawStart, await headquarters(ctx.companyId))!;

    try {
      const pieces = planRoutePieces(start, stops, examPaths);
      const lines = await Promise.all(
        pieces.map(async (p) => (p.kind === "path" ? p.path : (await snapWaypoints(p.points)).path)),
      );
      const line = joinSegments(lines);
      return ok<RoadPlanRouteDTO>({ line, lengthMeters: pathLengthMeters(line) });
    } catch (error) {
      console.warn("[road/plan/route] linea non disponibile", error instanceof Error ? error.message : error);
      return ok<RoadPlanRouteDTO>({ line: null, lengthMeters: null });
    }
  } catch (error) {
    return fail(formatError(error));
  }
}
