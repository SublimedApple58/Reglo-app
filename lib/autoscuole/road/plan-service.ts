import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import { joinSegments, pathLengthMeters } from "@/lib/autoscuole/road/exam-routes";
import { ownInstructorId, roadContext } from "@/lib/autoscuole/road/service";
import { snapWaypoints } from "@/lib/autoscuole/road/snap";
import { computeLessonPlan } from "@/lib/autoscuole/road/lesson-plan-service";
import { roadHeadquarters } from "@/lib/autoscuole/road/headquarters";
import { optimizeStopOrder } from "@/lib/autoscuole/road/plan-route";
import {
  parseStoredPlan,
  planRoutePieces,
  planSettings,
  planEnd,
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
 *   partenza → tappe (percorso d'esame compreso) → sede (REG-653). Alla
 *   partenza ordina le tappe con `optimizeWaypointOrder` e restituisce l'ordine
 *   scelto; nel riaggancio (REG-654) la mobile manda la posizione attuale, solo
 *   le tappe rimaste e `optimize: false`. Google giù = `line: null`, non un
 *   errore.
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
    const sede = await roadHeadquarters(ctx.companyId);
    const start = planStart(point(input.lat, input.lng), sede);
    const hq = planEnd(start, sede);
    const { plan, studentHotspots } = await computeLessonPlan({
      companyId: ctx.companyId,
      studentId: input.studentId,
      durationMin,
      start,
      end: hq,
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
  /** Le chiavi delle tappe nell'ordine della linea (ottimizzato alla partenza). */
  order: string[];
  /** Dove si chiude la linea: la sede, o null se non c'è o è oltre 15 km dalla partenza. */
  end: { lat: number; lng: number } | null;
};

export async function getRoadPlanRoute(input: { start?: unknown; stops?: unknown; optimize?: unknown }) {
  try {
    const loaded = await instructorCtx();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const s = (input.start ?? {}) as { lat?: unknown; lng?: unknown };
    const rawStart = point(s.lat, s.lng);
    if (!rawStart) return fail("Partenza non valida.", "INVALID");
    // Nel riaggancio le tappe rimaste possono essere zero: si torna in sede.
    const parsed: { stops: StoredPlanStop[] } | null | undefined =
      Array.isArray(input.stops) && input.stops.length === 0 ? { stops: [] } : parseStoredPlan({ stops: input.stops });
    if (!parsed) return fail("Tappe non valide.", "INVALID");

    const examIds = [...new Set(parsed.stops.map((x) => x.examRouteId).filter((x): x is string => !!x))];
    const [routes, sede] = await Promise.all([
      examIds.length
        ? prisma.roadExamRoute.findMany({
            where: { companyId: ctx.companyId, id: { in: examIds }, archivedAt: null },
            select: { id: true, path: true },
          })
        : [],
      roadHeadquarters(ctx.companyId),
    ]);
    const start = planStart(rawStart, sede)!;
    const hq = planEnd(start, sede);
    const examPaths = new Map(routes.map((r) => [r.id, (Array.isArray(r.path) ? r.path : []) as LatLng[]]));
    const stops: StoredPlanStop[] =
      input.optimize === false ? parsed.stops : (await optimizeStopOrder(start, parsed.stops, hq)).stops;
    const order = stops.map((x) => x.key);

    // Niente tappe e niente sede (o già in sede): non c'è una linea da disegnare.
    if (!stops.length && (!hq || start === hq)) return ok<RoadPlanRouteDTO>({ line: null, lengthMeters: null, order, end: hq });
    try {
      const pieces = planRoutePieces(start, stops, examPaths, hq);
      const lines = await Promise.all(
        pieces.map(async (p) => (p.kind === "path" ? p.path : (await snapWaypoints(p.points)).path)),
      );
      const line = joinSegments(lines);
      return ok<RoadPlanRouteDTO>({ line, lengthMeters: pathLengthMeters(line), order, end: hq });
    } catch (error) {
      console.warn("[road/plan/route] linea non disponibile", error instanceof Error ? error.message : error);
      return ok<RoadPlanRouteDTO>({ line: null, lengthMeters: null, order, end: hq });
    }
  } catch (error) {
    return fail(formatError(error));
  }
}
