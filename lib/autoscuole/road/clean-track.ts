import { haversineMeters, type RoadPoint } from "@/lib/autoscuole/road/geo";

/**
 * REG-665 Reglo Road — traccia pulita e agganciata alla strada.
 *
 * Il GPS da fermo «balla» di qualche metro a ogni fix: in sede, a un semaforo
 * lungo o in sosta il percorso diventava un groviglio. Qui, una volta sola a
 * guida finita:
 * 1. via i fix imprecisi (> 25 m) e i salti impossibili per un'auto;
 * 2. auto ferma (entro 30 m per almeno 2 minuti) = un punto solo; se resta
 *    ferma almeno 5 minuti diventa una sosta, che la mappa mostra come
 *    segnaposto «Sosta X min»;
 * 3. la linea va sulle strade vere con Google Roads `snapToRoads`
 *    (interpolate), sulla traccia diradata a circa un punto ogni 30 m: per
 *    un'ora di guida 6–8 richieste.
 * Se Google non risponde resta la traccia pulita (punto 2), senza aggancio.
 */

export const CLEAN_TRACK_VERSION = 1;
/** Oltre questa incertezza il fix non entra nella traccia pulita. */
const MAX_ACCURACY_M = 25;
/** Salto impossibile (≈ 180 km/h). */
const MAX_SPEED_MS = 50;
/** Auto «ferma»: tutti i fix entro questo raggio dal centro del gruppo. */
const STILL_RADIUS_M = 30;
/** Da quanto ferma il gruppo diventa un punto solo. */
const STILL_MIN_MS = 2 * 60_000;
/** Da quanto ferma diventa una sosta con il segnaposto. */
export const STOP_MIN_MS = 5 * 60_000;
/** Fix sparsi fuori raggio per meno di così non interrompono la sosta. */
const OUTLIER_MS = 60_000;
/** Distanza minima fra i punti mandati a Google. */
const SNAP_SPACING_M = 30;
/** Punto agganciato più lontano di così da quello dato = aggancio sbagliato. */
const SNAP_MAX_SHIFT_M = 40;
/** Limite di Google Roads per richiesta. */
const ROADS_MAX_POINTS = 100;
const ROADS_TIMEOUT_MS = 10_000;
const ROADS_URL = "https://roads.googleapis.com/v1/snapToRoads";

/** [lat, lng, tMs] */
export type TrackPoint = [number, number, number];
export type TrackStop = { lat: number; lng: number; startMs: number; endMs: number; minutes: number };
export type CleanTrack = {
  v: number;
  /** true = linea sulle strade (Google), false = solo pulita. */
  snapped: boolean;
  path: TrackPoint[];
  stops: TrackStop[];
  distanceMeters: number;
  /** Miniatura già pronta (60 punti): le liste leggono solo questa. */
  thumb: Array<[number, number]>;
  /** Aggancio fallito: quando riprovare (ms epoch). */
  retryAfter?: number;
};

const dist = (a: { 0: number; 1: number }, b: { 0: number; 1: number }) => haversineMeters(a[0], a[1], b[0], b[1]);

/** Passi 1 e 2: filtra il rumore e accorpa i momenti da fermo. */
export function cleanTrackPoints(points: RoadPoint[]): { path: TrackPoint[]; stops: TrackStop[] } {
  // 1. fix buoni, in ordine, senza salti impossibili
  const good: TrackPoint[] = [];
  for (const p of [...points].sort((a, b) => a[0] - b[0])) {
    if (p[5] != null && p[5] > MAX_ACCURACY_M) continue;
    const last = good[good.length - 1];
    if (last) {
      const dt = Math.max(1, (p[0] - last[2]) / 1000);
      if (dist([p[1], p[2]], last) / dt > MAX_SPEED_MS) continue;
      if (p[0] === last[2]) continue;
    }
    good.push([p[1], p[2], p[0]]);
  }

  // 2. gruppi da fermo: si allarga finché i fix restano vicini al centro
  const path: TrackPoint[] = [];
  const stops: TrackStop[] = [];
  let i = 0;
  while (i < good.length) {
    let lat = good[i][0];
    let lng = good[i][1];
    let j = i + 1;
    let n = 1;
    while (j < good.length) {
      if (dist(good[j], [lat, lng]) > STILL_RADIUS_M) {
        // Un fix «scappato» non chiude il gruppo se poco dopo si è di nuovo lì.
        const back = backInside(good, j, [lat, lng]);
        if (back < 0) break;
        j = back;
        continue;
      }
      n++;
      lat += (good[j][0] - lat) / n;
      lng += (good[j][1] - lng) / n;
      j++;
    }
    const start = good[i][2];
    const end = good[j - 1][2];
    if (j - i > 1 && end - start >= STILL_MIN_MS) {
      // Fermo: un punto all'arrivo e uno alla ripartenza, nello stesso posto
      // (il tempo resta giusto per il «fatto fin qui»).
      const c: [number, number] = [round6(lat), round6(lng)];
      path.push([c[0], c[1], start], [c[0], c[1], end]);
      if (end - start >= STOP_MIN_MS) {
        stops.push({ lat: c[0], lng: c[1], startMs: start, endMs: end, minutes: Math.round((end - start) / 60_000) });
      }
      i = j;
    } else {
      path.push(good[i]);
      i++;
    }
  }
  return { path, stops };
}

/** Entro OUTLIER_MS dal fix `j` (fuori raggio) ce n'è uno di nuovo dentro? Il suo indice, o -1. */
function backInside(good: TrackPoint[], j: number, c: [number, number]): number {
  for (let k = j + 1; k < good.length && good[k][2] - good[j][2] <= OUTLIER_MS; k++) {
    if (dist(good[k], c) <= STILL_RADIUS_M) return k;
  }
  return -1;
}

export function pathLength(path: TrackPoint[]): number {
  let m = 0;
  for (let k = 1; k < path.length; k++) m += dist(path[k - 1], path[k]);
  return m;
}

/** Diradato per Google: ~un punto ogni 30 m, sempre il primo e l'ultimo. */
export function thinForSnap(path: TrackPoint[], spacing = SNAP_SPACING_M): TrackPoint[] {
  if (path.length <= 2) return path;
  const out: TrackPoint[] = [path[0]];
  for (let k = 1; k < path.length - 1; k++) {
    if (dist(path[k], out[out.length - 1]) >= spacing) out.push(path[k]);
  }
  const lastP = path[path.length - 1];
  if (dist(lastP, out[out.length - 1]) > 0 || out.length === 1) out.push(lastP);
  return out;
}

/** Una risposta di Google: punti agganciati, `originalIndex` sui punti dati. */
export type SnappedPoint = { lat: number; lng: number; originalIndex?: number };
export type FetchSnap = (path: Array<[number, number]>) => Promise<SnappedPoint[]>;

export const fetchSnapFromGoogle: FetchSnap = async (path) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY mancante");
  const qs = new URLSearchParams({
    interpolate: "true",
    path: path.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join("|"),
    key,
  });
  const res = await fetch(`${ROADS_URL}?${qs}`, { signal: AbortSignal.timeout(ROADS_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`Roads API ${res.status}`);
  const data = (await res.json()) as {
    snappedPoints?: Array<{ location: { latitude: number; longitude: number }; originalIndex?: number }>;
  };
  return (data.snappedPoints ?? []).map((p) => ({
    lat: p.location.latitude,
    lng: p.location.longitude,
    originalIndex: p.originalIndex,
  }));
};

/**
 * Passo 3: aggancia la linea diradata. Pezzi da 100 punti con un punto in
 * comune; i tempi dei punti aggiunti da Google si interpolano fra i due punti
 * dati che li circondano. Lancia se Google non risponde o non aggancia niente.
 *
 * Fra due punti dati consecutivi, se la linea di Google è molto più lunga (una
 * deviazione: la strada vera non è nel suo grafo, piazzali, campagna) o molto
 * più corta (ha tagliato dritto dove ha scartato punti) della traccia pulita,
 * lì restano i punti della traccia pulita dello stesso intervallo di tempo. Un
 * punto agganciato a più di 40 m da quello dato torna al punto dato.
 */
export async function snapPath(
  thin: TrackPoint[],
  fetchSnap: FetchSnap = fetchSnapFromGoogle,
  clean: TrackPoint[] = thin,
): Promise<TrackPoint[]> {
  if (thin.length < 2) return thin;
  const chunks: TrackPoint[][] = [];
  for (let from = 0; from < thin.length - 1; from += ROADS_MAX_POINTS - 1) {
    chunks.push(thin.slice(from, from + ROADS_MAX_POINTS));
  }
  const answers = await Promise.all(chunks.map((pts) => fetchSnap(pts.map((p) => [p[0], p[1]]))));
  const out: TrackPoint[] = [];
  answers.forEach((snapped, ci) => {
    const pts = chunks[ci];
    if (!snapped.length) throw new Error("Roads API: nessun punto agganciato");
    const known = snapped.map((s) => (s.originalIndex != null ? pts[s.originalIndex]?.[2] : undefined));
    const times = fillTimes(known);
    const line: Array<{ p: TrackPoint; oi?: number }> = snapped.map((s, k) => {
      const orig = s.originalIndex != null ? pts[s.originalIndex] : undefined;
      const far = orig && dist(orig, [s.lat, s.lng]) > SNAP_MAX_SHIFT_M;
      return { p: far ? orig : [round6(s.lat), round6(s.lng), times[k]], oi: s.originalIndex };
    });
    const anchors = line.map((x, k) => (x.oi != null ? k : -1)).filter((k) => k >= 0);
    anchors.forEach((ka, n) => {
      // Il primo punto di ogni pezzo dopo il primo è l'ultimo del precedente.
      if (!(ci > 0 && line[ka].oi === 0)) out.push(line[ka].p);
      const kb = anchors[n + 1];
      if (kb == null) return;
      const chain = line.slice(ka, kb + 1).map((x) => x.p);
      const given = pts.slice(line[ka].oi!, line[kb].oi! + 1);
      const gLen = pathLength(given);
      const cLen = pathLength(chain);
      if (cLen > gLen * 1.5 + 40 || cLen < gLen * 0.6 - 40) {
        const [ta, tb] = [line[ka].p[2], line[kb].p[2]];
        for (const c of clean) if (c[2] > ta && c[2] < tb) out.push(c);
      } else {
        out.push(...chain.slice(1, -1));
      }
    });
  });
  return out;
}

/** Riempie i tempi mancanti interpolando fra i noti (agli estremi: il più vicino). */
function fillTimes(known: Array<number | undefined>): number[] {
  const idx = known.map((t, k) => (t != null ? k : -1)).filter((k) => k >= 0);
  if (!idx.length) return known.map(() => 0);
  return known.map((t, k) => {
    if (t != null) return t;
    const before = [...idx].reverse().find((x) => x < k);
    const after = idx.find((x) => x > k);
    if (before == null) return known[after!]!;
    if (after == null) return known[before]!;
    const f = (k - before) / (after - before);
    return Math.round(known[before]! + (known[after]! - known[before]!) * f);
  });
}

/** Traccia pulita completa. Google che non risponde = traccia solo pulita, da riprovare. */
export async function buildCleanTrack(
  points: RoadPoint[],
  opts: { snap?: boolean; fetchSnap?: FetchSnap; now?: number } = {},
): Promise<CleanTrack> {
  const { path, stops } = cleanTrackPoints(points);
  const base: CleanTrack = {
    v: CLEAN_TRACK_VERSION,
    snapped: false,
    path,
    stops,
    distanceMeters: Math.round(pathLength(path)),
    thumb: thumbPath(path),
  };
  if (opts.snap === false || path.length < 2) return base;
  try {
    const snapped = await snapPath(thinForSnap(path), opts.fetchSnap, path);
    return { ...base, snapped: true, path: snapped, distanceMeters: Math.round(pathLength(snapped)), thumb: thumbPath(snapped) };
  } catch (e) {
    console.warn("[road] snapToRoads", e instanceof Error ? e.message : e);
    return { ...base, retryAfter: (opts.now ?? Date.now()) + 24 * 3600_000 };
  }
}

/** Una traccia salvata è da (ri)calcolare? Versione vecchia o aggancio da riprovare. */
export function needsRebuild(stored: unknown, now = Date.now()): boolean {
  const t = stored as CleanTrack | null | undefined;
  if (!t || typeof t !== "object" || t.v !== CLEAN_TRACK_VERSION || !Array.isArray(t.path)) return true;
  return !t.snapped && t.retryAfter != null && now >= t.retryAfter;
}

/** Al massimo N punti, a passo regolare: basta per una miniatura. */
export function thumbPath(path: TrackPoint[], max = 60): Array<[number, number]> {
  if (path.length <= max) return path.map((p) => [p[0], p[1]]);
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => {
    const p = path[Math.round(i * step)];
    return [p[0], p[1]] as [number, number];
  });
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
