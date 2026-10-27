import { Prisma } from "@prisma/client";

import { resolveCarColor } from "@/lib/autoscuole/road/car-colors";
import { normalizeSentiment } from "@/lib/autoscuole/road/catalog";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import { isInstructor, isOwner, isStudent } from "@/lib/autoscuole/roles";
import { formatError } from "@/lib/utils";
import {
  ROAD_BASE_MARKERS,
  parseRoadCustomMarkers,
  resolveMarkerLabel,
  type RoadCustomMarker,
} from "@/lib/autoscuole/road/catalog";
import { drivingSeconds, freeLessonEnd, sanitizePoints, trackDistanceMeters, type RoadPoint } from "@/lib/autoscuole/road/geo";
import { finalizeRoadSession, loadRoadTrack } from "@/lib/autoscuole/road/maintenance";
import { BOOKING_SOURCE } from "@/lib/autoscuole/booking-source";
import { LESSON_BUFFER_BLOCK_REASON } from "@/lib/autoscuole/lesson-buffer";
import { AUTOSCUOLE_CACHE_SEGMENTS, invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";

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
const ROAD_ELIGIBLE_STATUSES = ["scheduled", "confirmed", "checked_in"];
const MAX_POINTS_PER_BATCH = 600;

// ─── contesto ────────────────────────────────────────────────────────────────

async function roadContext() {
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
type RoadCtx = Awaited<ReturnType<typeof roadContext>>;

const canSeeAll = (ctx: RoadCtx) => ctx.membership.role === "admin" || isOwner(ctx.membership.autoscuolaRole);

async function ownInstructorId(ctx: RoadCtx) {
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
  };
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
  recordedAt: Date;
}) {
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
  recordedAt: true,
} as const;

/**
 * Sessione dell'istruttore: deve essere sua (istruttore della guida) e attiva
 * per le scritture. Gli admin passano sempre (debug/assistenza).
 */
async function loadOwnSession(ctx: RoadCtx, sessionId: string) {
  const session = await prisma.roadSession.findFirst({
    where: { id: sessionId, companyId: ctx.companyId },
    select: { ...sessionSelect, instructorId: true, companyId: true },
  });
  if (!session) return { error: fail("Sessione Road non trovata.", "NOT_FOUND") };
  if (!canSeeAll(ctx)) {
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
    };
    if (!ctx.roadEnabled) return ok({ ...base, activeSession: null, eligibleLesson: null });

    const instructorId = await ownInstructorId(ctx);
    if (!instructorId) return ok({ ...base, activeSession: null, eligibleLesson: null });

    const now = new Date();
    const active = await prisma.roadSession.findFirst({
      where: { companyId: ctx.companyId, instructorId, status: "active" },
      orderBy: { startedAt: "desc" },
      select: { ...sessionSelect, appointment: { select: appointmentSelect } },
    });
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
      activeSession: active
        ? { ...sessionDTO(active, active.appointment.startsAt), lesson: lessonDTO(active.appointment) }
        : null,
      eligibleLesson: eligible ? lessonDTO(eligible) : null,
    });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── sessione: avvio / ripresa ──────────────────────────────────────────────

export async function startRoadSession(input: { appointmentId: string }) {
  try {
    const ctx = await roadContext();
    if (!ctx.roadEnabled) return fail("Reglo Road non è attivo per questa autoscuola.", "ROAD_DISABLED");
    if (typeof input?.appointmentId !== "string") return fail("Guida mancante.");

    const appointment = await prisma.autoscuolaAppointment.findFirst({
      where: { id: input.appointmentId, companyId: ctx.companyId },
      select: { ...appointmentSelect, roadSession: { select: { ...sessionSelect, instructorId: true } } },
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
      return ok({ ...sessionDTO(appointment.roadSession, appointment.startsAt), lesson: lessonDTO(appointment), resumed: true });
    }

    if (!ROAD_ELIGIBLE_STATUSES.includes(appointment.status)) {
      return fail("Questa guida non è più in programma.", "NOT_ELIGIBLE");
    }
    const now = new Date();
    if (now.getTime() < appointment.startsAt.getTime() - ROAD_ENTRY_OPENS_MIN * 60 * 1000) {
      return fail(`Road si apre ${ROAD_ENTRY_OPENS_MIN} minuti prima della guida.`, "TOO_EARLY");
    }

    // Un istruttore ha una sola sessione attiva: quella vecchia (guida
    // precedente dimenticata aperta) si chiude come abbandonata.
    await prisma.roadSession.updateMany({
      where: { companyId: ctx.companyId, instructorId, status: "active" },
      data: { status: "abandoned", endedAt: now },
    });

    const created = await prisma.$transaction(async (tx) => {
      const s = await tx.roadSession.create({
        data: {
          companyId: ctx.companyId,
          appointmentId: appointment.id,
          instructorId,
          studentId: appointment.studentId,
          vehicleId: appointment.vehicleId,
          startedAt: now,
        },
        select: sessionSelect,
      });
      if (appointment.status === "scheduled" || appointment.status === "confirmed") {
        await tx.autoscuolaAppointment.update({ where: { id: appointment.id }, data: { status: "checked_in" } });
      }
      return s;
    });
    return ok({ ...sessionDTO(created, appointment.startsAt), lesson: lessonDTO(appointment), resumed: false });
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
  input: { seq: number; points: unknown; street?: string | null },
) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;
    if (session.status !== "active") return ok({ accepted: false, reason: "SESSION_CLOSED" as const });

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
            }
          : {}),
      },
    });
    return ok({ accepted: true, duplicate: false });
  } catch (error) {
    return fail(formatError(error));
  }
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
    recordedAt?: string;
  },
) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;
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
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
      },
      select: markerSelect,
    });
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
    await prisma.roadMarker.deleteMany({
      where: {
        sessionId,
        OR: [{ clientId: markerIdOrClientId }, ...(isUuid ? [{ id: markerIdOrClientId }] : [])],
      },
    });
    return ok({ removed: true });
  } catch (error) {
    return fail(formatError(error));
  }
}

// ─── fine guida ─────────────────────────────────────────────────────────────

const loadTrack = (sessionId: string) => loadRoadTrack(prisma, sessionId);

export async function endRoadSession(sessionId: string) {
  try {
    const ctx = await roadContext();
    const loaded = await loadOwnSession(ctx, sessionId);
    if ("error" in loaded) return loaded.error!;
    const { session } = loaded;

    if (session.status === "active") {
      const endedAt = new Date();
      await finalizeRoadSession(prisma, sessionId, "completed", endedAt);
      // Decisione di prodotto: «Termina guida» = guida completata subito.
      await prisma.autoscuolaAppointment.updateMany({
        where: { id: session.appointmentId, status: { in: ROAD_ELIGIBLE_STATUSES } },
        data: { status: "completed" },
      });
      await trimFreeLessonEnd(session.appointmentId, endedAt);
    }
    return getRoadSessionDetail(sessionId);
  } catch (error) {
    return fail(formatError(error));
  }
}

/**
 * Road libero: la guida nata da Road finisce quando la si termina. La fine si
 * arrotonda ai 5 minuti e non va mai oltre quella prenotata (dopo può esserci
 * un'altra guida); minimo 5 minuti. Prezzo e crediti restano quelli fissati
 * alla creazione, come per ogni guida dell'agenda.
 */
async function trimFreeLessonEnd(appointmentId: string, endedAt: Date) {
  const a = await prisma.autoscuolaAppointment.findUnique({
    where: { id: appointmentId },
    select: { companyId: true, instructorId: true, bookingSource: true, startsAt: true, endsAt: true },
  });
  if (!a || a.bookingSource !== BOOKING_SOURCE.road || !a.endsAt) return;
  const end = freeLessonEnd(a.startsAt, a.endsAt, endedAt).getTime();
  if (end !== a.endsAt.getTime()) {
    await prisma.autoscuolaAppointment.update({ where: { id: appointmentId }, data: { endsAt: new Date(end) } });
    // La pausa dopo la guida (REG-484) era nata sulla fine prenotata: la segue,
    // altrimenti resterebbe un blocco fantasma che ferma la guida successiva.
    if (a.instructorId) {
      const pause = await prisma.autoscuolaInstructorBlock.findFirst({
        where: { companyId: a.companyId, instructorId: a.instructorId, reason: LESSON_BUFFER_BLOCK_REASON, startsAt: a.endsAt },
        select: { id: true, startsAt: true, endsAt: true },
      });
      if (pause) {
        const length = pause.endsAt.getTime() - pause.startsAt.getTime();
        await prisma.autoscuolaInstructorBlock.update({
          where: { id: pause.id },
          data: { startsAt: new Date(end), endsAt: new Date(end + length) },
        });
      }
    }
    await invalidateFreeLessonAgenda(a.companyId);
  }
}

const invalidateFreeLessonAgenda = (companyId: string) =>
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
    },
  });
  if (!s) return null;
  const track = await loadTrack(sessionId);
  return {
    ...sessionDTO(s, s.appointment.startsAt),
    lesson: lessonDTO(s.appointment),
    markers: s.markers.map(markerDTO),
    // Per la mappa bastano [lat, lng]; il tempo serve a disegnare il "fatto fin qui".
    track: track.map((p) => [p[1], p[2], p[0]] as [number, number, number]),
  };
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
      return ok(detail);
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

/** Al massimo N punti, presi a passo regolare: basta per la miniatura del percorso. */
function thumbTrack(points: RoadPoint[], max = 60): Array<[number, number]> {
  if (points.length <= max) return points.map((p) => [p[1], p[2]]);
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => {
    const p = points[Math.round(i * step)];
    return [p[1], p[2]] as [number, number];
  });
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
    const items = await Promise.all(
      sessions.map(async (x) => ({
        ...sessionDTO(x, x.appointment.startsAt),
        ...markerSummary(counts, x.id),
        thumb: thumbTrack(sanitizePoints(await loadRoadTrack(prisma, x.id))),
      })),
    );
    return ok({ items });
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

    const base = await prisma.autoscuolaLocation
      .findFirst({
        where: { companyId: ctx.companyId, latitude: { not: null }, longitude: { not: null } },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { name: true, latitude: true, longitude: true },
      })
      .catch(() => null);

    return ok({
      now: now.toISOString(),
      base: base?.latitude != null && base.longitude != null
        ? { name: base.name, lat: Number(base.latitude), lng: Number(base.longitude) }
        : null,
      sessions: active.map((s) => ({
        ...sessionDTO(s, s.appointment.startsAt),
        lesson: lessonDTO(s.appointment),
        ...markerSummary(counts, s.id),
        recentMarkers: recent.filter((m) => m.sessionId === s.id).slice(0, 3).map(markerDTO),
      })),
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
      items: page.map((s) => ({
        ...sessionDTO(s, s.appointment.startsAt),
        lesson: lessonDTO(s.appointment),
        ...markerSummary(counts, s.id),
      })),
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
        select: { startsAt: true },
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
      })),
      defaultVehicleId: pick?.id ?? null,
      recentStudents,
      currentLesson: current ? lessonDTO(current) : null,
      // Per il pannello «Pronto a partire?» della tab Road.
      todayCount: todayRows.length,
      nextLessonAt: todayRows.find((r) => r.startsAt > now)?.startsAt.toISOString() ?? null,
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

    const { getStudentBookingBlockStatus } = await import("@/lib/actions/autoscuole-availability.actions");
    if (await getStudentBookingBlockStatus(ctx.companyId, input.studentId)) {
      return fail("Questo allievo ha le prenotazioni bloccate: non puoi avviare una guida con lui.", "STUDENT_BLOCKED");
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
    await invalidateFreeLessonAgenda(ctx.companyId);

    const session = await startRoadSession({ appointmentId });
    if (!session.success) return session;
    return ok({ ...session.data, appointmentId });
  } catch (error) {
    return fail(formatError(error));
  }
}
