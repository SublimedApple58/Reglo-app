import { haversineMeters } from "@/lib/autoscuole/road/geo";

/**
 * Road novembre R7 (Tiziano 10/11/2026) — una segnalazione può essere un
 * PUNTO o una ZONA: un tratto della strada percorsa lungo 50, 100 o 200 m,
 * centrato sul punto. Il tratto si ricava dalla traccia della guida:
 * - ancora = il punto della traccia più vicino NEL TEMPO all'ora della
 *   segnalazione (una strada fatta due volte non confonde);
 * - se la segnalazione è stata spostata a mano (oltre `ANCHOR_MAX_M` da quel
 *   punto), il punto della traccia più vicino nello spazio entro la stessa
 *   distanza; se la traccia lì non passa, resta un punto (null);
 * - ai capi della traccia il tratto si accorcia (non si inventa strada).
 * Logica pura, gemella di `reglo-mobile/src/road/markerExtent.ts`: tenerle uguali.
 */

export const ROAD_MARKER_EXTENTS = [50, 100, 200] as const;
export type RoadMarkerExtentM = (typeof ROAD_MARKER_EXTENTS)[number];

/** Oltre questa distanza dalla traccia la segnalazione non si aggancia. */
export const ANCHOR_MAX_M = 40;

/** 50 | 100 | 200, qualunque altra cosa = punto (null). */
export function normalizeExtentM(v: unknown): RoadMarkerExtentM | null {
  const n = Number(v);
  return (ROAD_MARKER_EXTENTS as readonly number[]).includes(n) ? (n as RoadMarkerExtentM) : null;
}

/** Punto della traccia: [lat, lng] o [lat, lng, tMs]. */
type PathPoint = readonly [number, number, ...number[]];
export type ExtentLine = Array<[number, number]>;

const round = (v: number) => Math.round(v * 1e6) / 1e6;

function cumulative(path: readonly PathPoint[]) {
  const c = [0];
  for (let i = 1; i < path.length; i++) {
    c.push(c[i - 1] + haversineMeters(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  }
  return c;
}

/** Proiezione di (lat, lng) sul segmento i→i+1: distanza lungo il segmento e dal segmento, in metri. */
function project(path: readonly PathPoint[], i: number, lat: number, lng: number) {
  const a = path[i];
  const b = path[i + 1];
  const k = Math.cos((a[0] * Math.PI) / 180);
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = lng * k, py = lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const qLat = ay + t * dy;
  const qLng = (ax + t * dx) / k;
  return { t, off: haversineMeters(lat, lng, qLat, qLng) };
}

/** Distanza lungo la traccia (metri dall'inizio) del punto a cui si àncora la segnalazione. */
export function anchorAlong(
  path: readonly PathPoint[],
  cum: number[],
  m: { lat: number; lng: number; recordedAtMs: number | null },
): number | null {
  if (path.length < 2) return null;
  const timed = m.recordedAtMs != null && path.every((p) => typeof p[2] === "number");
  if (timed) {
    let best = 0;
    for (let i = 1; i < path.length; i++) {
      if (Math.abs((path[i][2] as number) - m.recordedAtMs!) < Math.abs((path[best][2] as number) - m.recordedAtMs!)) best = i;
    }
    // Il segmento attorno al punto di quell'ora: la proiezione più vicina.
    let along: number | null = null;
    let off = Infinity;
    for (const i of [best - 1, best]) {
      if (i < 0 || i >= path.length - 1) continue;
      const p = project(path, i, m.lat, m.lng);
      if (p.off < off) {
        off = p.off;
        along = cum[i] + p.t * (cum[i + 1] - cum[i]);
      }
    }
    if (along != null && off <= ANCHOR_MAX_M) return along;
  }
  // Spostata a mano (o traccia senza ore): il passaggio più vicino nello spazio.
  let along: number | null = null;
  let off = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const p = project(path, i, m.lat, m.lng);
    if (p.off < off) {
      off = p.off;
      along = cum[i] + p.t * (cum[i + 1] - cum[i]);
    }
  }
  return along != null && off <= ANCHOR_MAX_M ? along : null;
}

function pointAt(path: readonly PathPoint[], cum: number[], d: number): [number, number] {
  const total = cum[cum.length - 1];
  const x = Math.max(0, Math.min(total, d));
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= x) {
      const seg = cum[i] - cum[i - 1];
      const t = seg ? (x - cum[i - 1]) / seg : 0;
      return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])];
    }
  }
  const last = path[path.length - 1];
  return [last[0], last[1]];
}

/** Il pezzo di traccia fra `from` e `to` (metri dall'inizio). */
export function sliceAlong(path: readonly PathPoint[], cum: number[], from: number, to: number): ExtentLine {
  const total = cum[cum.length - 1];
  const a = Math.max(0, from);
  const b = Math.min(total, to);
  if (b <= a) return [];
  const out: ExtentLine = [pointAt(path, cum, a)];
  for (let i = 0; i < path.length; i++) if (cum[i] > a && cum[i] < b) out.push([path[i][0], path[i][1]]);
  out.push(pointAt(path, cum, b));
  return out.map(([lat, lng]) => [round(lat), round(lng)]);
}

/**
 * Il tratto di una segnalazione «zona» sulla traccia, o null (punto, traccia
 * troppo corta, o segnalazione lontana dalla strada percorsa).
 */
export function markerExtent(
  path: readonly PathPoint[],
  m: { lat: number; lng: number; recordedAtMs: number | null; extentM: unknown },
): ExtentLine | null {
  const len = normalizeExtentM(m.extentM);
  if (!len || path.length < 2) return null;
  const cum = cumulative(path);
  const s = anchorAlong(path, cum, m);
  if (s == null) return null;
  const line = sliceAlong(path, cum, s - len / 2, s + len / 2);
  return line.length >= 2 ? line : null;
}

/** Tratto salvato valido (array di [lat, lng] numerici, almeno 2) o null. */
export function storedExtent(v: unknown): ExtentLine | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const ok = v.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  return ok ? (v as ExtentLine).map((p) => [p[0], p[1]]) : null;
}
