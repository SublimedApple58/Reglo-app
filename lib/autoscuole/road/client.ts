/**
 * REG-638 Reglo Road — client tipizzato delle API web (`/api/autoscuole/road/**`).
 * Gira nel browser col cookie di sessione. I tipi ricalcano il contratto in
 * `docs/features/reglo-road.md` (sezione API).
 */

import type { CarColorKey } from "@/lib/autoscuole/road/car-colors";

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

export class RoadApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; message: string; code?: string };

async function call<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/autoscuole/road${path}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
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
