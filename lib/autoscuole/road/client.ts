/**
 * REG-638 Reglo Road — client tipizzato delle API web (`/api/autoscuole/road/**`).
 * Gira nel browser col cookie di sessione. I tipi ricalcano il contratto in
 * `docs/features/reglo-road.md` (sezione API).
 */

import type { CarColorKey } from "@/lib/autoscuole/road/car-colors";
import type { PlanReached, StoredPlan } from "@/lib/autoscuole/road/lesson-plan";

export type RoadLesson = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  student: { id: string; name: string | null } | null;
  instructor: { id: string; name: string; color: string | null; phone?: string | null } | null;
  vehicle: { id: string; name: string; plate: string | null } | null;
  /** Chiave variante colore dell'auto 3D (vedi car-colors.ts). */
  carColor: CarColorKey;
};

export type RoadSessionStatus = "active" | "completed" | "abandoned";

export type RoadSession = {
  id: string;
  appointmentId: string;
  status: RoadSessionStatus;
  startedAt: string;
  endedAt: string | null;
  distanceMeters: number;
  durationSec: number;
  lastSeq: number;
  last: {
    lat: number;
    lng: number;
    speed: number | null;
    heading: number | null;
    street: string | null;
    at: string | null;
  } | null;
  /** REG-648: il giro scelto alla partenza (null = senza giro) e, a fine guida, le tappe raggiunte. */
  plan?: StoredPlan | null;
  planReached?: PlanReached | null;
};

export type RoadMarker = {
  id: string;
  clientId: string;
  kind: string;
  label: string;
  note: string | null;
  lat: number;
  lng: number;
  street: string | null;
  /** «fatto bene» / «da migliorare»; null = neutra (segnalazioni prima del segno). */
  sentiment: "good" | "bad" | null;
  recordedAt: string;
};

/** Punto del percorso: [lat, lng, tMs]. */
export type RoadTrackPoint = [number, number, number];

export type RoadMarkerSummary = { markerCount: number; markerKinds: string[]; markerGood: number; markerBad: number };

export type RoadLiveSession = RoadSession &
  RoadMarkerSummary & { lesson: RoadLesson; recentMarkers: RoadMarker[] };

export type RoadLive = {
  now: string;
  base: { name: string; lat: number; lng: number } | null;
  sessions: RoadLiveSession[];
  atBase: Array<{ id: string; name: string; plate: string | null; carColor: CarColorKey; freeUntil: string | null }>;
};

/** Percorso Road di una guida nel dettaglio allievo (`GET /road/students/[id]`). */
export type RoadStudentItem = RoadSession &
  RoadMarkerSummary & { thumb: Array<[number, number]> };

export type RoadTodayItem = RoadLesson & { road: (RoadSession & RoadMarkerSummary) | null };

export type RoadHistoryItem = RoadSession & RoadMarkerSummary & { lesson: RoadLesson };

export type RoadEvaluation = {
  items: Array<{ label: string; scaleMax: number; score: number | null; notApplicable: boolean }>;
  updatedAt: string;
};

export type RoadDetail = RoadSession & {
  lesson: RoadLesson;
  markers: RoadMarker[];
  track: RoadTrackPoint[];
  evaluation?: RoadEvaluation | null;
};

/** Punto critico (REG-643): dove gli allievi sbagliano più spesso. */
export type RoadHotspot = {
  key: string;
  kind: string;
  label: string;
  lat: number;
  lng: number;
  street: string | null;
  errors: number;
  students: number;
  sessions: number;
  lastAt: string;
  examRoutes: Array<{ id: string; name: string }>;
};

export type RoadHotspots = {
  from: string;
  to: string;
  hotspots: RoadHotspot[];
  totalErrors: number;
  examRoutes: number;
};

export type RoadHotspotDetail = {
  hotspot: RoadHotspot;
  sessions: Array<{
    id: string;
    startedAt: string;
    student: { id: string; name: string | null } | null;
    instructor: { id: string; name: string } | null;
    errors: number;
    lastAt: string;
  }>;
  students: Array<{ id: string; name: string | null; errors: number }>;
  hiddenSessions: number;
};

export type RoadHotspotFilters = {
  from?: string | null;
  instructorId?: string | null;
  license?: string | null;
  kind?: string | null;
};

/** Percorso d'esame (REG-641), coordinate [lat, lng]. */
export type RoadExamRoute = {
  id: string;
  name: string;
  examSite: string | null;
  licenseCategories: string[];
  waypoints: Array<[number, number]>;
  path: Array<[number, number]>;
  lengthMeters: number;
  sourceSessionId: string | null;
  archivedAt: string | null;
};

export type RoadExamRouteInput = {
  name: string;
  examSite: string | null;
  licenseCategories: string[];
  waypoints: Array<[number, number]>;
  path: Array<[number, number]>;
  sourceSessionId?: string | null;
};

/** Bozza ricavata da una guida Road (scorciatoia «Usa come percorso d'esame»). */
export type RoadExamRouteDraft = {
  sourceSessionId: string;
  waypoints: Array<[number, number]>;
  path: Array<[number, number]>;
  lengthMeters: number;
};

export class RoadApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; message: string; code?: string };

async function call<T>(
  path: string,
  signal?: AbortSignal,
  init?: { method: "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
  const res = await fetch(`/api/autoscuole/road${path}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
    ...(init
      ? {
          method: init.method,
          headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        }
      : {}),
  });
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new RoadApiError("Risposta non valida dal server.");
  }
  if (!body.success) throw new RoadApiError(body.message, body.code);
  return body.data;
}

function query(params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q.set(k, String(v));
  }
  return q.toString();
}

export const roadApi = {
  live: (signal?: AbortSignal) => call<RoadLive>("/live", signal),
  today: (signal?: AbortSignal) => call<RoadTodayItem[]>("/today", signal),
  history: (
    params: {
      from?: string | null;
      to?: string | null;
      instructorId?: string | null;
      studentId?: string | null;
      cursor?: string | null;
      limit?: number;
    },
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") q.set(k, String(v));
    }
    return call<{ items: RoadHistoryItem[]; nextCursor: string | null }>(`/history?${q}`, signal);
  },
  hotspots: (params: RoadHotspotFilters, signal?: AbortSignal) =>
    call<RoadHotspots>(`/hotspots?${query(params)}`, signal),
  hotspot: (key: string, params: RoadHotspotFilters, signal?: AbortSignal) =>
    call<RoadHotspotDetail>(`/hotspots/${encodeURIComponent(key)}?${query(params)}`, signal),
  examRoutes: (signal?: AbortSignal, opts?: { archived?: boolean }) =>
    call<RoadExamRoute[]>(opts?.archived ? "/exam-routes?archived=1" : "/exam-routes", signal),
  createExamRoute: (body: RoadExamRouteInput) =>
    call<RoadExamRoute>("/exam-routes", undefined, { method: "POST", body }),
  updateExamRoute: (id: string, body: Partial<RoadExamRouteInput> & { restore?: boolean }) =>
    call<RoadExamRoute>(`/exam-routes/${encodeURIComponent(id)}`, undefined, { method: "PATCH", body }),
  archiveExamRoute: (id: string) =>
    call<{ archived: true }>(`/exam-routes/${encodeURIComponent(id)}`, undefined, { method: "DELETE" }),
  /** Aggancio alle strade (REG-642): solo al rilascio di un punto o al salvataggio. */
  snapExamRoute: (waypoints: Array<[number, number]>, signal?: AbortSignal) =>
    call<{ segments: Array<Array<[number, number]>>; path: Array<[number, number]>; lengthMeters: number }>(
      "/exam-routes/snap",
      signal,
      { method: "POST", body: { waypoints } },
    ),
  examRouteFromSession: (body: { sessionId: string; fromMs?: number | null; toMs?: number | null }, signal?: AbortSignal) =>
    call<RoadExamRouteDraft>("/exam-routes/from-session", signal, { method: "POST", body }),
  student: (studentId: string, signal?: AbortSignal) =>
    call<{ items: RoadStudentItem[] }>(`/students/${encodeURIComponent(studentId)}`, signal),
  session: (id: string, signal?: AbortSignal) =>
    call<RoadDetail>(`/sessions/${encodeURIComponent(id)}`, signal),
  track: (id: string, afterSeq: number, signal?: AbortSignal) =>
    call<{ lastSeq: number; points: RoadTrackPoint[] }>(
      `/sessions/${encodeURIComponent(id)}/track?afterSeq=${afterSeq}`,
      signal,
    ),
};
