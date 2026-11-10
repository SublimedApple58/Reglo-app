import { Prisma } from "@prisma/client";

import { resolveCarColor } from "@/lib/autoscuole/road/car-colors";
import { normalizeSentiment } from "@/lib/autoscuole/road/catalog";
import { HISTORY_SESSIONS, historyLine } from "@/lib/autoscuole/road/history-line";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { roadHeadquarters } from "@/lib/autoscuole/road/headquarters";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import { isInstructor, isOwner, isStudent } from "@/lib/autoscuole/roles";
import { formatError } from "@/lib/utils";
import {
  ROAD_BASE_MARKERS,
  parseRoadCustomMarkers,
  resolveMarkerLabel,
  type RoadCustomMarker,
} from "@/lib/autoscuole/road/catalog";
import { alignLessonEndToRoad, roadDriveEnd, roadEarlyKeepsDuration } from "@/lib/autoscuole/road/lesson-end";
import { drivingSeconds, resolveEndedAt, sanitizePoints, trackDistanceMeters, type RoadPoint } from "@/lib/autoscuole/road/geo";
import {
  buildCleanTrack,
  CLEAN_TRACK_VERSION,
  cleanTrackPoints,
  storedCleanTrack,
  thumbPath,
  type CleanTrack,
} from "@/lib/autoscuole/road/clean-track";
import { finalizeRoadSession, loadRoadTrack, saveRoadCleanTrack } from "@/lib/autoscuole/road/maintenance";
import { BOOKING_SOURCE } from "@/lib/autoscuole/booking-source";
import { isBookingBlockActive } from "@/lib/autoscuole/booking-block";
import { AUTOSCUOLE_CACHE_SEGMENTS, invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";
import { streetAt } from "@/lib/autoscuole/road/street-at";
import { buildBriefing, rankSuggestions, type Briefing, type SuggestionCandidate } from "@/lib/autoscuole/road/suggestions";
import {
  computePlanReached,
  parseStoredPlan,
  planSettings,
  type PlanReached,
  type StoredPlan,
} from "@/lib/autoscuole/road/lesson-plan";
import { EXAM_ROUTE_MAX_WAYPOINTS, pathLengthMeters, simplifyPath, type LatLng } from "@/lib/autoscuole/road/exam-routes";
import { waypointsFromTrack } from "@/lib/autoscuole/road/snap";
import { markerExtent, normalizeExtentM, storedExtent } from "@/lib/autoscuole/road/marker-extent";
import {
  canStartRoadExam,
  examAnchorRow,
  examRouteName,
  examRowsExaminers,
  examStopFromRoute,
  planWithExamStop,
  roadSessionMode,
} from "@/lib/autoscuole/road/road-exam";

/**
 * REG-638 Reglo Road — logica server. Le route in `app/api/autoscuole/road/**`
 * sono sottili e chiamano queste funzioni; funzionano sia col cookie web sia
 * col Bearer della mobile (`requireServiceAccess`).
 *
 * Regole:
 * - tutto spento se `limits.roadEnabled !== true` (si accende dal backoffice);
 * - v1 solo guide singole in auto: niente gruppi, esami, moto;
 * - «Termina guida» chiude la sessione e segna SUBITO la guida `completed`;
 * - l'allievo vede percorso e segnalazioni solo con `studentNotesEnabled`.
 */

type Result<T> = { success: true; data: T } | { success: false; message: string; code?: string };
const ok = <T>(data: T): Result<T> => ({ success: true, data });
const fail = (message: string, code?: string): Result<never> => ({ success: false, message, code });

const MOTO_CATEGORIES = new Set(["AM", "A1", "A2", "A"]);
/** L'invito a entrare in Road si apre 15 minuti prima dell'inizio. */
export const ROAD_ENTRY_OPENS_MIN = 15;
export const ROAD_ELIGIBLE_STATUSES = ["scheduled", "confirmed", "checked_in"];
const MAX_POINTS_PER_BATCH = 600;

// ─── contesto ────────────────────────────────────────────────────────────────

export async function roadContext() {
  const ctx = await requireServiceAccess("AUTOSCUOLE");
  const limits = await getCachedCompanyServiceLimits(ctx.membership.companyId);
  return {
    ...ctx,
    companyId: ctx.membership.companyId,
    limits,
    roadEnabled: limits.roadEnabled === true,
    // Stesso default di «Mostra note e percorsi nell'app allievi» (spento).
    studentRoadVisible: limits.studentNotesEnabled === true,
    customMarkers: parseRoadCustomMarkers(limits.roadCustomMarkers),
  };
}
export type RoadCtx = Awaited<ReturnType<typeof roadContext>>;

export const canSeeAll = (ctx: RoadCtx) => ctx.membership.role === "admin" || isOwner(ctx.membership.autoscuolaRole);

export async function ownInstructorId(ctx: RoadCtx) {
  if (!isInstructor(ctx.membership.autoscuolaRole)) return null;
  const row = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.membership.userId, status: { not: "inactive" } },
    select: { id: true },
  });
  return row?.id ?? null;
}

type EligibilityInput = {
  type: string;
  groupLessonId: string | null;
  motoLessonType: string | null;
  vehicle: { licenseCategory: string } | null;
  studentId: string | null;
};
/** v1: solo guide singole in auto (niente gruppi, esami, moto). */
export function isRoadEligibleLesson(a: EligibilityInput) {
  if (!a.studentId) return false;
  if (a.groupLessonId) return false;
  if (a.type === "esame" || a.type === "group_lesson") return false;
  if (a.motoLessonType) return false;
  if (a.vehicle && MOTO_CATEGORIES.has(a.vehicle.licenseCategory)) return false;
  return true;
}

const appointmentSelect = {
  id: true,
  companyId: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  studentId: true,
  instructorId: true,
  vehicleId: true,
  groupLessonId: true,
  motoLessonType: true,
  student: { select: { id: true, name: true } },
  instructor: { select: { id: true, name: true, color: true, phone: true, userId: true } },
  vehicle: { select: { id: true, name: true, plate: true, licenseCategory: true, color: true } },
} satisfies Prisma.AutoscuolaAppointmentSelect;
type AppointmentRow = Prisma.AutoscuolaAppointmentGetPayload<{ select: typeof appointmentSelect }>;

const lessonEnd = (a: { startsAt: Date; endsAt: Date | null }) =>
  a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60 * 1000);

function lessonDTO(a: AppointmentRow) {
  return {
    appointmentId: a.id,
    startsAt: a.startsAt.toISOString(),
    endsAt: lessonEnd(a).toISOString(),
    status: a.status,
    student: a.student ? { id: a.student.id, name: a.student.name } : null,
    instructor: a.instructor
      ? { id: a.instructor.id, name: a.instructor.name, color: a.instructor.color, phone: a.instructor.phone }
      : null,
    vehicle: a.vehicle ? { id: a.vehicle.id, name: a.vehicle.name, plate: a.vehicle.plate } : null,
    // Chiave della variante colore dell'auto 3D (veicolo → tinta istruttore → bianco).
    carColor: resolveCarColor(a.vehicle?.color, a.instructor?.color),
  };
}

/**
 * La guida di una sessione IN CORSO: in più `roadEndsAt`, la fine che l'app usa
 * mentre si guida (residuo, «Fine 9:45», avvisi). Con «Mantieni la durata
 * prenotata» e avvio in anticipo è inizio anticipato + durata; altrimenti è
 * `endsAt`. Le app che non lo leggono restano sulla fine prenotata.
 */
function liveLessonDTO(a: AppointmentRow, startedAt: Date | null, keepDuration: boolean) {
  const dto = lessonDTO(a);
  return { ...dto, roadEndsAt: roadDriveEnd(a.startsAt, lessonEnd(a), startedAt, keepDuration).toISOString() };
}

const sessionSelect = {
  id: true,
  appointmentId: true,
  status: true,
  startedAt: true,
  endedAt: true,
  distanceMeters: true,
  durationSec: true,
  pointCount: true,
  lastSeq: true,
  lastLat: true,
  lastLng: true,
  lastSpeed: true,
  lastHeading: true,
  lastStreet: true,
  lastPointAt: true,
  lastEtaAt: true,
  plan: true,
  planReached: true,
  mode: true,
  examiners: true,
} satisfies Prisma.RoadSessionSelect;
type SessionRow = Prisma.RoadSessionGetPayload<{ select: typeof sessionSelect }>;

/** `lessonStartsAt`: i minuti di guida contano dall'inizio della guida (vedi `drivingSeconds`). */
function sessionDTO(s: SessionRow, lessonStartsAt: Date) {
  return {
    id: s.id,
    appointmentId: s.appointmentId,
    status: s.status as "active" | "completed" | "abandoned",
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    distanceMeters: s.distanceMeters,
    durationSec: drivingSeconds(s.startedAt, s.endedAt ?? new Date(), lessonStartsAt),
    lastSeq: s.lastSeq,
    last:
      s.lastLat != null && s.lastLng != null
        ? {
            lat: s.lastLat,
            lng: s.lastLng,
            speed: s.lastSpeed,
            heading: s.lastHeading,
            street: s.lastStreet,
            at: s.lastPointAt?.toISOString() ?? null,
          }
        : null,
    // REG-648: il giro scelto alla partenza (null = senza giro) e, a fine guida, le tappe raggiunte.
    plan: (s.plan as StoredPlan | null) ?? null,
    planReached: (s.planReached as PlanReached | null) ?? null,
    // REG-699: rientro stimato dal telefono (solo con il giro, solo a guida in corso).
    etaAt: s.status === "active" ? (s.lastEtaAt?.toISOString() ?? null) : null,
    // R4: "exam" = Road Exam (solo tracciato, senza allievo).
    mode: roadSessionMode(s.mode),
    examiners: s.examiners,
  };
}

/**
 * R4: in Road Exam la «guida» è l'esame intero, non la riga a cui è ancorata la
 * sessione: niente allievo singolo, ma quanti allievi, dove ed esaminatori.
 */
async function examLessonInfo(anchor: { id: string; companyId: string; startsAt: Date; instructorId: string | null }) {
  const rows = await prisma.autoscuolaAppointment.findMany({
    where: { companyId: anchor.companyId, type: "esame", startsAt: anchor.startsAt, status: { not: "cancelled" } },
    select: { id: true, studentId: true, examiners: true, location: { select: { name: true } }, instructorId: true },
  });
  const same = rows.filter((r) => r.instructorId === anchor.instructorId);
  const group = same.length ? same : rows;
  return {
    appointmentIds: group.map((r) => r.id),
    studentCount: group.filter((r) => r.studentId).length,
    place: group.find((r) => r.location?.name)?.location?.name ?? null,
    examiners: examRowsExaminers(group),
  };
}

async function sessionLessonDTO(
  mode: string,
  a: AppointmentRow,
  startedAt: Date | null,
  limits: Record<string, unknown>,
  live: boolean,
) {
  const base = live ? liveLessonDTO(a, startedAt, roadEarlyKeepsDuration(limits)) : lessonDTO(a);
  if (roadSessionMode(mode) !== "exam") return base;
  return { ...base, student: null, exam: await examLessonInfo(a) };
}

function markerDTO(m: {
  id: string;
  clientId: string;
  kind: string;
  label: string;
  note: string | null;
  lat: number;
  lng: number;
  street: string | null;
  sentiment: string | null;
  extentM: number | null;
  extent: unknown;
  recordedAt: Date;
}) {
  const extentM = normalizeExtentM(m.extentM);
  return {
    id: m.id,
    clientId: m.clientId,
    kind: m.kind,
    label: m.label,
    note: m.note,
    lat: m.lat,
    lng: m.lng,
    street: m.street,
    sentiment: normalizeSentiment(m.sentiment),
    // R7: punto (extentM null) o zona = tratto della strada percorsa di `extentM`
    // metri; `extent` è il tratto calcolato a guida finita (null finché non c'è).
    extentM,
    extent: extentM ? storedExtent(m.extent) : null,
    recordedAt: m.recordedAt.toISOString(),
  };
}
const markerSelect = {
  id: true,
  clientId: true,
  kind: true,
  label: true,
  note: true,
  lat: true,
  lng: true,
  street: true,
  sentiment: true,
  extentM: true,
  extent: true,
  recordedAt: true,
} as const;

/**
 * R7: ricalcola (e salva) i tratti delle segnalazioni «zona» di una guida finita
 * sulla sua traccia pulita. A «Termina guida», dopo una modifica di lunghezza o
 * posizione a guida finita. In guida il tratto lo disegna il telefono.
 */
async function saveMarkerExtents(sessionId: string, only?: string) {
  const s = await prisma.roadSession.findUnique({ where: { id: sessionId }, select: { status: true, cleanTrack: true } });
  if (!s || s.status === "active") return;
  const path = storedCleanTrack(s.cleanTrack)?.path ?? (await loadTrack(sessionId)).map((p) => [p[1], p[2], p[0]] as [number, number, number]);
  const markers = await prisma.roadMarker.findMany({
    where: { sessionId, extentM: { not: null }, ...(only ? { id: only } : {}) },
    select: { id: true, lat: true, lng: true, recordedAt: true, extentM: true },
  });
  for (const m of markers) {
    const line = markerExtent(path, { lat: m.lat, lng: m.lng, recordedAtMs: m.recordedAt.getTime(), extentM: m.extentM });
    await prisma.roadMarker.update({
      where: { id: m.id },
      data: { extent: line ? (line as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
    });
  }
}

/**
 * I punti critici sono in cache 10 minuti (REG-643): una segnalazione nuova,
 * spostata, cambiata o tolta deve vedersi subito. Fuoco e dimentica.
 */
function invalidateRoadHotspots(companyId: string) {
  invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.ROAD] }).catch(() => undefined);
}

/** REG-677: ripasso «Meglio / No» su un punto critico dell'allievo. */
function hotspotCheckDTO(c: {
  id: string;
  clientId: string;
  hotspotKey: string;
  kind: string;
  label: string;
  lat: number;
  lng: number;
  outcome: string;
  recordedAt: Date;
}) {
  return {
    id: c.id,
    clientId: c.clientId,
    hotspotKey: c.hotspotKey,
    kind: c.kind,
    label: c.label,
    lat: c.lat,
    lng: c.lng,
    outcome: (c.outcome === "better" ? "better" : "worse") as "better" | "worse",
    recordedAt: c.recordedAt.toISOString(),
  };
}
const hotspotCheckSelect = {
  id: true,
  clientId: true,
  hotspotKey: true,
  kind: true,
  label: true,
  lat: true,
  lng: true,
  outcome: true,
  recordedAt: true,
} as const;

/**
 * Sessione dell'istruttore: deve essere sua (istruttore della guida) e attiva
 * per le scritture. Gli admin passano sempre (debug/assistenza).
 */
async function loadOwnSession(ctx: RoadCtx, sessionId: string) {
  const session = await prisma.roadSession.findFirst({
    where: { id: sessionId, companyId: ctx.companyId },
    select: { ...sessionSelect, instructorId: true, studentId: true, companyId: true, startedById: true },
  });
  if (!session) return { error: fail("Sessione Road non trovata.", "NOT_FOUND") };
  // R4: chi ha avviato Road Exam (anche un titolare senza scheda istruttore).
  const startedByMe = session.startedById != null && session.startedById === ctx.membership.userId;
  if (!canSeeAll(ctx) && !startedByMe) {
    const mine = await ownInstructorId(ctx);
    if (!mine || mine !== session.instructorId) return { error: fail("Questa guida non è tua.", "FORBIDDEN") };
  }
  return { session };
}

// ─── catalogo + stato per la mobile ─────────────────────────────────────────

export async function getRoadState() {
  try {
    const ctx = await roadContext();
    const base = {
      roadEnabled: ctx.roadEnabled,
      // Road libero: c'è sempre quando Road è acceso (niente impostazione a parte).
      // Il campo resta per le app 2.4.0 che lo leggono ancora.
      freeStartEnabled: ctx.roadEnabled,
      catalog: { base: ROAD_BASE_MARKERS, custom: ctx.customMarkers },
      // REG-648: «Proponi il giro» e «Avvisi delle tappe», accesi di default.
      ...planSettings(ctx.limits),
    };
    if (!ctx.roadEnabled) return ok({ ...base, activeSession: null, eligibleLesson: null });

    const instructorId = await ownInstructorId(ctx);
    // R4: un Road Exam avviato da me (anche da titolare senza scheda istruttore).
    const active = await prisma.roadSession.findFirst({
      where: {
        companyId: ctx.companyId,
        status: "active",
        OR: [...(instructorId ? [{ instructorId }] : []), { startedById: ctx.membership.userId }],
      },
      orderBy: { startedAt: "desc" },
      select: { ...sessionSelect, appointment: { select: appointmentSelect } },
    });
    const activeSession = active
      ? {
          ...sessionDTO(active, active.appointment.startsAt),
          lesson: await sessionLessonDTO(active.mode, active.appointment, active.startedAt, ctx.limits, true),
        }
      : null;
    if (!instructorId) return ok({ ...base, activeSession, eligibleLesson: null });

    const now = new Date();
    const opensFrom = new Date(now.getTime() + ROAD_ENTRY_OPENS_MIN * 60 * 1000);
    const candidates = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: ctx.companyId,
        instructorId,
        status: { in: ROAD_ELIGIBLE_STATUSES },
        startsAt: { lte: opensFrom, gte: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
        roadSession: null,
      },
      orderBy: { startsAt: "asc" },
      select: appointmentSelect,
    });
    const eligible = candidates.find((a) => isRoadEligibleLesson(a) && lessonEnd(a) > now) ?? null;

    return ok({
      ...base,
      activeSession,
      eligibleLesson: eligible ? lessonDTO(eligible) : null,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── sessione: avvio / ripresa ──────────────────────────────────────────────

export async function startRoadSession(input: { appointmentId: string; plan?: unknown }) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED");
    if (typeof input?.appointmentId !== "string") return fail("Guida mancante.");

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: input.appointmentId, companyId: ctx.companyId },
      select: {
        ...appointmentSelect,
        roadSession: { select: { ...sessionSelect, instructorId: true } },
        roadLessonPlan: { select: { stops: true, minutes: true } },
      },
    });
    if (!appointment) return fail("Guida non trovata.", "NOT_FOUND");

    const instructorId = await ownInstructorId(ctx);
    if (!instructorId || appointment.instructorId !== instructorId) {
      return fail("Puoi usare Road solo sulle tue guide.", "FORBIDDEN");
    }
    if (!isRoadEligibleLesson(appointment)) {
      return fail("Road per ora funziona solo con le guide singole in auto.", "NOT_ELIGIBLE");
    }

    // Ripresa (app chiusa e riaperta): stessa sessione, anche se già chiusa
    // la restituiamo così la mobile mostra il riepilogo invece di un errore.
    if (appointment.roadSession) {
      return ok({
        ...sessionDTO(appointment.roadSession, appointment.startsAt),
        lesson: liveLessonDTO(appointment, appointment.roadSession.startedAt, roadEarlyKeepsDuration(ctx.limits)),
        resumed: true,
      });
    }

    if (!ROAD_ELIGIBLE_STATUSES.includes(appointment.status)) {
      return fail("Questa guida non è più in programma.", "NOT_ELIGIBLE");
    }
    const now = new Date();
    if (now.getTime() < appointment.startsAt.getTime() - ROAD_ENTRY_OPENS_MIN * 60 * 1000) {
      return fail(`Road si apre ${ROAD_ENTRY_OPENS_MIN} minuti prima della guida.`, "TOO_EARLY");
    }

    const parsedPlan = planSettings(ctx.limits).planEnabled ? parseStoredPlan(input.plan, now) : null;
    // REG-668: con il giro acceso vince quello salvato per questa guida (anche
    // se il telefono non l'ha ancora caricato), nell'ordine dell'istruttore.
    const saved =
      parsedPlan && appointment.roadLessonPlan
        ? parseStoredPlan({ stops: appointment.roadLessonPlan.stops, minutes: appointment.roadLessonPlan.minutes }, now)
        : null;
    const plan: StoredPlan | null = saved ? { ...saved, custom: true } : (parsedPlan ?? null);

    // Un istruttore ha una sola sessione attiva: quella vecchia (guida
    // precedente dimenticata aperta) si chiude come abbandonata.
    await prisma.roadSession.updateMany({
      where: { companyId: ctx.companyId, status: "active", OR: [{ instructorId }, { startedById: ctx.membership.userId }] },
      data: { status: "abandoned", endedAt: now },
    });

    const created = await prisma.$transaction(async (tx) => {
      const s = await tx.roadSession.create({
        data: {
          companyId: ctx.companyId,
          appointmentId: appointment.id,
          instructorId,
          startedById: ctx.membership.userId,
          studentId: appointment.studentId,
          vehicleId: appointment.vehicleId,
          startedAt: now,
          // Giro scelto nel foglio di partenza; malformato o interruttore spento = senza giro.
          ...(plan ? { plan: plan as unknown as Prisma.InputJsonValue } : {}),
        },
        select: sessionSelect,
      });
      if (appointment.status === "scheduled" || appointment.status === "confirmed") {
        await tx.autoscuolaAppointment.update({ where: { id: appointment.id }, data: { status: "checked_in" } });
      }
      return s;
    });
    return ok({
      ...sessionDTO(created, appointment.startsAt),
      lesson: liveLessonDTO(appointment, created.startedAt, roadEarlyKeepsDuration(ctx.limits)),
      resumed: false,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return startRoadSession(input); // doppio tap: la seconda chiamata riprende
    }
    return fail(formatError(error));
  }
}

// ─── punti GPS a lotti ──────────────────────────────────────────────────────

export async function appendRoadPoints(
  sessionId: string,
  input: { seq: number; points: unknown; street?: string | null; eta?: unknown },
) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;
    if (session.status !== "active") {
      // REG-691: gli ultimi punti partiti dopo «Termina» (rete ballerina) o
      // dopo un nuovo login valgono ancora per 2 h: km e giro si ricalcolano.
      const closedAt = session.endedAt?.getTime() ?? 0;
      if (!closedAt || Date.now() - closedAt > LATE_POINTS_MS) {
        return ok({ accepted: false, reason: "SESSION_CLOSED" as const });
      }
      return appendLatePoints(session, ctx.companyId, input);
    }

    const seq = Number(input?.seq);
    if (!Number.isInteger(seq) || seq < 0) return fail("Lotto non valido.");
    const points = sanitizePoints(input?.points).slice(0, MAX_POINTS_PER_BATCH);
    if (!points.length) return ok({ accepted: true, duplicate: false });

    try {
      await prisma.roadPointBatch.create({
        data: { sessionId, seq, points: points as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return ok({ accepted: true, duplicate: true }); // rimandato dopo un timeout
      }
      throw error;
    }

    const last = points[points.length - 1];
    const prev: RoadPoint | null =
      session.lastLat != null && session.lastLng != null && session.lastPointAt
        ? [session.lastPointAt.getTime(), session.lastLat, session.lastLng, null, null, null]
        : null;
    // Lotti arrivati in ritardo (seq vecchio): contano nei km ma non spostano
    // l'auto all'indietro. A fine guida i km si ricalcolano da zero in ordine.
    const inOrder = seq > session.lastSeq;
    const added = Math.round(trackDistanceMeters(points, inOrder ? prev : null));
    const street = typeof input?.street === "string" ? input.street.trim().slice(0, 120) : null;
    // REG-699: rientro stimato dal telefono; numeri fuori da [adesso − 5 min, adesso + 6 h] non valgono.
    const etaMs = typeof input?.eta === "number" ? input.eta : null;
    const etaOk = etaMs != null && etaMs > Date.now() - 5 * 60_000 && etaMs < Date.now() + 6 * 60 * 60_000;
    const etaPatch = input && "eta" in input ? { lastEtaAt: etaOk ? new Date(etaMs!) : null } : {};

    await prisma.roadSession.update({
      where: { id: sessionId },
      data: {
        distanceMeters: { increment: added },
        pointCount: { increment: points.length },
        ...(inOrder
          ? {
              lastSeq: seq,
              lastLat: last[1],
              lastLng: last[2],
              lastSpeed: last[3],
              lastHeading: last[4],
              lastPointAt: new Date(last[0]),
              ...(street ? { lastStreet: street } : {}),
              ...etaPatch,
            }
          : {}),
      },
    });
    return ok({ accepted: true, duplicate: false });
  } catch (error) {
    return fail(formatError(error));
  }
}

/** REG-691: per quanto tempo dopo la chiusura si accettano ancora punti (stesso limite delle segnalazioni). */
const LATE_POINTS_MS = 2 * 60 * 60 * 1000;

/**
 * Lotto arrivato dopo la chiusura: si salva (idempotente su `seq`) e si
 * ricalcolano km, punti e tappe raggiunte su tutto il percorso. La traccia
 * pulita si rifà subito senza Google (REG-713: i km restano quelli puliti) e il
 * job la aggancia al giro dopo. Per una guida abbandonata la fine segue
 * l'ultimo punto arrivato.
 */
async function appendLatePoints(
  session: { id: string; status: string; startedAt: Date; endedAt: Date | null; lastPointAt: Date | null },
  companyId: string,
  input: { seq: number; points: unknown },
) {
  const seq = Number(input?.seq);
  if (!Number.isInteger(seq) || seq < 0) return fail("Lotto non valido.");
  const points = sanitizePoints(input?.points).slice(0, MAX_POINTS_PER_BATCH);
  if (!points.length) return ok({ accepted: true, duplicate: false });
  try {
    await prisma.roadPointBatch.create({
      data: { sessionId: session.id, seq, points: points as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return ok({ accepted: true, duplicate: true });
    }
    throw error;
  }
  const track = await loadTrack(session.id);
  const last = track[track.length - 1];
  const lastAt = last ? new Date(last[0]) : null;
  const extend = session.status === "abandoned" && lastAt && session.endedAt && lastAt > session.endedAt;
  const lessonStartsAt = extend
    ? (await prisma.roadSession.findUnique({ where: { id: session.id }, select: { appointment: { select: { startsAt: true } } } }))
        ?.appointment?.startsAt
    : null;
  await prisma.roadSession.update({
    where: { id: session.id },
    data: {
      pointCount: track.length,
      ...(last && lastAt && (!session.lastPointAt || lastAt > session.lastPointAt)
        ? { lastLat: last[1], lastLng: last[2], lastPointAt: lastAt }
        : {}),
      ...(extend ? { endedAt: lastAt, durationSec: drivingSeconds(session.startedAt, lastAt, lessonStartsAt) } : {}),
    },
  });
  await saveRoadCleanTrack(prisma, session.id, { snap: false });
  if (session.status === "completed") {
    await savePlanReached(session.id, companyId).catch((e) => console.warn("[road] planReached (late)", e));
  }
  return ok({ accepted: true, duplicate: false, late: true });
}

// ─── segnalazioni ───────────────────────────────────────────────────────────

export async function addRoadMarker(
  sessionId: string,
  input: {
    clientId: string;
    kind: string;
    label?: string | null;
    note?: string | null;
    lat: number;
    lng: number;
    street?: string | null;
    /** "good" | "bad"; assente = neutra (client vecchi). */
    sentiment?: string | null;
    /** R7: lunghezza del tratto (50 | 100 | 200); assente/null = punto. */
    extentM?: number | null;
    recordedAt?: string;
  },
) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;
    // R4: Road Exam registra solo il tracciato.
    if (roadSessionMode(session.mode) === "exam") return fail("In Road Exam non si fanno segnalazioni.", "EXAM_MODE");
    // Una segnalazione in coda offline può arrivare dopo «Termina guida»:
    // la accettiamo fino a 2 ore dopo la chiusura.
    if (session.status !== "active") {
      const closedAt = session.endedAt?.getTime() ?? 0;
      if (Date.now() - closedAt > 2 * 60 * 60 * 1000) return fail("La guida è chiusa.", "SESSION_CLOSED");
    }
    const clientId = typeof input?.clientId === "string" ? input.clientId.trim().slice(0, 64) : "";
    if (!clientId) return fail("Segnalazione non valida.");
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("Posizione non valida.");
    const kind = typeof input?.kind === "string" ? input.kind.trim() : "";
    const label = resolveMarkerLabel(kind, ctx.customMarkers, input?.label);
    if (!label) return fail("Tipo di segnalazione sconosciuto.");
    const recordedAt = input?.recordedAt ? new Date(input.recordedAt) : new Date();

    const existing = await prisma.roadMarker.findUnique({ where: { clientId }, select: markerSelect });
    if (existing) return ok(markerDTO(existing));

    const marker = await prisma.roadMarker.create({
      data: {
        sessionId,
        companyId: ctx.companyId,
        clientId,
        kind,
        label,
        note: typeof input?.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null,
        lat,
        lng,
        street: typeof input?.street === "string" ? input.street.trim().slice(0, 120) || null : null,
        sentiment: normalizeSentiment(input?.sentiment),
        extentM: normalizeExtentM(input?.extentM),
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
      },
      select: markerSelect,
    });
    invalidateRoadHotspots(ctx.companyId);
    // R7: zona arrivata dalla coda offline a guida già finita: il tratto subito.
    if (marker.extentM != null && session.status !== "active") {
      await saveMarkerExtents(sessionId, marker.id).catch((e) => console.warn("[road] markerExtents", e));
      const fresh = await prisma.roadMarker.findUnique({ where: { id: marker.id }, select: markerSelect });
      if (fresh) return ok(markerDTO(fresh));
    }
    return ok(markerDTO(marker));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.roadMarker.findUnique({ where: { clientId: input.clientId }, select: markerSelect });
      if (again) return ok(markerDTO(again));
    }
    return fail(formatError(error));
  }
}

/** «Annulla» dopo una segnalazione: si cancella per id o per clientId. */
export async function removeRoadMarker(sessionId: string, markerIdOrClientId: string) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const isUuid = /^[0-9a-f-]{36}$/i.test(markerIdOrClientId);
    const { count } = await prisma.roadMarker.deleteMany({
      where: {
        sessionId,
        OR: [{ clientId: markerIdOrClientId }, ...(isUuid ? [{ id: markerIdOrClientId }] : [])],
      },
    });
    if (count) invalidateRoadHotspots(ctx.companyId);
    return ok({ removed: true });
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * REG-696: correggere una segnalazione (anche dopo i 5 s dell'«Annulla»):
 * giudizio («fatto bene» / «da migliorare») e posizione (il «qui / 10 s fa»
 * del toast). Per id o clientId.
 *
 * Road novembre R3/R7 (Tiziano 10/11/2026): istruttore della guida e titolare
 * la modificano **sempre**, senza limite di tempo (prima: 2 h dopo la
 * chiusura), anche dal web. Si cambiano anche tipo (`kind`, l'etichetta si
 * ricalcola), punto/zona (`extentM`, R7) e, se la posizione cambia, la
 * via: quella mandata dall'app o, dal web, quella trovata con Places.
 */
export async function updateRoadMarker(
  sessionId: string,
  markerIdOrClientId: string,
  input: {
    sentiment?: string | null;
    lat?: number;
    lng?: number;
    street?: string | null;
    recordedAt?: string;
    note?: string | null;
    kind?: string;
    /** R7: 50 | 100 | 200, null = torna punto. */
    extentM?: number | null;
  },
) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const data: Prisma.RoadMarkerUpdateInput = {};
    if (input && "sentiment" in input) data.sentiment = normalizeSentiment(input.sentiment);
    if (input && "note" in input) {
      data.note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null;
    }
    if (input?.kind != null) {
      const kind = typeof input.kind === "string" ? input.kind.trim() : "";
      const label = resolveMarkerLabel(kind, ctx.customMarkers, null);
      if (!label) return fail("Tipo di segnalazione sconosciuto.");
      data.kind = kind;
      data.label = label;
    }
    if (input && "extentM" in input) {
      data.extentM = normalizeExtentM(input.extentM);
      data.extent = Prisma.DbNull;
    }
    let moved: { lat: number; lng: number } | null = null;
    if (input?.lat != null || input?.lng != null) {
      const lat = Number(input.lat);
      const lng = Number(input.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return fail("Posizione non valida.");
      }
      data.lat = lat;
      data.lng = lng;
      moved = { lat, lng };
    }
    if (input?.recordedAt) {
      const at = new Date(input.recordedAt);
      if (!Number.isNaN(at.getTime())) data.recordedAt = at;
    }
    const isUuid = /^[0-9a-f-]{36}$/i.test(markerIdOrClientId);
    const marker = await prisma.roadMarker.findFirst({
      where: { sessionId, OR: [{ clientId: markerIdOrClientId }, ...(isUuid ? [{ id: markerIdOrClientId }] : [])] },
      select: { id: true, lat: true, lng: true },
    });
    if (!marker) return fail("Segnalazione non trovata.", "NOT_FOUND");
    if (moved && (moved.lat !== marker.lat || moved.lng !== marker.lng)) {
      if (typeof input?.street === "string") {
        data.street = input.street.trim().slice(0, 120) || null;
      } else if (input?.recordedAt == null) {
        // Spostata a mano (mirino o web), non il «qui / 10 s fa» del toast.
        data.street = await streetAt(moved.lat, moved.lng);
      }
    }
    // Posizione cambiata: il tratto va ricalcolato (a guida finita, qui sotto).
    if (data.lat != null) data.extent = Prisma.DbNull;
    let updated = await prisma.roadMarker.update({ where: { id: marker.id }, data, select: markerSelect });
    if (updated.extentM != null && updated.extent == null && loaded.session.status !== "active") {
      await saveMarkerExtents(sessionId, marker.id);
      updated = (await prisma.roadMarker.findUnique({ where: { id: marker.id }, select: markerSelect })) ?? updated;
    }
    if (data.lat != null || data.kind != null || data.sentiment !== undefined || "extentM" in data) {
      invalidateRoadHotspots(ctx.companyId);
    }
    return ok(markerDTO(updated));
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── ripasso sui punti critici (REG-677) ────────────────────────────────────

/**
 * Passando su un punto critico dell'allievo l'istruttore tocca «Meglio» o «No».
 * Come le segnalazioni: idempotente su clientId (coda offline), accettato fino
 * a 2 ore dopo la chiusura; l'allievo è quello della sessione. Il punto si
 * copia (chiave, tipo, nome, centro): il ripasso si riaggancia al punto per
 * tipo e distanza in `buildStudentHotspots`.
 */
export async function addRoadHotspotCheck(
  sessionId: string,
  input: {
    clientId: string;
    hotspotKey: string;
    kind: string;
    label?: string | null;
    lat: number;
    lng: number;
    outcome: string;
    recordedAt?: string;
  },
) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;
    if (roadSessionMode(session.mode) === "exam") return fail("In Road Exam non si fanno ripassi.", "EXAM_MODE");
    if (session.status !== "active") {
      const closedAt = session.endedAt?.getTime() ?? 0;
      if (Date.now() - closedAt > 2 * 60 * 60 * 1000) return fail("La guida è chiusa.", "SESSION_CLOSED");
    }
    const clientId = typeof input?.clientId === "string" ? input.clientId.trim().slice(0, 64) : "";
    if (!clientId) return fail("Ripasso non valido.", "INVALID");
    const hotspotKey = typeof input?.hotspotKey === "string" ? input.hotspotKey.trim().slice(0, 160) : "";
    if (!hotspotKey) return fail("Punto critico mancante.", "INVALID");
    const outcome = input?.outcome;
    if (outcome !== "better" && outcome !== "worse") return fail("Esito non valido.", "INVALID");
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return fail("Posizione non valida.", "INVALID");
    }
    const kind = typeof input?.kind === "string" ? input.kind.trim() : "";
    const label = resolveMarkerLabel(kind, ctx.customMarkers, input?.label);
    if (!label) return fail("Tipo di segnalazione sconosciuto.", "INVALID");
    const recordedAt = input?.recordedAt ? new Date(input.recordedAt) : new Date();

    const existing = await prisma.roadHotspotCheck.findUnique({ where: { clientId }, select: hotspotCheckSelect });
    if (existing) return ok({ id: existing.id, clientId: existing.clientId });

    const check = await prisma.roadHotspotCheck.create({
      data: {
        companyId: ctx.companyId,
        sessionId,
        studentId: session.studentId,
        clientId,
        hotspotKey,
        kind,
        label,
        lat,
        lng,
        outcome,
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
      },
      select: { id: true, clientId: true },
    });
    return ok(check);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.roadHotspotCheck.findUnique({
        where: { clientId: String(input.clientId).trim().slice(0, 64) },
        select: { id: true, clientId: true },
      });
      if (again) return ok(again);
    }
    return fail(formatError(error));
  }
}

/** «Annulla» dopo un ripasso: si cancella per id o per clientId. */
export async function removeRoadHotspotCheck(sessionId: string, checkIdOrClientId: string) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const isUuid = /^[0-9a-f-]{36}$/i.test(checkIdOrClientId);
    await prisma.roadHotspotCheck.deleteMany({
      where: {
        sessionId,
        OR: [{ clientId: checkIdOrClientId }, ...(isUuid ? [{ id: checkIdOrClientId }] : [])],
      },
    });
    return ok({ removed: true });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── fine guida ─────────────────────────────────────────────────────────────

const loadTrack = (sessionId: string) => loadRoadTrack(prisma, sessionId);

/**
 * «Termina guida». REG-714: `endedAt` = l'ora del tocco sul telefono, anche
 * quando la chiusura arriva dopo dalla coda offline (la guida intanto può
 * essere stata chiusa come abbandonata dal job: torna completata con l'ora del
 * telefono). Già completata = si restituisce il dettaglio (idempotente).
 */
export async function endRoadSession(sessionId: string, input: { endedAt?: unknown } = {}) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;

    const queuedClose = session.status === "abandoned" && input.endedAt != null;
    // R4: Road Exam non tocca l'agenda (niente «completata», niente orari): chiude,
    // pulisce la traccia e la salva come percorso d'esame dei suoi esaminatori.
    if (roadSessionMode(session.mode) === "exam" && (session.status === "active" || queuedClose)) {
      const endedAt = resolveEndedAt(input.endedAt, session.startedAt);
      await finalizeRoadSession(prisma, sessionId, "completed", endedAt);
      await saveRoadCleanTrack(prisma, sessionId).catch((e) => console.warn("[road] cleanTrack", e));
      await saveExamRouteFromSession(sessionId, ctx.companyId, ctx.membership.userId).catch((e) =>
        console.warn("[road] examRoute", e),
      );
      return getRoadSessionDetail(sessionId);
    }
    if (session.status === "active" || queuedClose) {
      const endedAt = resolveEndedAt(input.endedAt, session.startedAt);
      await finalizeRoadSession(prisma, sessionId, "completed", endedAt);
      // Decisione di prodotto: «Termina guida» = guida completata subito.
      await prisma.autoscuolaAppointment.updateMany({
        where: { id: session.appointmentId, status: { in: ROAD_ELIGIBLE_STATUSES } },
        data: { status: "completed" },
      });
      // REG-723: l'agenda segue l'orario reale (libere e prenotate), pausa compresa.
      // Segnalazione Ricca: partita in anticipo = anche l'inizio si sposta.
      // Ricca 07/11: con «Mantieni la durata prenotata» l'anticipo non accorcia la guida.
      if (await alignLessonEndToRoad(prisma, session.appointmentId, endedAt, session.startedAt, roadEarlyKeepsDuration(ctx.limits))) {
        await invalidateLessonAgenda(ctx.companyId);
      }
      await savePlanReached(sessionId, ctx.companyId).catch((e) => console.warn("[road] planReached", e));
      // REG-665 / REG-713: traccia pulita e sulle strade, una volta sola, con i
      // suoi km (li legge il riepilogo qui sotto). Google giù = la riprova il job.
      await saveRoadCleanTrack(prisma, sessionId).catch((e) => console.warn("[road] cleanTrack", e));
      // R7: i tratti delle segnalazioni «zona» sulla traccia pulita.
      await saveMarkerExtents(sessionId).catch((e) => console.warn("[road] markerExtents", e));
    }
    return getRoadSessionDetail(sessionId);
  } catch (error) {
    return fail(formatError(error));
  }
}

/** REG-648: a fine guida, quali tappe del giro il tracciato ha toccato. */
async function savePlanReached(sessionId: string, companyId: string) {
  const s = await prisma.roadSession.findUnique({ where: { id: sessionId }, select: { plan: true } });
  const plan = parseStoredPlan(s?.plan);
  if (!plan) return;
  const examIds = plan.stops.map((x) => x.examRouteId).filter((x): x is string => !!x);
  const [track, routes] = await Promise.all([
    loadTrack(sessionId),
    examIds.length
      ? prisma.roadExamRoute.findMany({ where: { companyId, id: { in: examIds } }, select: { id: true, path: true } })
      : Promise.resolve([]),
  ]);
  const examPaths = new Map(routes.map((r) => [r.id, (Array.isArray(r.path) ? r.path : []) as LatLng[]]));
  const reached = computePlanReached(plan.stops, track.map((p) => [p[1], p[2]] as LatLng), examPaths);
  await prisma.roadSession.update({
    where: { id: sessionId },
    data: { planReached: reached as unknown as Prisma.InputJsonValue },
  });
}

const invalidateLessonAgenda = (companyId: string) =>
  invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA] });

// ─── lettura: dettaglio, traccia, allievo ───────────────────────────────────

/** Pagellino della guida (sola lettura, per riepilogo e dettaglio web). */
async function evaluationSummary(appointmentId: string) {
  const rows = await prisma.autoscuolaAppointmentEvaluation.findMany({
    where: { appointmentId },
    orderBy: { item: { position: "asc" } },
    select: { score: true, notApplicable: true, updatedAt: true, item: { select: { label: true, scaleMax: true } } },
  });
  if (!rows.length) return null;
  return {
    items: rows.map((r) => ({ label: r.item.label, scaleMax: r.item.scaleMax, score: r.score, notApplicable: r.notApplicable })),
    updatedAt: rows.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), rows[0].updatedAt).toISOString(),
  };
}

async function buildDetail(sessionId: string, companyId: string) {
  const s = await prisma.roadSession.findFirst({
    where: { id: sessionId, companyId },
    select: {
      ...sessionSelect,
      appointment: { select: appointmentSelect },
      markers: { orderBy: { recordedAt: "asc" }, select: markerSelect },
      hotspotChecks: { orderBy: { recordedAt: "asc" }, select: hotspotCheckSelect },
    },
  });
  if (!s) return null;
  const clean = await readCleanTrack(sessionId, s.status);
  return {
    // REG-713: i km sono quelli salvati sulla sessione (gli stessi di storico e liste).
    ...sessionDTO(s, s.appointment.startsAt),
    lesson: await sessionLessonDTO(s.mode, s.appointment, s.startedAt, {}, false),
    // R7: guida finita senza tratto salvato (chiusa dal job, segnalazione in coda
    // arrivata dopo): il tratto si ricava al volo dalla traccia, senza scrivere.
    markers: s.markers.map((m) => {
      const dto = markerDTO(m);
      if (dto.extentM && !dto.extent && s.status !== "active") {
        return { ...dto, extent: markerExtent(clean.path, { lat: m.lat, lng: m.lng, recordedAtMs: m.recordedAt.getTime(), extentM: dto.extentM }) };
      }
      return dto;
    }),
    // REG-677: i ripassi «Meglio / No» sui punti critici dell'allievo in questa guida.
    hotspotChecks: s.hotspotChecks.map(hotspotCheckDTO),
    // Per la mappa bastano [lat, lng]; il tempo serve a disegnare il "fatto fin qui".
    // REG-665: traccia pulita (e sulle strade a guida finita) + soste ≥ 5 min.
    track: clean.path,
    stops: clean.stops,
  };
}

/**
 * REG-665 / REG-713: la traccia pulita da mostrare. Solo lettura: niente
 * scritture né Google. Guida finita = quella salvata (a «Termina guida» o dal
 * job); se non c'è ancora, o la guida è in corso, pulita al volo e basta.
 */
async function readCleanTrack(sessionId: string, status: string): Promise<CleanTrack> {
  if (status !== "active") {
    const row = await prisma.roadSession.findUnique({ where: { id: sessionId }, select: { cleanTrack: true } });
    const stored = storedCleanTrack(row?.cleanTrack);
    if (stored) return stored;
  }
  return buildCleanTrack(await loadTrack(sessionId), { snap: false });
}

/**
 * Miniature per le liste: dalla traccia salvata (solo il campo `thumb`, senza
 * leggere tutto il percorso); per le sessioni senza, pulita al volo e senza
 * Google (la versione agganciata arriva alla prima apertura del dettaglio).
 */
async function sessionThumbs(ids: string[]): Promise<Map<string, Array<[number, number]>>> {
  const out = new Map<string, Array<[number, number]>>();
  if (!ids.length) return out;
  const rows = await prisma.$queryRaw<Array<{ id: string; thumb: Array<[number, number]> | null }>>`
    SELECT id::text AS id, "cleanTrack"->'thumb' AS thumb FROM "RoadSession"
    WHERE id = ANY(${ids}::uuid[]) AND ("cleanTrack"->>'v')::int = ${CLEAN_TRACK_VERSION}`;
  for (const r of rows) if (Array.isArray(r.thumb)) out.set(r.id, r.thumb);
  await Promise.all(
    ids
      .filter((id) => !out.has(id))
      .map(async (id) => out.set(id, thumbPath(cleanTrackPoints(await loadTrack(id)).path))),
  );
  return out;
}

export async function getRoadSessionDetail(sessionId: string) {
  try {
    const ctx = await roadContext();
    if (!canSeeAll(ctx)) {
      const loaded = await loadOwnSession(ctx, sessionId);
      if ("error" in loaded) return loaded.error!;
    }
    const detail = await buildDetail(sessionId, ctx.companyId);
    if (!detail) return fail("Sessione Road non trovata.", "NOT_FOUND");
    return ok({ ...detail, evaluation: await evaluationSummary(detail.appointmentId) });
  } catch (error) {
    return fail(formatError(error));
  }
}

/** Solo i lotti nuovi dopo `afterSeq` (la mappa web li aggiunge al percorso). */
export async function getRoadTrackDelta(sessionId: string, afterSeq: number) {
  try {
    const ctx = await roadContext();
    if (!canSeeAll(ctx)) return fail("Non autorizzato.", "FORBIDDEN");
    const s = await prisma.roadSession.findFirst({ where: { id: sessionId, companyId: ctx.companyId }, select: { id: true } });
    if (!s) return fail("Sessione Road non trovata.", "NOT_FOUND");
    const batches = await prisma.roadPointBatch.findMany({
      where: { sessionId, seq: { gt: Number.isFinite(afterSeq) ? afterSeq : -1 } },
      orderBy: { seq: "asc" },
      select: { seq: true, points: true },
    });
    const points = batches
      .flatMap((b) => (b.points as unknown as RoadPoint[]))
      .sort((a, b) => a[0] - b[0])
      .map((p) => [p[1], p[2], p[0]] as [number, number, number]);
    return ok({ lastSeq: batches.at(-1)?.seq ?? afterSeq, points });
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * Sessione Road di una guida. Allievo: solo la sua guida, e solo se
 * l'autoscuola ha attivo «Mostra note e percorsi nell'app allievi».
 */
export async function getRoadForAppointment(appointmentId: string) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return ok(null);
    const session = await prisma.roadSession.findFirst({
      where: { appointmentId, companyId: ctx.companyId },
      select: { id: true, studentId: true, instructorId: true, status: true },
    });
    if (!session) return ok(null);

    if (isStudent(ctx.membership.autoscuolaRole) && ctx.membership.role !== "admin") {
      if (session.studentId !== ctx.membership.userId) return fail("Non autorizzato.", "FORBIDDEN");
      if (!ctx.studentRoadVisible) return ok(null);
      if (session.status === "active") return ok(null); // l'allievo la vede a guida finita
      const detail = await buildDetail(session.id, ctx.companyId);
      // Il telefono dell'istruttore serve solo al «Chiama» del titolare in web.
      if (detail?.lesson.instructor) detail.lesson.instructor.phone = null;
      // Il giro non lo vede l'allievo (piano 003): i motivi parlano dei suoi errori e di quelli degli altri.
      return ok(detail ? { ...detail, plan: null, planReached: null } : null);
    }
    if (!canSeeAll(ctx)) {
      const mine = await ownInstructorId(ctx);
      if (!mine || mine !== session.instructorId) return fail("Non autorizzato.", "FORBIDDEN");
    }
    const detail = await buildDetail(session.id, ctx.companyId);
    return ok(detail ? { ...detail, evaluation: await evaluationSummary(appointmentId) } : null);
  } catch (error) {
    return fail(formatError(error));
  }
}


/**
 * Pagellino per guida: voci valutate (o «non applicabile») su voci attive.
 * `null` se l'autoscuola ha il pagellino spento o senza voci.
 */
async function evaluationProgress(ctx: RoadCtx, appointmentIds: string[]) {
  if (ctx.limits.evaluationSheetEnabled !== true) return null;
  const total = await prisma.autoscuolaEvaluationItem.count({ where: { companyId: ctx.companyId, archivedAt: null } });
  if (!total) return null;
  const done = new Map<string, number>();
  if (appointmentIds.length) {
    const rows = await prisma.autoscuolaAppointmentEvaluation.groupBy({
      by: ["appointmentId"],
      where: { appointmentId: { in: appointmentIds }, OR: [{ score: { not: null } }, { notApplicable: true }] },
      _count: { _all: true },
    });
    for (const r of rows) done.set(r.appointmentId, Math.min(r._count._all, total));
  }
  return { total, done };
}

/**
 * Percorsi Road delle guide di un allievo (dettaglio allievo web, storico guide
 * nell'app istruttore): per guida km, minuti, segnalazioni e una miniatura.
 * Titolare: tutte. Istruttore: solo le sue, come `getRoadForAppointment`.
 */
export async function getRoadForStudent(studentId: string) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return ok({ items: [] });
    if (isStudent(ctx.membership.autoscuolaRole) && ctx.membership.role !== "admin") {
      return fail("Non autorizzato.", "FORBIDDEN");
    }
    let instructorId: string | undefined;
    if (!canSeeAll(ctx)) {
      const mine = await ownInstructorId(ctx);
      if (!mine) return fail("Non autorizzato.", "FORBIDDEN");
      instructorId = mine;
    }
    const sessions = await prisma.roadSession.findMany({
      where: { companyId: ctx.companyId, studentId, status: { not: "active" }, ...(instructorId ? { instructorId } : {}) },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: { ...sessionSelect, appointment: { select: { startsAt: true } } },
    });
    const counts = await markerCounts(sessions.map((x) => x.id));
    const evaluations = await evaluationProgress(ctx, sessions.map((x) => x.appointmentId));
    const thumbs = await sessionThumbs(sessions.map((x) => x.id));
    const items = await Promise.all(
      sessions.map(async (x) => ({
        ...sessionDTO(x, x.appointment.startsAt),
        ...markerSummary(counts, x.id),
        thumb: thumbs.get(x.id) ?? [],
        // REG-660: pagellino della guida (null se il pagellino è spento).
        evaluation: evaluations ? { done: evaluations.done.get(x.appointmentId) ?? 0, total: evaluations.total } : null,
      })),
    );
    // Briefing per voce (tab Road «Parti con»): sulle guide di tutta
    // l'autoscuola, perché serve anche a chi porta l'allievo la prima volta.
    const briefing = (await loadBriefings(ctx.companyId, [studentId])).get(studentId) ?? null;
    // REG-660: i suoi errori ripetuti (foglio «Road di <allievo>» nell'app).
    // Import dinamico: lesson-plan-service importa già questo modulo.
    const { loadStudentHotspots } = await import("@/lib/autoscuole/road/lesson-plan-service");
    const hotspots = await loadStudentHotspots(ctx.companyId, studentId);
    return ok({ items, briefing, hotspots });
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * Tasto «Storico» della guida dal vivo (Ricca, punti 8+9): le ultime
 * `HISTORY_SESSIONS` tracce dell'allievo, ANCHE quelle fatte con altri
 * istruttori (come briefing e punti critici: servono a chi lo porta oggi).
 * Solo la forma, sfoltita: niente segnalazioni, km o pagellino.
 */
export async function getRoadStudentHistory(studentId: string) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return ok({ items: [] });
    if (!canSeeAll(ctx) && !(await ownInstructorId(ctx))) return fail("Non autorizzato.", "FORBIDDEN");
    const sessions = await prisma.roadSession.findMany({
      where: { companyId: ctx.companyId, studentId, status: { not: "active" } },
      orderBy: { startedAt: "desc" },
      take: HISTORY_SESSIONS,
      select: { id: true, status: true, startedAt: true },
    });
    const items = await Promise.all(
      sessions.map(async (x) => ({
        id: x.id,
        startedAt: x.startedAt.toISOString(),
        track: historyLine((await readCleanTrack(x.id, x.status)).path),
      })),
    );
    return ok({ items: items.filter((x) => x.track.length >= 2) });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── web: dal vivo, oggi, storico ───────────────────────────────────────────

/** Inizio/fine del giorno italiano che contiene `date`, in UTC. */
export function romeDayBounds(date = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const offsetFor = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
    const m = parts.match(/GMT([+-]\d+)(?::(\d+))?/);
    const h = m ? Number(m[1]) : 1;
    return `${h >= 0 ? "+" : "-"}${String(Math.abs(h)).padStart(2, "0")}:${m?.[2] ?? "00"}`;
  };
  const start = new Date(`${ymd}T00:00:00${offsetFor(date)}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function requireWebRoad() {
  const ctx = await roadContext();
  if (!ctx.roadEnabled) return { error: fail("Reglo Road non è attivo.", "ROAD_DISABLED") };
  if (!canSeeAll(ctx)) return { error: fail("Non autorizzato.", "FORBIDDEN") };
  return { ctx };
}

type MarkerCount = { count: number; kinds: string[]; good: number; bad: number };

async function markerCounts(sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, MarkerCount>();
  const rows = await prisma.roadMarker.findMany({
    where: { sessionId: { in: sessionIds } },
    orderBy: { recordedAt: "asc" },
    select: { sessionId: true, kind: true, sentiment: true },
  });
  const map = new Map<string, MarkerCount>();
  for (const r of rows) {
    const cur = map.get(r.sessionId) ?? { count: 0, kinds: [], good: 0, bad: 0 };
    cur.count += 1;
    cur.kinds.push(r.kind);
    const sg = normalizeSentiment(r.sentiment);
    if (sg === "good") cur.good += 1;
    else if (sg === "bad") cur.bad += 1;
    map.set(r.sessionId, cur);
  }
  return map;
}

/** Riassunto segnalazioni di una sessione per le liste (dal vivo, oggi, storico). */
function markerSummary(counts: Map<string, MarkerCount>, sessionId: string) {
  const c = counts.get(sessionId);
  return { markerCount: c?.count ?? 0, markerKinds: c?.kinds ?? [], markerGood: c?.good ?? 0, markerBad: c?.bad ?? 0 };
}

/**
 * REG-655: la sede manca? Con Road acceso e la sede senza coordinate (né un
 * indirizzo che si riesca a geocodificare) il giro non sa dove chiudersi: la web
 * ferma il titolare finché non la inserisce (REG-656), gli altri vedono un avviso.
 * `canEdit` = titolare (REG-656: prima anche gli admin, che però non possono salvarla).
 */
export async function getRoadHeadquartersStatus() {
  try {
    const ctx = await roadContext();
    const missing = ctx.roadEnabled ? (await roadHeadquarters(ctx.companyId)) == null : false;
    // Il nome resta quello della sede che c'è già (nasce «Sede {autoscuola}»).
    const sede = missing
      ? await prisma.autoscuolaLocation.findFirst({
          where: { companyId: ctx.companyId, isDefault: true, archivedAt: null },
          select: { name: true },
        })
      : null;
    return ok({
      roadEnabled: ctx.roadEnabled,
      missing,
      // Solo il titolare salva la sede (`updateDefaultAutoscuolaLocation`): gli altri vedono l'avviso.
      canEdit: isOwner(ctx.membership.autoscuolaRole),
      sedeName: sede?.name ?? null,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}

export async function getRoadLive() {
  try {
    const loaded = await requireWebRoad();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const now = new Date();

    const active = await prisma.roadSession.findMany({
      where: { companyId: ctx.companyId, status: "active" },
      orderBy: { startedAt: "asc" },
      select: { ...sessionSelect, appointment: { select: appointmentSelect } },
    });
    const counts = await markerCounts(active.map((s) => s.id));
    const recent = active.length
      ? await prisma.roadMarker.findMany({
          where: { sessionId: { in: active.map((s) => s.id) } },
          orderBy: { recordedAt: "desc" },
          select: { ...markerSelect, sessionId: true },
        })
      : [];

    // Auto in sede: veicoli attivi non impegnati adesso, con la prossima guida.
    const busyVehicleIds = new Set(active.map((s) => s.appointment.vehicleId).filter(Boolean) as string[]);
    const vehicles = await prisma.autoscuolaVehicle
      .findMany({
        // v1 solo auto: le moto non compaiono tra le «auto in sede».
        where: { companyId: ctx.companyId, status: { not: "inactive" }, licenseCategory: { notIn: [...MOTO_CATEGORIES] } },
        select: { id: true, name: true, plate: true, color: true },
      })
      .catch(() => [] as { id: string; name: string; plate: string | null; color: string | null }[]);
    const { end: dayEnd } = romeDayBounds(now);
    const upcoming = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: ctx.companyId,
        vehicleId: { in: vehicles.map((v) => v.id) },
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        endsAt: { gt: now },
        startsAt: { lt: dayEnd },
      },
      orderBy: { startsAt: "asc" },
      select: { vehicleId: true, startsAt: true, endsAt: true },
    });
    const inUseNow = new Set(
      upcoming.filter((a) => a.startsAt <= now && (a.endsAt ?? a.startsAt) > now).map((a) => a.vehicleId!),
    );
    const atBase = vehicles
      .filter((v) => !busyVehicleIds.has(v.id) && !inUseNow.has(v.id))
      .map((v) => ({
        id: v.id,
        name: v.name,
        plate: v.plate,
        carColor: resolveCarColor(v.color),
        freeUntil: upcoming.find((a) => a.vehicleId === v.id && a.startsAt > now)?.startsAt.toISOString() ?? null,
      }));

    // REG-655: la sede è solo quella vera (`isDefault`); gli altri luoghi vanno
    // a parte, con il loro segnaposto (REG-657). Prima la «sede» era il primo
    // luogo con le coordinate, anche archiviato.
    const locations = await prisma.autoscuolaLocation
      .findMany({
        where: { companyId: ctx.companyId, archivedAt: null, latitude: { not: null }, longitude: { not: null } },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true, isDefault: true, latitude: true, longitude: true },
      })
      .catch(() => []);
    const pin = (l: (typeof locations)[number]) => ({ name: l.name, lat: Number(l.latitude), lng: Number(l.longitude) });
    const base = locations.find((l) => l.isDefault);

    return ok({
      now: now.toISOString(),
      base: base ? pin(base) : null,
      places: locations.filter((l) => !l.isDefault).map((l) => ({ id: l.id, ...pin(l) })),
      sessions: await Promise.all(active.map(async (s) => ({
        ...sessionDTO(s, s.appointment.startsAt),
        lesson: await sessionLessonDTO(s.mode, s.appointment, s.startedAt, {}, false),
        ...markerSummary(counts, s.id),
        recentMarkers: recent.filter((m) => m.sessionId === s.id).slice(0, 3).map(markerDTO),
      }))),
      atBase,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}

/** Guide di oggi (singole in auto) con lo stato Road di ciascuna. */
export async function getRoadToday() {
  try {
    const loaded = await requireWebRoad();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const { start, end } = romeDayBounds();
    const rows = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: ctx.companyId,
        startsAt: { gte: start, lt: end },
        status: { notIn: ["cancelled", "proposal"] },
      },
      orderBy: { startsAt: "asc" },
      select: { ...appointmentSelect, roadSession: { select: sessionSelect } },
    });
    const lessons = rows.filter(isRoadEligibleLesson);
    const counts = await markerCounts(lessons.map((r) => r.roadSession?.id).filter(Boolean) as string[]);
    return ok(
      lessons.map((r) => ({
        ...lessonDTO(r),
        road: r.roadSession
          ? { ...sessionDTO(r.roadSession, r.startsAt), ...markerSummary(counts, r.roadSession.id) }
          : null,
      })),
    );
  } catch (error) {
    return fail(formatError(error));
  }
}

export async function getRoadHistory(input: {
  from?: string | null;
  to?: string | null;
  instructorId?: string | null;
  studentId?: string | null;
  cursor?: string | null;
  limit?: number;
}) {
  try {
    const loaded = await requireWebRoad();
    if ("error" in loaded) return loaded.error!;
    const { ctx } = loaded;
    const take = Math.min(Math.max(Number(input.limit) || 30, 1), 100);
    const where: Prisma.RoadSessionWhereInput = {
      companyId: ctx.companyId,
      status: { not: "active" },
      ...(input.instructorId ? { instructorId: input.instructorId } : {}),
      ...(input.studentId ? { studentId: input.studentId } : {}),
      startedAt: {
        ...(input.from ? { gte: new Date(input.from) } : {}),
        ...(input.to ? { lt: new Date(input.to) } : {}),
      },
    };
    const rows = await prisma.roadSession.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: { ...sessionSelect, appointment: { select: appointmentSelect } },
    });
    const page = rows.slice(0, take);
    const counts = await markerCounts(page.map((r) => r.id));
    return ok({
      items: await Promise.all(page.map(async (s) => ({
        ...sessionDTO(s, s.appointment.startsAt),
        lesson: await sessionLessonDTO(s.mode, s.appointment, s.startedAt, {}, false),
        ...markerSummary(counts, s.id),
      }))),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}

export type { RoadCustomMarker };

// ─── Road libero: avviare una guida che non è in agenda (piano A) ───────────

const FREE_BUSY_STATUSES_EXCLUDED = ["cancelled", "no_show"];
const FREE_DEFAULT_DURATION = 60;

/** Inizio di una guida libera: adesso, al minuto. */
const freeStartNow = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
};

async function freeStartDurations(companyId: string, instructorId: string, limits: Record<string, unknown>) {
  const { resolveEffectiveSettingsForInstructor, buildCompanyBookingDefaults } = await import(
    "@/lib/autoscuole/instructor-clusters"
  );
  const eff = await resolveEffectiveSettingsForInstructor(companyId, instructorId, buildCompanyBookingDefaults(limits));
  const durations = [...new Set(eff.bookingSlotDurations.filter((d) => d > 0))].sort((a, b) => a - b);
  const list = durations.length ? durations : [30, 60, 90];
  return { durations: list, defaultDuration: list.includes(FREE_DEFAULT_DURATION) ? FREE_DEFAULT_DURATION : list[0] };
}

/** La guida dell'istruttore di adesso (o che parte entro l'apertura di Road), se c'è. */
async function currentOwnLesson(ctx: RoadCtx, instructorId: string, until: Date) {
  const now = new Date();
  const rows = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId: ctx.companyId,
      instructorId,
      status: { in: ROAD_ELIGIBLE_STATUSES },
      startsAt: { lt: until, gte: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
      roadSession: null,
    },
    orderBy: { startsAt: "asc" },
    select: appointmentSelect,
  });
  const opensFrom = now.getTime() + ROAD_ENTRY_OPENS_MIN * 60 * 1000;
  return rows.find((a) => isRoadEligibleLesson(a) && lessonEnd(a) > now && a.startsAt.getTime() <= opensFrom) ?? null;
}

/**
 * Cosa serve al foglio «Avvia guida»: durate dell'istruttore, veicoli (con
 * quelli occupati adesso segnati), allievi recenti e l'eventuale guida di
 * adesso (allora la mobile propone di entrare in Road su quella).
 */
export async function getRoadFreeStartOptions() {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED");
    const instructorId = await ownInstructorId(ctx);
    if (!instructorId) return fail("Solo gli istruttori possono avviare una guida da Road.", "FORBIDDEN");

    const now = new Date();
    const { durations, defaultDuration } = await freeStartDurations(ctx.companyId, instructorId, ctx.limits);
    const windowEnd = new Date(now.getTime() + defaultDuration * 60 * 1000);

    const day = romeDayBounds();
    const [vehicles, busyRows, preferred, recent, current, todayRows] = await Promise.all([
      prisma.autoscuolaVehicle.findMany({
        where: {
          companyId: ctx.companyId,
          status: "active",
          OR: [{ assignedInstructorId: null }, { assignedInstructorId: instructorId }],
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, plate: true, licenseCategory: true, transmission: true, color: true, assignedInstructorId: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: ctx.companyId,
          status: { notIn: FREE_BUSY_STATUSES_EXCLUDED },
          startsAt: { lt: windowEnd },
          endsAt: { gt: now },
          OR: [{ vehicleId: { not: null } }, { appointmentVehicles: { some: {} } }],
        },
        select: {
          vehicleId: true,
          appointmentVehicles: { select: { vehicleId: true } },
          instructor: { select: { name: true } },
        },
      }),
      prisma.autoscuolaInstructorPreferredVehicle.findMany({ where: { instructorId }, select: { vehicleId: true } }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: ctx.companyId,
          instructorId,
          type: { notIn: ["esame", "group_lesson"] },
          groupLessonId: null,
          status: { notIn: ["cancelled"] },
          startsAt: { lt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
          studentId: { not: null },
        },
        orderBy: { startsAt: "desc" },
        take: 40,
        select: { vehicleId: true, student: { select: { id: true, name: true } } },
      }),
      currentOwnLesson(ctx, instructorId, windowEnd),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: ctx.companyId,
          instructorId,
          startsAt: { gte: day.start, lt: day.end },
          status: { notIn: ["cancelled", "proposal"] },
        },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true, student: { select: { name: true } } },
      }),
    ]);

    // Auto impegnate adesso → con chi (per «in guida con …»).
    const busy = new Map<string, string | null>();
    for (const r of busyRows) {
      const who = r.instructor?.name ?? null;
      if (r.vehicleId) busy.set(r.vehicleId, who);
      r.appointmentVehicles.forEach((v) => busy.set(v.vehicleId, who));
    }
    const cars = vehicles.filter((v) => !MOTO_CATEGORIES.has(v.licenseCategory));
    const lastUsed = recent.find((r) => r.vehicleId && cars.some((v) => v.id === r.vehicleId))?.vehicleId ?? null;
    const preferredIds = new Set(preferred.map((p) => p.vehicleId));
    const pick =
      cars.find((v) => v.assignedInstructorId === instructorId && !busy.has(v.id)) ??
      cars.find((v) => preferredIds.has(v.id) && !busy.has(v.id)) ??
      cars.find((v) => v.id === lastUsed && !busy.has(v.id)) ??
      cars.find((v) => !busy.has(v.id)) ??
      null;

    const seen = new Set<string>();
    const recentStudents: Array<{ id: string; name: string }> = [];
    for (const r of recent) {
      if (!r.student || seen.has(r.student.id)) continue;
      seen.add(r.student.id);
      recentStudents.push({ id: r.student.id, name: r.student.name });
      if (recentStudents.length >= 8) break;
    }

    const instructor = await prisma.autoscuolaInstructor.findUnique({ where: { id: instructorId }, select: { color: true } });
    // Allievi con le prenotazioni bloccate: la mobile lo scrive già nella lista.
    const blockedRows = await prisma.companyMember.findMany({
      where: { companyId: ctx.companyId, autoscuolaRole: "STUDENT", bookingBlocked: true },
      select: { userId: true, bookingBlocked: true, bookingBlockUntil: true },
    });
    const blockedStudentIds = blockedRows.filter((m) => isBookingBlockActive(m)).map((m) => m.userId);

    const tab = await roadTabExtras(ctx, instructorId, now, current, cars.map((v) => v.id), day.end);
    const nextRow = todayRows.find((r) => r.startsAt > now) ?? null;
    return ok({
      durations,
      defaultDuration,
      vehicles: cars.map((v) => ({
        id: v.id,
        name: v.name,
        plate: v.plate,
        licenseCategory: v.licenseCategory,
        transmission: v.transmission,
        carColor: resolveCarColor(v.color, instructor?.color ?? null),
        busy: busy.has(v.id),
        busyWith: busy.get(v.id) ?? null,
        // «la tua»: auto esclusiva dell'istruttore (o la sua preferita).
        mine: v.assignedInstructorId === instructorId || preferredIds.has(v.id),
        // «libera fino alle 16:00»: la prossima guida di oggi con quest'auto.
        freeUntil: tab.vehicleNextUse.get(v.id) ?? null,
      })),
      defaultVehicleId: pick?.id ?? null,
      recentStudents,
      currentLesson: current ? lessonDTO(current) : null,
      // Per il pannello «Pronto a partire?» della tab Road.
      blockedStudentIds,
      todayCount: todayRows.length,
      nextLessonAt: nextRow?.startsAt.toISOString() ?? null,
      // Tab Road «mappa corta» (27/10): «alle 15:30 hai Giulia Bassi».
      nextLesson: nextRow ? { startsAt: nextRow.startsAt.toISOString(), studentName: nextRow.student?.name ?? null } : null,
      suggestions: tab.suggestions,
      briefings: tab.briefings,
      toClose: tab.toClose,
      recentSessions: tab.recentSessions,
      headquarters: tab.headquarters,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * «Avvia guida» da Road: crea una guida VERA in agenda (stessi controlli,
 * crediti e pagamento delle guide create dall'istruttore: passa da
 * `createAutoscuolaAppointment`), già «presente», `bookingSource: "road"`,
 * da adesso per la durata scelta; poi apre la sessione Road su quella.
 *
 * Conferme (come nell'agenda): limite settimanale e pausa tra le guide tornano
 * un codice; la mobile richiede con `confirmWeeklyLimit` / `confirmNoBuffer`.
 */
export async function startFreeRoadSession(input: {
  studentId: string;
  vehicleId: string;
  durationMin: number;
  confirmWeeklyLimit?: boolean;
  confirmNoBuffer?: boolean;
  confirmStudentBlocked?: boolean;
  plan?: unknown;
}) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED");
    if (typeof input?.studentId !== "string" || typeof input?.vehicleId !== "string") {
      return fail("Scegli allievo e veicolo.");
    }
    const durationMin = Math.round(Number(input.durationMin));
    if (!Number.isFinite(durationMin) || durationMin < 15 || durationMin > 240) return fail("Durata non valida.");

    const instructorId = await ownInstructorId(ctx);
    if (!instructorId) return fail("Solo gli istruttori possono avviare una guida da Road.", "FORBIDDEN");

    const active = await prisma.roadSession.findFirst({
      where: { companyId: ctx.companyId, instructorId, status: "active" },
      select: { id: true },
    });
    if (active) return fail("Hai già una guida in corso in Road.", "ACTIVE_SESSION");

    const startsAt = freeStartNow();
    const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

    // La sua guida di adesso: niente doppione, si entra in Road su quella.
    const current = await currentOwnLesson(ctx, instructorId, endsAt);
    if (current) {
      return { ...fail("Hai già una guida adesso: entra in Road su quella.", "CURRENT_LESSON"), lesson: lessonDTO(current) };
    }

    const [student, vehicle] = await Promise.all([
      prisma.companyMember.findFirst({
        where: { companyId: ctx.companyId, userId: input.studentId, autoscuolaRole: "STUDENT" },
        select: { userId: true },
      }),
      prisma.autoscuolaVehicle.findFirst({
        where: { id: input.vehicleId, companyId: ctx.companyId, status: "active" },
        select: { id: true, licenseCategory: true, assignedInstructorId: true },
      }),
    ]);
    if (!student) return fail("Allievo non trovato.", "NOT_FOUND");
    if (!vehicle) return fail("Veicolo non disponibile.", "NOT_FOUND");
    if (MOTO_CATEGORIES.has(vehicle.licenseCategory)) {
      return fail("Road per ora funziona solo con le guide in auto.", "NOT_ELIGIBLE");
    }
    if (vehicle.assignedInstructorId && vehicle.assignedInstructorId !== instructorId) {
      return fail("Questo veicolo è riservato a un altro istruttore.", "VEHICLE_RESERVED");
    }

    // Come in agenda (REG-499): l'allievo bloccato non ferma l'istruttore, che
    // viene avvisato e può procedere comunque.
    const { getStudentBookingBlockStatus } = await import("@/lib/actions/autoscuole-availability.actions");
    if (input.confirmStudentBlocked !== true && (await getStudentBookingBlockStatus(ctx.companyId, input.studentId))) {
      return fail(
        "Questo allievo ha le prenotazioni bloccate. Vuoi avviare la guida comunque?",
        "STUDENT_BLOCKED_CONFIRM",
      );
    }

    const { createAutoscuolaAppointment } = await import("@/lib/actions/autoscuole.actions");
    const created = await createAutoscuolaAppointment({
      studentId: input.studentId,
      instructorId,
      vehicleId: vehicle.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "checked_in",
      // L'inizio è «adesso» al minuto: qualche secondo nel passato è voluto.
      allowPast: true,
      skipWeeklyLimitCheck: input.confirmWeeklyLimit === true,
      confirmNoBuffer: input.confirmNoBuffer === true,
      // REG-725: Road non ha il campo Luogo — resta la sede di sempre.
      locationOptional: true,
    });
    if (!created.success || !("data" in created) || !created.data) {
      const res = created as { message?: string; code?: string; weeklyLimitData?: unknown };
      const code = res.weeklyLimitData ? "WEEKLY_LIMIT_CONFIRM" : res.code ?? "CREATE_FAILED";
      return fail(res.message ?? "Impossibile creare la guida.", code);
    }
    const appointmentId = (created.data as { id: string }).id;
    await prisma.autoscuolaAppointment.update({
      where: { id: appointmentId },
      data: { bookingSource: BOOKING_SOURCE.road },
    });
    await invalidateLessonAgenda(ctx.companyId);

    const session = await startRoadSession({ appointmentId, plan: input.plan });
    if (!session.success) return session;
    return ok({ ...session.data, appointmentId });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── tab Road «mappa corta» ─────────────────────────────────────────────────

const SUGGEST_LOOKBACK_DAYS = 60;
const TO_CLOSE_HOURS = 12;
const RECENT_SESSIONS = 5;

/** Briefing per voce delle ultime guide Road di ogni allievo. */
async function loadBriefings(companyId: string, studentIds: string[]) {
  const out = new Map<string, Briefing>();
  if (!studentIds.length) return out;
  const sessions = await prisma.roadSession.findMany({
    where: { companyId, studentId: { in: studentIds }, status: { not: "active" } },
    orderBy: { startedAt: "desc" },
    take: 400,
    select: { id: true, studentId: true, startedAt: true },
  });
  const perStudent = new Map<string, Array<{ id: string; startedAt: Date }>>();
  for (const s of sessions) {
    if (!s.studentId) continue;
    const list = perStudent.get(s.studentId) ?? [];
    if (list.length < 5) list.push({ id: s.id, startedAt: s.startedAt });
    perStudent.set(s.studentId, list);
  }
  const ids = [...perStudent.values()].flat().map((s) => s.id);
  if (!ids.length) return out;
  const markers = await prisma.roadMarker.findMany({
    where: { sessionId: { in: ids } },
    select: { sessionId: true, kind: true, label: true, street: true, note: true, sentiment: true, recordedAt: true },
  });
  for (const [studentId, list] of perStudent) {
    const b = buildBriefing(list, markers);
    if (b) out.set(studentId, b);
  }
  return out;
}

/**
 * Il resto della tab Road: allievi suggeriti col motivo (ordine deciso da
 * Tiziano: guida in agenda, esame vicino, fermo da più tempo, chi guidi più
 * spesso), briefing, ultima guida da chiudere col pagellino, ultime guide,
 * sede per il pin, prossimo uso di ogni auto oggi.
 */
async function roadTabExtras(
  ctx: RoadCtx,
  instructorId: string,
  now: Date,
  current: AppointmentRow | null,
  vehicleIds: string[],
  dayEnd: Date,
) {
  const since = new Date(now.getTime() - SUGGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [withMe, mySessions, hq, nextUses] = await Promise.all([
    prisma.autoscuolaAppointment.groupBy({
      by: ["studentId"],
      where: {
        companyId: ctx.companyId,
        instructorId,
        studentId: { not: null },
        groupLessonId: null,
        type: { notIn: ["esame", "group_lesson"] },
        status: { notIn: ["cancelled", "proposal"] },
        startsAt: { gte: since, lt: now },
      },
      _count: { _all: true },
    }),
    prisma.roadSession.findMany({
      where: { companyId: ctx.companyId, instructorId, status: { not: "active" } },
      orderBy: { startedAt: "desc" },
      take: RECENT_SESSIONS,
      select: { ...sessionSelect, appointment: { select: appointmentSelect } },
    }),
    prisma.autoscuolaLocation.findFirst({
      where: { companyId: ctx.companyId, isDefault: true, archivedAt: null, latitude: { not: null }, longitude: { not: null } },
      select: { name: true, latitude: true, longitude: true },
    }),
    vehicleIds.length
      ? prisma.autoscuolaAppointment.findMany({
          where: {
            companyId: ctx.companyId,
            vehicleId: { in: vehicleIds },
            status: { notIn: FREE_BUSY_STATUSES_EXCLUDED },
            startsAt: { gt: now, lt: dayEnd },
          },
          orderBy: { startsAt: "asc" },
          select: { vehicleId: true, startsAt: true },
        })
      : Promise.resolve([] as Array<{ vehicleId: string | null; startsAt: Date }>),
  ]);

  const vehicleNextUse = new Map<string, string>();
  for (const r of nextUses) {
    if (r.vehicleId && !vehicleNextUse.has(r.vehicleId)) vehicleNextUse.set(r.vehicleId, r.startsAt.toISOString());
  }

  // Candidati: chi ho guidato negli ultimi 60 giorni + l'allievo della guida in agenda.
  const counts = new Map<string, number>();
  for (const r of withMe) if (r.studentId) counts.set(r.studentId, r._count._all);
  const agendaStudentId = current?.studentId ?? null;
  const ids = [...new Set([...(agendaStudentId ? [agendaStudentId] : []), ...counts.keys()])].slice(0, 60);

  let suggestions: ReturnType<typeof rankSuggestions> = [];
  if (ids.length) {
    const [members, users, done, exams] = await Promise.all([
      prisma.companyMember.findMany({
        where: { companyId: ctx.companyId, userId: { in: ids }, autoscuolaRole: "STUDENT" },
        select: { userId: true, licenseCategory: true, studentPhase: true },
      }),
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: ctx.companyId,
          studentId: { in: ids },
          type: { notIn: ["esame"] },
          status: { in: ["completed", "checked_in"] },
          startsAt: { lt: now },
        },
        select: { studentId: true, startsAt: true, endsAt: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: ctx.companyId,
          studentId: { in: ids },
          type: "esame",
          status: { notIn: ["cancelled", "proposal"] },
          startsAt: { gte: now },
        },
        orderBy: { startsAt: "asc" },
        select: { studentId: true, startsAt: true },
      }),
    ]);
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const candidates: SuggestionCandidate[] = [];
    for (const m of members) {
      // Solo chi è in pratica (non teoria, non già patentato).
      if (m.studentPhase !== "PRATICA") continue;
      const mine = done.filter((d) => d.studentId === m.userId);
      candidates.push({
        id: m.userId,
        name: nameOf.get(m.userId) ?? "Allievo",
        licenseCategory: m.licenseCategory,
        withMe: counts.get(m.userId) ?? 0,
        doneCount: mine.length,
        doneMinutes: mine.reduce((sum, d) => sum + (lessonEnd(d).getTime() - d.startsAt.getTime()) / 60000, 0),
        lastDoneAt: mine.reduce<Date | null>((max, d) => (!max || d.startsAt > max ? d.startsAt : max), null),
        nextExamAt: exams.find((e) => e.studentId === m.userId)?.startsAt ?? null,
        agendaAt: m.userId === agendaStudentId && current ? current.startsAt : null,
      });
    }
    // Uno in più: se il primo è quello della guida in agenda, la tab lo mostra
    // in cima e propone gli altri come «Parti con un altro allievo».
    suggestions = rankSuggestions(candidates, now, 4);
  }

  const briefings = Object.fromEntries(await loadBriefings(ctx.companyId, suggestions.map((s) => s.id)));

  // Ultima guida da chiudere: mia, finita da poco, pagellino acceso e ancora
  // vuoto. Road novembre (R1): basta UNA voce votata per considerarlo chiuso —
  // le voci non toccate restano «non valutate» di proposito (REG-727), quindi
  // «tutte le voci» lo faceva richiedere di nuovo alla guida dopo.
  let toClose = null;
  const last = mySessions[0];
  if (
    last?.endedAt &&
    // R4: Road Exam non ha pagellino.
    roadSessionMode(last.mode) !== "exam" &&
    ctx.limits.evaluationSheetEnabled === true &&
    now.getTime() - last.endedAt.getTime() <= TO_CLOSE_HOURS * 60 * 60 * 1000 &&
    last.appointment.status !== "cancelled"
  ) {
    const [total, scored] = await Promise.all([
      prisma.autoscuolaEvaluationItem.count({ where: { companyId: ctx.companyId, archivedAt: null } }),
      prisma.autoscuolaAppointmentEvaluation.count({
        where: { appointmentId: last.appointmentId, OR: [{ score: { not: null } }, { notApplicable: true }] },
      }),
    ]);
    if (total > 0 && scored === 0) {
      toClose = { sessionId: last.id, appointmentId: last.appointmentId, evalTotal: total, evalDone: scored };
    }
  }

  const sessionCounts = await markerCounts(mySessions.map((s) => s.id));
  const thumbs = await sessionThumbs(mySessions.map((s) => s.id));
  const recentSessions = await Promise.all(
    mySessions.map(async (s) => ({
      ...sessionDTO(s, s.appointment.startsAt),
      ...markerSummary(sessionCounts, s.id),
      lesson: await sessionLessonDTO(s.mode, s.appointment, s.startedAt, {}, false),
      thumb: thumbs.get(s.id) ?? [],
    })),
  );

  return {
    suggestions,
    briefings,
    toClose,
    recentSessions,
    headquarters: hq
      ? { name: hq.name, lat: Number(hq.latitude), lng: Number(hq.longitude) }
      : null,
    vehicleNextUse,
  };
}

/** Finestra del server per «Annulla» (la mobile la mostra per 10 secondi). */
export const ROAD_UNDO_WINDOW_SEC = 15;

/**
 * «Annulla» nei primi secondi di una guida avviata da Road (avvio sbagliato):
 * la sessione sparisce e la guida esce da agenda e storico come «Rimuovi dallo
 * storico» (credito reso; la pausa dopo la guida la libera il trigger del DB).
 * Solo la propria guida nata da Road, solo entro la finestra.
 */
export async function undoFreeRoadSession(input: { sessionId?: unknown }) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED");
    if (typeof input?.sessionId !== "string") return fail("Sessione mancante.");
    const instructorId = await ownInstructorId(ctx);
    if (!instructorId) return fail("Non autorizzato.", "FORBIDDEN");
    const session = await prisma.roadSession.findFirst({
      where: { id: input.sessionId, companyId: ctx.companyId },
      select: { id: true, instructorId: true, startedAt: true, appointmentId: true, appointment: { select: { bookingSource: true } } },
    });
    if (!session) return fail("Sessione Road non trovata.", "NOT_FOUND");
    if (session.instructorId !== instructorId) return fail("Questa guida non è tua.", "FORBIDDEN");
    if (session.appointment.bookingSource !== BOOKING_SOURCE.road) {
      return fail("Si annulla così solo una guida avviata da Road.", "NOT_FREE");
    }
    if (Date.now() - session.startedAt.getTime() > ROAD_UNDO_WINDOW_SEC * 1000) {
      return fail("Ormai la guida è partita: chiudila con «Termina».", "UNDO_EXPIRED");
    }
    await prisma.roadSession.delete({ where: { id: session.id } });
    const { removeAppointmentFromRecord } = await import("@/lib/autoscuole/operational-cancellation");
    const removed = await removeAppointmentFromRecord({
      companyId: ctx.companyId,
      appointmentId: session.appointmentId,
      actorUserId: ctx.membership.userId,
      refundCredit: true,
    });
    if (!removed.success) return fail(removed.message ?? "Impossibile annullare la guida.");
    return ok({ appointmentId: session.appointmentId });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── R4 Road Exam ────────────────────────────────────────────────────────────

const examRowSelect = {
  id: true,
  companyId: true,
  type: true,
  status: true,
  startsAt: true,
  instructorId: true,
  examiners: true,
  coInstructors: { select: { instructorId: true } },
  roadSession: { select: { id: true } },
} satisfies Prisma.AutoscuolaAppointmentSelect;

/**
 * Avvia (o riprende) Road Exam su un esame: `appointmentIds` = le sue righe (una
 * per allievo, come le manda la scheda esame). La sessione si àncora alla riga
 * con l'id più piccolo; `studentId` null. Possono avviarla l'istruttore
 * dell'esame, i co-istruttori e il titolare; esame senza istruttore =
 * qualunque istruttore. Niente controllo d'orario: l'esame si registra quando
 * c'è (anche in anticipo o in ritardo), ma solo il giorno dell'esame.
 */
export async function startRoadExamSession(input: { appointmentIds?: unknown }) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED");
    const ids = Array.isArray(input?.appointmentIds)
      ? [...new Set(input.appointmentIds.filter((x): x is string => typeof x === "string"))].slice(0, 50)
      : [];
    if (!ids.length) return fail("Esame mancante.");
    const rows = await prisma.autoscuolaAppointment.findMany({
      where: { id: { in: ids }, companyId: ctx.companyId },
      select: examRowSelect,
    });
    if (!rows.length || rows.length !== ids.length) return fail("Esame non trovato.", "NOT_FOUND");
    if (rows.some((r) => r.type !== "esame")) return fail("Road Exam funziona solo sugli esami.", "NOT_ELIGIBLE");
    const startsAt = rows[0].startsAt.getTime();
    if (rows.some((r) => r.startsAt.getTime() !== startsAt)) return fail("Le righe non sono dello stesso esame.", "INVALID");

    const instructorId = await ownInstructorId(ctx);
    const allowed = canStartRoadExam(
      rows.map((r) => ({ instructorId: r.instructorId, coInstructorIds: r.coInstructors.map((c) => c.instructorId) })),
      { isOwner: canSeeAll(ctx), instructorId },
    );
    if (!allowed) return fail("Puoi registrare solo gli esami che accompagni.", "FORBIDDEN");

    // Ripresa: una riga dell'esame ha già la sua sessione.
    const existing = rows.find((r) => r.roadSession)?.roadSession?.id;
    if (existing) {
      const detail = await prisma.roadSession.findUnique({
        where: { id: existing },
        select: { ...sessionSelect, appointment: { select: appointmentSelect } },
      });
      if (detail) {
        return ok({
          ...sessionDTO(detail, detail.appointment.startsAt),
          lesson: await sessionLessonDTO(detail.mode, detail.appointment, detail.startedAt, ctx.limits, true),
          resumed: true,
        });
      }
    }

    const anchor = examAnchorRow(rows);
    if (!anchor) return fail("L'esame è stato annullato.", "NOT_ELIGIBLE");
    const now = new Date();
    if (romeDayBounds(now).start.getTime() > startsAt || romeDayBounds(now).end.getTime() <= startsAt) {
      return fail("Road Exam si usa il giorno dell'esame.", "NOT_TODAY");
    }

    await prisma.roadSession.updateMany({
      where: {
        companyId: ctx.companyId,
        status: "active",
        OR: [...(instructorId ? [{ instructorId }] : []), { startedById: ctx.membership.userId }],
      },
      data: { status: "abandoned", endedAt: now },
    });
    const created = await prisma.roadSession.create({
      data: {
        companyId: ctx.companyId,
        appointmentId: anchor.id,
        instructorId,
        studentId: null,
        vehicleId: null,
        startedAt: now,
        mode: "exam",
        examiners: examRowsExaminers(rows),
        startedById: ctx.membership.userId,
      },
      select: { ...sessionSelect, appointment: { select: appointmentSelect } },
    });
    return ok({
      ...sessionDTO(created, created.appointment.startsAt),
      lesson: await sessionLessonDTO(created.mode, created.appointment, created.startedAt, ctx.limits, true),
      resumed: false,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return startRoadExamSession(input); // doppio tap: la seconda chiamata riprende
    }
    return fail(formatError(error));
  }
}

/**
 * Fine Road Exam: la traccia pulita diventa un percorso d'esame (origin "exam")
 * sotto gli esaminatori scritti sull'esame in quel momento. Una volta sola per
 * sessione; meno di 2 punti = niente percorso.
 */
export async function saveExamRouteFromSession(sessionId: string, companyId: string, userId: string | null) {
  const s = await prisma.roadSession.findFirst({
    where: { id: sessionId, companyId, mode: "exam" },
    select: { id: true, cleanTrack: true, appointment: { select: { id: true, startsAt: true, instructorId: true, companyId: true } } },
  });
  if (!s) return null;
  const already = await prisma.roadExamRoute.findFirst({ where: { companyId, sourceSessionId: sessionId }, select: { id: true } });
  if (already) return already.id;
  const clean = storedCleanTrack(s.cleanTrack);
  const raw = clean?.path?.length ? clean.path : (await loadTrack(sessionId)).map((p) => [p[1], p[2]] as LatLng);
  if (raw.length < 2) return null;
  const path = simplifyPath(raw as LatLng[]);
  const info = await examLessonInfo(s.appointment);
  const site = info.place;
  const row = await prisma.roadExamRoute.create({
    data: {
      companyId,
      name: examRouteName(s.appointment.startsAt, info.examiners),
      examSite: site,
      licenseCategories: [],
      waypoints: waypointsFromTrack(raw as LatLng[], EXAM_ROUTE_MAX_WAYPOINTS) as unknown as Prisma.InputJsonValue,
      path: path as unknown as Prisma.InputJsonValue,
      lengthMeters: pathLengthMeters(path),
      sourceSessionId: sessionId,
      createdById: userId,
      examiners: info.examiners,
      origin: "exam",
      examAt: s.appointment.startsAt,
    },
    select: { id: true },
  });
  await prisma.roadSession.update({ where: { id: sessionId }, data: { examiners: info.examiners } });
  invalidateRoadHotspots(companyId);
  return row.id;
}

/**
 * R4c «Prova il percorso»: a guida in corso l'istruttore mette nel giro un
 * percorso d'esame (di un esaminatore); `examRouteId` null lo toglie. La tappa
 * la costruisce il server dal percorso salvato; la copertura a fine guida passa
 * da `planReached` come per il giro scelto alla partenza.
 */
export async function setRoadSessionExamRoute(sessionId: string, input: { examRouteId?: unknown }) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;
    if (session.status !== "active") return fail("La guida è chiusa.", "SESSION_CLOSED");
    if (roadSessionMode(session.mode) === "exam") return fail("Durante Road Exam non si prova un percorso.", "EXAM_MODE");
    const routeId = input?.examRouteId;
    let stop = null;
    if (routeId != null) {
      if (typeof routeId !== "string") return fail("Percorso non valido.", "INVALID");
      const route = await prisma.roadExamRoute.findFirst({
        where: { id: routeId, companyId: ctx.companyId, archivedAt: null },
        select: { id: true, name: true, path: true },
      });
      if (!route) return fail("Percorso non trovato.", "NOT_FOUND");
      stop = examStopFromRoute({ id: route.id, name: route.name, path: (Array.isArray(route.path) ? route.path : []) as LatLng[] });
      if (!stop) return fail("Il percorso non ha una linea.", "INVALID");
    }
    const plan = planWithExamStop(parseStoredPlan(session.plan) ?? null, stop);
    await prisma.roadSession.update({
      where: { id: sessionId },
      data: { plan: plan ? (plan as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
    });
    return ok({ plan });
  } catch (error) {
    return fail(formatError(error));
  }
}
