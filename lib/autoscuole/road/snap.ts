import { getRedis } from "@/lib/cache/redis";
import { joinSegments, pathLengthMeters, simplifyPath, type LatLng } from "@/lib/autoscuole/road/exam-routes";

export { joinSegments };

/**
 * REG-642 Reglo Road — aggancio dei percorsi d'esame alle strade vere.
 *
 * Il titolare mette i punti sulla mappa; qui ogni tratto fra due punti
 * consecutivi diventa la strada che un'auto farebbe (Google Routes API,
 * `computeRoutes`). Per contenere il costo (si paga a richiesta):
 * - ogni tratto si calcola una volta sola: cache Redis per coppia di punti
 *   (arrotondati a ~1 m), così spostare un punto ricalcola solo i due tratti
 *   che lo toccano;
 * - i tratti mancanti e consecutivi vanno in UNA richiesta (punti intermedi
 *   come tappe: ogni tappa = una «leg» = un tratto), al massimo 10 intermedi
 *   per richiesta (oltre Google applica la tariffa più cara);
 * - niente traffico (`TRAFFIC_UNAWARE`, la tariffa base);
 * - il client chiama solo quando un punto viene lasciato o si salva (debounce,
 *   REG-645), mai a ogni movimento del mouse.
 * La geometria delle strade non dipende dall'ambiente: la chiave di cache non
 * porta né companyId né APP_ENV (dev, staging e prod condividono Upstash).
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
/** Oltre 10 intermedi Google passa alla tariffa «Advanced». */
export const SNAP_MAX_INTERMEDIATES = 10;
const SNAP_TIMEOUT_MS = 10_000;
const SNAP_CACHE_TTL_S = 60 * 60 * 24 * 90;
const SNAP_CACHE_PREFIX = "road:snap:v1:";

const coordKey = ([lat, lng]: LatLng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
export const segmentKey = (a: LatLng, b: LatLng) => `${SNAP_CACHE_PREFIX}${coordKey(a)}>${coordKey(b)}`;

/**
 * Raggruppa i tratti da calcolare (indici `i` = tratto da waypoint i a i+1) in
 * corse consecutive, ognuna al massimo `maxLegs` tratti: una corsa = una
 * richiesta a Google.
 */
export function planSnapRuns(missing: number[], maxLegs = SNAP_MAX_INTERMEDIATES + 1): Array<{ from: number; legs: number }> {
  const runs: Array<{ from: number; legs: number }> = [];
  for (const i of [...missing].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && last.from + last.legs === i && last.legs < maxLegs) last.legs++;
    else runs.push({ from: i, legs: 1 });
  }
  return runs;
}


export class SnapError extends Error {
  constructor(
    public code: "SNAP_UNAVAILABLE" | "NO_ROUTE",
    message: string,
  ) {
    super(message);
  }
}

/** Una richiesta: i punti dati (origine, intermedi, arrivo) → una linea per tratto. */
export type FetchLegs = (points: LatLng[]) => Promise<LatLng[][]>;

export type SnapCache = {
  getMany: (keys: string[]) => Promise<Array<LatLng[] | null>>;
  setMany: (entries: Array<[string, LatLng[]]>) => Promise<void>;
};

const toLatLng = (p: LatLng) => ({ location: { latLng: { latitude: p[0], longitude: p[1] } } });

/** Google Routes API, auto, tappe intermedie (una leg per tratto). */
export const fetchLegsFromGoogle: FetchLegs = async (points) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new SnapError("SNAP_UNAVAILABLE", "Aggancio alle strade non configurato.");
  let res: Response;
  try {
    res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.legs.polyline.geoJsonLinestring",
      },
      body: JSON.stringify({
        origin: toLatLng(points[0]),
        destination: toLatLng(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(toLatLng),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        polylineQuality: "HIGH_QUALITY",
        polylineEncoding: "GEO_JSON_LINESTRING",
        languageCode: "it",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(SNAP_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new SnapError("SNAP_UNAVAILABLE", "Il servizio delle strade non risponde: riprova tra poco.");
  }
  const data = (await res.json().catch(() => null)) as {
    routes?: Array<{ legs?: Array<{ polyline?: { geoJsonLinestring?: { coordinates?: number[][] } } }> }>;
  } | null;
  if (!res.ok) throw new SnapError("SNAP_UNAVAILABLE", "Il servizio delle strade non risponde: riprova tra poco.");
  const legs = data?.routes?.[0]?.legs;
  if (!legs || legs.length !== points.length - 1) {
    throw new SnapError("NO_ROUTE", "Fra questi punti non c'è una strada percorribile in auto: sposta un punto.");
  }
  return legs.map((leg, i) => {
    const coords = leg.polyline?.geoJsonLinestring?.coordinates ?? [];
    const line = coords.map(([lng, lat]) => [lat, lng] as LatLng);
    // Tratto degenere (due punti quasi sovrapposti): resta il segmento dritto.
    return line.length >= 2 ? line : [points[i], points[i + 1]];
  });
};

/** Cache Redis dei tratti; senza Redis (dev senza env) si calcola sempre. */
export const redisSnapCache: SnapCache = {
  async getMany(keys) {
    const redis = getRedis();
    if (!redis || !keys.length) return keys.map(() => null);
    try {
      const rows = await redis.mget<Array<LatLng[] | null>>(...keys);
      return rows.map((r) => (Array.isArray(r) ? r : null));
    } catch {
      return keys.map(() => null);
    }
  },
  async setMany(entries) {
    const redis = getRedis();
    if (!redis || !entries.length) return;
    try {
      const pipe = redis.pipeline();
      for (const [k, v] of entries) pipe.set(k, v, { ex: SNAP_CACHE_TTL_S });
      await pipe.exec();
    } catch {
      // La cache è un risparmio, non un requisito.
    }
  },
};

export type SnapResult = {
  /** Una linea per tratto (waypoint i → i+1), semplificata a ~10 m. */
  segments: LatLng[][];
  /** I tratti uniti, semplificati: è la `path` da salvare. */
  path: LatLng[];
  lengthMeters: number;
  /** Tratti presi dalla cache / richieste fatte a Google (per i log e i test). */
  cachedSegments: number;
  requests: number;
};

export async function snapWaypoints(
  waypoints: LatLng[],
  deps: { fetchLegs?: FetchLegs; cache?: SnapCache } = {},
): Promise<SnapResult> {
  const fetchLegs = deps.fetchLegs ?? fetchLegsFromGoogle;
  const cache = deps.cache ?? redisSnapCache;
  const n = waypoints.length - 1;
  const keys = Array.from({ length: n }, (_, i) => segmentKey(waypoints[i], waypoints[i + 1]));
  const segments: Array<LatLng[] | null> = await cache.getMany(keys);
  const cachedSegments = segments.filter(Boolean).length;

  const missing = segments.flatMap((s, i) => (s ? [] : [i]));
  const runs = planSnapRuns(missing);
  const fresh: Array<[string, LatLng[]]> = [];
  await Promise.all(
    runs.map(async (run) => {
      const legs = await fetchLegs(waypoints.slice(run.from, run.from + run.legs + 1));
      legs.forEach((line, j) => {
        const i = run.from + j;
        const simple = simplifyPath(line);
        segments[i] = simple;
        fresh.push([keys[i], simple]);
      });
    }),
  );
  await cache.setMany(fresh);

  const done = segments as LatLng[][];
  const path = simplifyPath(joinSegments(done));
  return { segments: done, path, lengthMeters: pathLengthMeters(path), cachedSegments, requests: runs.length };
}

/**
 * Scorciatoia da una guida Road: dal tracciato GPS di un tratto ricava i punti
 * da riaprire nell'editor (al massimo `max`, sempre partenza e arrivo),
 * semplificando con tolleranza crescente finché ci stanno.
 */
export function waypointsFromTrack(track: LatLng[], max: number): LatLng[] {
  if (track.length <= 2) return track.slice();
  let tolerance = 50;
  let out = simplifyPath(track, tolerance);
  while (out.length > max) {
    tolerance *= 1.5;
    out = simplifyPath(track, tolerance);
  }
  return out;
}
