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
 * - Ripasso (REG-677): sui punti dell'allievo l'istruttore tocca «Meglio» o
 *   «No»; due «Meglio» di fila dopo l'ultimo errore = punto superato, che non
 *   diventa più una tappa (resta sulla mappa).
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

/** REG-677: «Meglio» (questa volta meglio) / «No» (ancora no) su un punto dell'allievo. */
export type HotspotCheckOutcome = "better" | "worse";

/**
 * REG-677: stato del punto, dalla coda della storia del punto (errori segnalati
 * e «No» = errore; «Meglio» = meglio): nessun «Meglio» dopo l'ultimo errore =
 * `open`, uno = `improving`, due o più = `overcome` (superato).
 */
export type HotspotStatus = "open" | "improving" | "overcome";

/** «Meglio» di fila dopo l'ultimo errore per dire superato un punto. */
export const HOTSPOT_OVERCOME_STREAK = 2;

export type HotspotCheck = {
  id: string;
  kind: string;
  lat: number;
  lng: number;
  outcome: HotspotCheckOutcome;
  recordedAt: Date;
};

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
  /** REG-677: la nota più recente (non vuota) dell'istruttore sulle segnalazioni del punto. */
  note: string | null;
  /** REG-677: i ripassi sul punto. */
  checks: { better: number; worse: number };
  lastCheck: { outcome: HotspotCheckOutcome; at: string } | null;
  status: HotspotStatus;
};

function mostFrequent(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

/**
 * Stato del punto dalla sua storia. A pari istante l'errore conta dopo il
 * «Meglio» (in dubbio il punto resta da lavorare).
 */
export function hotspotStatus(events: Array<{ at: number; type: "error" | "better" }>): HotspotStatus {
  const sorted = [...events].sort((a, b) => a.at - b.at || (a.type === b.type ? 0 : a.type === "error" ? 1 : -1));
  let streak = 0;
  for (const e of sorted) streak = e.type === "error" ? 0 : streak + 1;
  if (streak >= HOTSPOT_OVERCOME_STREAK) return "overcome";
  return streak === 1 ? "improving" : "open";
}

/**
 * Ogni ripasso va al punto più vicino dello stesso tipo entro `HOTSPOT_RADIUS_M`
 * dal centro (uno solo); quelli lontani da tutti i punti si ignorano.
 */
export function assignChecks<P extends { kind: string; lat: number; lng: number }>(
  points: P[],
  checks: HotspotCheck[],
): Map<P, HotspotCheck[]> {
  const out = new Map<P, HotspotCheck[]>(points.map((p) => [p, []]));
  for (const c of checks) {
    let best: P | null = null;
    let bestD = Infinity;
    for (const p of points) {
      if (p.kind !== c.kind) continue;
      const d = haversineMeters(p.lat, p.lng, c.lat, c.lng);
      if (d <= HOTSPOT_RADIUS_M && d < bestD) [best, bestD] = [p, d];
    }
    if (best) out.get(best)!.push(c);
  }
  return out;
}

/**
 * Le segnalazioni «da migliorare» di UN allievo → i suoi punti ripetuti, i più
 * frequenti prima. `checks` (REG-677, facoltativi) = i suoi ripassi «Meglio / No».
 */
export function buildStudentHotspots(markers: HotspotMarker[], checks: HotspotCheck[] = []): StudentHotspot[] {
  const clusters = clusterMarkers(markers).filter(
    (c) => new Set(c.markers.map((m) => m.sessionId)).size >= STUDENT_HOTSPOT_MIN_SESSIONS,
  );
  const byCluster = assignChecks(clusters, checks);
  const out: StudentHotspot[] = [];
  for (const c of clusters) {
    const sessions = new Set(c.markers.map((m) => m.sessionId)).size;
    const last = c.markers[c.markers.length - 1];
    const mine = byCluster.get(c) ?? [];
    let lastCheck: HotspotCheck | null = null;
    for (const k of mine) if (!lastCheck || k.recordedAt > lastCheck.recordedAt) lastCheck = k;
    // `clusterMarkers` tiene le segnalazioni in ordine di tempo: la nota più recente è in fondo.
    let note: string | null = null;
    for (let i = c.markers.length - 1; i >= 0 && !note; i--) note = c.markers[i].note?.trim() || null;
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
      note,
      checks: {
        better: mine.filter((k) => k.outcome === "better").length,
        worse: mine.filter((k) => k.outcome === "worse").length,
      },
      lastCheck: lastCheck ? { outcome: lastCheck.outcome, at: lastCheck.recordedAt.toISOString() } : null,
      status: hotspotStatus([
        ...c.markers.map((m) => ({ at: m.recordedAt.getTime(), type: "error" as const })),
        ...mine.map((k) => ({ at: k.recordedAt.getTime(), type: k.outcome === "better" ? ("better" as const) : ("error" as const) })),
      ]),
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
  /** Dove si chiude il giro: la sede (REG-653). Null/assente = all'ultima tappa. */
  end?: { lat: number; lng: number } | null;
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
  // REG-677: un punto superato (due «Meglio» di fila) non è più una tappa.
  const student = input.studentHotspots.filter((h) => h.status !== "overcome").map(studentCandidate);

  let school: Candidate | null = null;
  for (const kind of input.studentKinds) {
    const h = input.schoolHotspots
      // Anche un punto superato dell'allievo esclude quello dell'autoscuola lì: non lo si ripropone da un'altra parte.
      .filter((x) => x.kind === kind && !input.studentHotspots.some((s) => s.kind === kind && near(s, x)))
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

type Pt = { lat: number; lng: number };
const dist = (a: Pt, b: Pt) => haversineMeters(a.lat, a.lng, b.lat, b.lng);

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

/**
 * REG-653: l'ordine che fa meno strada (in linea d'aria) partenza → tappe →
 * sede. Le tappe sono al massimo 3, quindi si provano tutte le combinazioni. A
 * parità (un giro chiuso fatto al contrario) vince quella che comincia dalla
 * più vicina. È l'ordine della card; alla partenza la linea lo raffina con
 * `optimizeWaypointOrder` sulle strade vere (`plan-route.ts`).
 */
function bestOrder(cands: Candidate[], start: Pt, end: Pt | null) {
  let best: Candidate[] = cands;
  let bestCost = Infinity;
  let bestFirst = Infinity;
  for (const perm of permutations(cands)) {
    let at: Pt = start;
    let cost = 0;
    for (const c of perm) {
      cost += dist(at, c);
      at = exitOf(c);
    }
    if (end) cost += dist(at, end);
    const first = dist(start, perm[0]);
    if (cost < bestCost - 1 || (Math.abs(cost - bestCost) <= 1 && first < bestFirst)) {
      [best, bestCost, bestFirst] = [perm, cost, first];
    }
  }
  return best;
}

/** Senza partenza si va in ordine di importanza; il giro si chiude in sede se c'è. */
function orderStops(cands: Candidate[], start: LessonPlanInput["start"], end: Pt | null) {
  const ordered = start && cands.length ? bestOrder(cands, start, end) : cands;
  const out: PlanStop[] = [];
  let at: Pt | null = start;
  let total = 0;
  for (const c of ordered) {
    const minutes = at ? travelMin(at, c) : 0;
    const { workMin, ...stop } = c;
    out.push({ ...stop, minutes });
    total += minutes + workMin;
    at = exitOf(c);
  }
  if (end && at && out.length) total += travelMin(at, end);
  return { stops: out, minutes: total };
}

export function buildLessonPlan(input: LessonPlanInput): LessonPlan {
  const cands = planCandidates(input);
  // Si tolgono le meno importanti finché il giro sta nella guida.
  for (let n = cands.length; n > 0; n--) {
    const plan = orderStops(cands.slice(0, n), input.start, input.end ?? null);
    if (plan.minutes <= input.durationMin) return plan;
  }
  return { stops: [], minutes: 0 };
}

// ─── REG-648: interruttori, giro salvato, tappe raggiunte, linea suggerita ──

/** Interruttori in `limits`: assenti = accesi (decisione di Tiziano, 29/10). */
export function planSettings(limits: Record<string, unknown>) {
  return {
    planEnabled: limits.roadPlanEnabled !== false,
    planAlertsEnabled: limits.roadPlanAlertsEnabled !== false,
  };
}

/** Tappa raggiunta: il tracciato passa entro tanti metri. */
export const PLAN_REACHED_M = 40;
/** Percorso d'esame fatto: il tracciato ne copre almeno questa quota. */
export const PLAN_EXAM_REACHED = 0.6;
/** Partenza entro tanti metri dalla sede = la sede (così la linea pesca dalla cache). */
export const PLAN_HQ_SNAP_M = 150;

export type StoredPlanStop = Pick<
  PlanStop,
  "key" | "source" | "kind" | "title" | "reason" | "lat" | "lng" | "minutes" | "examRouteId" | "endLat" | "endLng"
>;
/** Quello che va in `RoadSession.plan`: le tappe scelte alla partenza. */
/** `custom`: giro modificato dall'istruttore (REG-668), tiene il suo ordine. */
export type StoredPlan = { stops: StoredPlanStop[]; minutes: number; chosenAt: string; custom?: boolean };
/** Quello che va in `RoadSession.planReached` a fine guida. */
export type PlanReached = { reached: string[]; total: number };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const lat = (v: unknown) => isNum(v) && Math.abs(v) <= 90;
const lng = (v: unknown) => isNum(v) && Math.abs(v) <= 180;
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const SOURCES = new Set<PlanSource>(["student", "school", "exam"]);

/**
 * Il giro mandato dalla mobile all'ingresso in Road. `null`/assente = «Senza
 * giro»; `undefined` = malformato (si parte comunque, senza giro).
 */
export function parseStoredPlan(raw: unknown, now = new Date()): StoredPlan | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "object" || !Array.isArray((raw as { stops?: unknown }).stops)) return undefined;
  const r = raw as { stops: unknown[]; minutes?: unknown };
  if (r.stops.length === 0) return null;
  if (r.stops.length > PLAN_MAX_STOPS) return undefined;
  const stops: StoredPlanStop[] = [];
  for (const s of r.stops) {
    if (!s || typeof s !== "object") return undefined;
    const o = s as Record<string, unknown>;
    const key = str(o.key, 120);
    const title = str(o.title, 120);
    if (!key || !title || !SOURCES.has(o.source as PlanSource) || !lat(o.lat) || !lng(o.lng)) return undefined;
    const exam = o.source === "exam";
    if (exam && (!str(o.examRouteId, 40) || !lat(o.endLat) || !lng(o.endLng))) return undefined;
    stops.push({
      key,
      source: o.source as PlanSource,
      kind: str(o.kind, 60),
      title,
      reason: str(o.reason, 200) ?? "",
      lat: o.lat as number,
      lng: o.lng as number,
      minutes: isNum(o.minutes) ? Math.max(0, Math.round(o.minutes)) : 0,
      examRouteId: exam ? str(o.examRouteId, 40) : null,
      endLat: exam ? (o.endLat as number) : null,
      endLng: exam ? (o.endLng as number) : null,
    });
  }
  return { stops, minutes: isNum(r.minutes) ? Math.max(0, Math.round(r.minutes)) : 0, chosenAt: now.toISOString() };
}

/** A fine guida: quali tappe il tracciato ha toccato (percorso d'esame: coperto almeno al 60%). */
export function computePlanReached(
  stops: StoredPlanStop[],
  track: LatLng[],
  examPaths: Map<string, LatLng[]>,
): PlanReached {
  const reached: string[] = [];
  for (const s of stops) {
    if (s.source === "exam") {
      const path = s.examRouteId ? examPaths.get(s.examRouteId) : undefined;
      if (path && path.length >= 2 && examRouteCoverage(path, [track]) >= PLAN_EXAM_REACHED) reached.push(s.key);
    } else if (track.some(([la, ln]) => haversineMeters(la, ln, s.lat, s.lng) <= PLAN_REACHED_M)) {
      reached.push(s.key);
    }
  }
  return { reached, total: stops.length };
}

/**
 * La linea suggerita a pezzi: tratti da agganciare alle strade (partenza →
 * tappa → … → sede) e percorsi d'esame già salvati, da usare così come sono.
 * Dopo un percorso d'esame si riparte dalla sua fine. Senza sede la linea
 * finisce all'ultima tappa (REG-653).
 */
export type RoutePiece = { kind: "snap"; points: LatLng[] } | { kind: "path"; path: LatLng[] };

export function planRoutePieces(
  start: { lat: number; lng: number },
  stops: StoredPlanStop[],
  examPaths: Map<string, LatLng[]>,
  end: { lat: number; lng: number } | null = null,
): RoutePiece[] {
  const pieces: RoutePiece[] = [];
  let run: LatLng[] = [[start.lat, start.lng]];
  for (const s of stops) {
    const path = s.source === "exam" && s.examRouteId ? examPaths.get(s.examRouteId) : undefined;
    if (path && path.length >= 2) {
      run.push(path[0]);
      if (run.length >= 2) pieces.push({ kind: "snap", points: run });
      pieces.push({ kind: "path", path });
      run = [path[path.length - 1]];
    } else {
      run.push([s.lat, s.lng]);
    }
  }
  if (end) run.push([end.lat, end.lng]);
  if (run.length >= 2) pieces.push({ kind: "snap", points: run });
  return pieces;
}

/**
 * REG-653: i punti da dare a `optimizeWaypointOrder` — partenza, una tappa per
 * intermedio (il percorso d'esame entra dal suo inizio, è un blocco unico),
 * sede. Senza sede o con meno di due tappe non c'è niente da ottimizzare.
 */
export function optimizeWaypoints(
  start: { lat: number; lng: number },
  stops: StoredPlanStop[],
  end: { lat: number; lng: number } | null,
): LatLng[] | null {
  if (!end || stops.length < 2) return null;
  return [[start.lat, start.lng], ...stops.map((s) => [s.lat, s.lng] as LatLng), [end.lat, end.lng]];
}

/** L'ordine di Google (`optimizedIntermediateWaypointIndex`) se è valido, altrimenti quello dato. */
export function applyStopOrder<T>(stops: T[], order: unknown): T[] {
  const n = stops.length;
  if (!Array.isArray(order) || order.length !== n) return stops;
  const seen = new Set<number>();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) return stops;
    seen.add(i);
  }
  return (order as number[]).map((i) => stops[i]);
}

/**
 * REG-653: oltre questa distanza dalla partenza la sede non chiude il giro
 * (coordinate sbagliate, un luogo di un'altra città, l'istruttore fuori zona):
 * tornarci mangerebbe tutta la guida e il giro resterebbe vuoto.
 */
export const PLAN_HQ_MAX_M = 15_000;

/** Dove si chiude il giro: la sede, se è a portata della partenza. */
export function planEnd(
  start: { lat: number; lng: number } | null,
  hq: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  if (!hq) return null;
  if (start && haversineMeters(start.lat, start.lng, hq.lat, hq.lng) > PLAN_HQ_MAX_M) return null;
  return hq;
}

/** Se la partenza è vicino alla sede si usa la sede: stessi tratti, stessa cache. */
export function planStart(
  start: { lat: number; lng: number } | null,
  hq: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  if (!start) return hq;
  if (hq && haversineMeters(start.lat, start.lng, hq.lat, hq.lng) <= PLAN_HQ_SNAP_M) return hq;
  return start;
}
