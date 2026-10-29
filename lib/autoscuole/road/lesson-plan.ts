import { haversineMeters } from "@/lib/autoscuole/road/geo";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import {
  clusterMarkers,
  hotspotKey,
  HOTSPOT_RADIUS_M,
  type Hotspot,
  type HotspotMarker,
} from "@/lib/autoscuole/road/hotspots";

/**
 * REG-647 Reglo Road — il giro della prossima guida (motore, logica pura).
 * Nessun accesso al DB: `lesson-plan-service.ts` carica i dati e chiama qui.
 *
 * - Punti critici dell'allievo: i SUOI errori ripetuti (stesso tipo entro
 *   ~60 m, in almeno 2 guide diverse). Servono alla tappa 1 e alla mappa in
 *   Road (REG-652); mai quelli dell'autoscuola.
 * - Tappe (max 3), per priorità: 1) punti critici dell'allievo; 2) punto
 *   critico dell'autoscuola per il suo errore più frequente; 3) percorso
 *   d'esame meno coperto dalle sue guide.
 * - Ordine «più vicina prima» dalla partenza; minuti in linea d'aria a
 *   25 km/h (indicativi); si tolgono le tappe meno importanti finché il giro
 *   (andata, lavoro sulle tappe e ritorno) sta nella durata della guida.
 */

export const PLAN_MAX_STOPS = 3;
/** Tappe massime dai punti dell'allievo quando ci sono anche le altre fonti. */
export const PLAN_MAX_STUDENT_STOPS = 2;
export const PLAN_SPEED_KMH = 25;
/** Minuti di lavoro su una tappa (giri dell'isolato, ripetere la manovra). */
export const PLAN_STOP_MINUTES = 5;
/** Un punto dell'allievo è «ripetuto» se torna in almeno tante guide. */
export const STUDENT_HOTSPOT_MIN_SESSIONS = 2;
/** Un tratto di percorso d'esame è «fatto» se una guida ci è passata entro tanti metri. */
export const COVERAGE_RADIUS_M = 30;
/** Passo di campionamento del percorso per la copertura. */
export const COVERAGE_STEP_M = 10;
/** Sopra questa copertura il percorso non diventa una tappa. */
export const COVERAGE_DONE = 0.8;

const metersPerMinute = (PLAN_SPEED_KMH * 1000) / 60;

// ─── Punti critici dell'allievo ──────────────────────────────────────────────

export type StudentHotspot = {
  key: string;
  kind: string;
  label: string;
  lat: number;
  lng: number;
  street: string | null;
  errors: number;
  sessions: number;
  lastAt: string;
};

function mostFrequent(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

/** Le segnalazioni «da migliorare» di UN allievo → i suoi punti ripetuti, i più frequenti prima. */
export function buildStudentHotspots(markers: HotspotMarker[]): StudentHotspot[] {
  const out: StudentHotspot[] = [];
  for (const c of clusterMarkers(markers)) {
    const sessions = new Set(c.markers.map((m) => m.sessionId)).size;
    if (sessions < STUDENT_HOTSPOT_MIN_SESSIONS) continue;
    const last = c.markers[c.markers.length - 1];
    out.push({
      key: hotspotKey(c.kind, c.lat, c.lng),
      kind: c.kind,
      label: last.label,
      lat: Number(c.lat.toFixed(6)),
      lng: Number(c.lng.toFixed(6)),
      street: mostFrequent(c.markers.map((m) => m.street)),
      errors: c.markers.length,
      sessions,
      lastAt: last.recordedAt.toISOString(),
    });
  }
  return out.sort((a, b) => b.errors - a.errors || b.sessions - a.sessions || b.lastAt.localeCompare(a.lastAt));
}

/** I tipi di errore dell'allievo dal più frequente (a pari numero, il più recente). */
export function studentErrorKinds(markers: HotspotMarker[]): string[] {
  const by = new Map<string, { n: number; last: number }>();
  for (const m of markers) {
    const cur = by.get(m.kind) ?? { n: 0, last: 0 };
    cur.n++;
    cur.last = Math.max(cur.last, m.recordedAt.getTime());
    by.set(m.kind, cur);
  }
  return [...by.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).map(([k]) => k);
}

// ─── Copertura dei percorsi d'esame ──────────────────────────────────────────

/** Punti lungo la linea ogni `stepM` metri (vertici compresi). */
export function samplePath(path: LatLng[], stepM = COVERAGE_STEP_M): LatLng[] {
  if (path.length < 2) return [...path];
  const out: LatLng[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [aLat, aLng] = path[i - 1];
    const [bLat, bLng] = path[i];
    const d = haversineMeters(aLat, aLng, bLat, bLng);
    const n = Math.floor(d / stepM);
    for (let k = 1; k <= n; k++) {
      const t = (k * stepM) / d;
      if (t >= 1) break;
      out.push([aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t]);
    }
    out.push(path[i]);
  }
  return out;
}

/**
 * Quota (0–1) del percorso passata entro `radiusM` dai tracciati delle guide.
 * Griglia di celle grandi quanto il raggio: per ogni campione si guardano le
 * 9 celle intorno, così anche migliaia di punti restano veloci.
 */
export function examRouteCoverage(path: LatLng[], tracks: LatLng[][], radiusM = COVERAGE_RADIUS_M): number {
  const samples = samplePath(path);
  if (!samples.length) return 0;
  const lat0 = samples[0][0];
  const cellLat = radiusM / 111_320;
  const cellLng = radiusM / (111_320 * Math.cos((lat0 * Math.PI) / 180));
  const cell = (lat: number, lng: number) => [Math.floor(lat / cellLat), Math.floor(lng / cellLng)] as const;
  const grid = new Map<string, LatLng[]>();
  for (const t of tracks) {
    for (const p of t) {
      const [r, c] = cell(p[0], p[1]);
      const k = `${r}:${c}`;
      const list = grid.get(k);
      if (list) list.push(p);
      else grid.set(k, [p]);
    }
  }
  if (!grid.size) return 0;
  let covered = 0;
  for (const s of samples) {
    const [r, c] = cell(s[0], s[1]);
    let hit = false;
    for (let dr = -1; dr <= 1 && !hit; dr++) {
      for (let dc = -1; dc <= 1 && !hit; dc++) {
        const list = grid.get(`${r + dr}:${c + dc}`);
        if (list?.some((p) => haversineMeters(s[0], s[1], p[0], p[1]) <= radiusM)) hit = true;
      }
    }
    if (hit) covered++;
  }
  return covered / samples.length;
}

// ─── Il giro ─────────────────────────────────────────────────────────────────

export type PlanSource = "student" | "school" | "exam";

export type PlanStop = {
  /** Chiave stabile della tappa (punto critico o `exam:<id>`): serve a `planReached`. */
  key: string;
  source: PlanSource;
  /** Tipo di errore (assente per il percorso d'esame). */
  kind: string | null;
  /** Titolo della tappa: la via, o il nome della voce / del percorso. */
  title: string;
  /** Il motivo, una riga: «Precedenza da migliorare 3 volte in 2 guide». */
  reason: string;
  lat: number;
  lng: number;
  street: string | null;
  /** Minuti di strada dalla tappa prima (o dalla partenza). */
  minutes: number;
  errors: number | null;
  lastAt: string | null;
  examRouteId: string | null;
  /** Percorso d'esame: dove finisce (da lì si riparte verso la tappa dopo). */
  endLat: number | null;
  endLng: number | null;
};

export type LessonPlan = {
  stops: PlanStop[];
  /** Minuti stimati del giro: strada, lavoro sulle tappe e ritorno alla partenza. */
  minutes: number;
};

export type PlanExamRoute = {
  id: string;
  name: string;
  path: LatLng[];
  lengthMeters: number;
  /** Copertura 0–1 dalle guide dell'allievo (`examRouteCoverage`). */
  coverage: number;
};

export type LessonPlanInput = {
  durationMin: number;
  /** Da dove parte la guida (sede o posizione); null = sconosciuto. */
  start: { lat: number; lng: number } | null;
  studentHotspots: StudentHotspot[];
  /** Tipi di errore dell'allievo, dal più frequente (`studentErrorKinds`). */
  studentKinds: string[];
  schoolHotspots: Hotspot[];
  examRoutes: PlanExamRoute[];
};

type Candidate = Omit<PlanStop, "minutes"> & { workMin: number };

const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  haversineMeters(a.lat, a.lng, b.lat, b.lng) <= HOTSPOT_RADIUS_M;

const percent = (x: number) => `${Math.round(x * 100)}%`;

function studentCandidate(h: StudentHotspot): Candidate {
  return {
    key: h.key,
    source: "student",
    kind: h.kind,
    title: h.street ?? h.label,
    reason: `${h.label} da migliorare ${h.errors} volte in ${h.sessions} guide`,
    lat: h.lat,
    lng: h.lng,
    street: h.street,
    errors: h.errors,
    lastAt: h.lastAt,
    examRouteId: null,
    endLat: null,
    endLng: null,
    workMin: PLAN_STOP_MINUTES,
  };
}

function schoolCandidate(h: Hotspot): Candidate {
  return {
    key: h.key,
    source: "school",
    kind: h.kind,
    title: h.street ?? h.label,
    reason: `Qui sbagliano in tanti: ${h.label.toLowerCase()}, ${h.errors} errori di ${h.students} allievi`,
    lat: h.lat,
    lng: h.lng,
    street: h.street,
    errors: h.errors,
    lastAt: h.lastAt,
    examRouteId: null,
    endLat: null,
    endLng: null,
    workMin: PLAN_STOP_MINUTES,
  };
}

function examCandidate(r: PlanExamRoute): Candidate {
  const [sLat, sLng] = r.path[0];
  const [eLat, eLng] = r.path[r.path.length - 1];
  return {
    key: `exam:${r.id}`,
    source: "exam",
    kind: null,
    title: r.name,
    reason: r.coverage <= 0 ? "Percorso d'esame mai fatto" : `Percorso d'esame fatto al ${percent(r.coverage)}`,
    lat: sLat,
    lng: sLng,
    street: null,
    errors: null,
    lastAt: null,
    examRouteId: r.id,
    endLat: eLat,
    endLng: eLng,
    // Il lavoro è percorrerlo tutto.
    workMin: Math.max(PLAN_STOP_MINUTES, Math.ceil(r.lengthMeters / metersPerMinute)),
  };
}

/** Le candidate in ordine di priorità (la prima è la più importante). */
export function planCandidates(input: LessonPlanInput): Candidate[] {
  const student = input.studentHotspots.map(studentCandidate);

  let school: Candidate | null = null;
  for (const kind of input.studentKinds) {
    const h = input.schoolHotspots
      .filter((x) => x.kind === kind && !student.some((s) => s.kind === kind && near(s, x)))
      .sort((a, b) => b.errors - a.errors || b.students - a.students)[0];
    if (h) {
      school = schoolCandidate(h);
      break;
    }
  }

  const route = input.examRoutes
    .filter((r) => r.path.length >= 2 && r.coverage < COVERAGE_DONE)
    .sort((a, b) => a.coverage - b.coverage || a.lengthMeters - b.lengthMeters)[0];
  const exam = route ? examCandidate(route) : null;

  const others = [school, exam].filter((c): c is Candidate => c != null);
  const firstStudents = student.slice(0, others.length ? PLAN_MAX_STUDENT_STOPS : PLAN_MAX_STOPS);
  return [...firstStudents, ...others, ...student.slice(firstStudents.length)].slice(0, PLAN_MAX_STOPS);
}

const travelMin = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.max(1, Math.ceil(haversineMeters(a.lat, a.lng, b.lat, b.lng) / metersPerMinute));

const exitOf = (c: Candidate) => (c.endLat != null && c.endLng != null ? { lat: c.endLat, lng: c.endLng } : c);

/** «Più vicina prima» dalla partenza; senza partenza si comincia dalla più importante. */
function orderStops(cands: Candidate[], start: LessonPlanInput["start"]) {
  const left = [...cands];
  const out: PlanStop[] = [];
  let at: { lat: number; lng: number } | null = start;
  let total = 0;
  while (left.length) {
    let idx = 0;
    if (at) {
      let best = Infinity;
      left.forEach((c, i) => {
        const d = haversineMeters(at!.lat, at!.lng, c.lat, c.lng);
        if (d < best) [best, idx] = [d, i];
      });
    }
    const [c] = left.splice(idx, 1);
    const minutes = at ? travelMin(at, c) : 0;
    const { workMin, ...stop } = c;
    out.push({ ...stop, minutes });
    total += minutes + workMin;
    at = exitOf(c);
  }
  if (start && at && out.length) total += travelMin(at, start);
  return { stops: out, minutes: total };
}

export function buildLessonPlan(input: LessonPlanInput): LessonPlan {
  const cands = planCandidates(input);
  // Si tolgono le meno importanti finché il giro sta nella guida.
  for (let n = cands.length; n > 0; n--) {
    const plan = orderStops(cands.slice(0, n), input.start);
    if (plan.minutes <= input.durationMin) return plan;
  }
  return { stops: [], minutes: 0 };
}
