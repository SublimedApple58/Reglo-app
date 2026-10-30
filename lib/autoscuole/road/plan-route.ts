import { getRedis } from "@/lib/cache/redis";
import { simplifyPath, type LatLng } from "@/lib/autoscuole/road/exam-routes";
import {
  legSteps,
  redisSnapCache,
  redisStepsCache,
  segmentKey,
  stepsKey,
  type GoogleLeg,
  type RoadStep,
  type SnapCache,
  type StepsCache,
} from "@/lib/autoscuole/road/snap";
import { applyStopOrder, optimizeWaypoints, type StoredPlanStop } from "@/lib/autoscuole/road/lesson-plan";

/**
 * REG-653 Reglo Road — l'ordine delle tappe del giro sulle strade vere.
 *
 * Una richiesta `computeRoutes` con `optimizeWaypointOrder` (partenza → tappe →
 * sede). È la tariffa più cara della Routes API, quindi:
 * - si chiede solo alla partenza (la mobile la chiede una volta per guida; nel
 *   riaggancio di REG-654 manda `optimize: false`);
 * - l'ordine va in cache Redis per gli stessi punti (90 giorni: dipende solo
 *   dalle strade);
 * - i tratti che la risposta porta comunque vanno nella cache per tratto di
 *   REG-642, così la linea che segue non rifà richieste. Si salvano solo quelli
 *   che partono da un punto vero: l'uscita da un percorso d'esame è la sua fine,
 *   non l'inizio dato a Google. Dal REG-676 la stessa risposta porta anche le
 *   svolte di ogni tratto (cache `road:steps:v1:*`), così la linea con le
 *   svolte che segue non rifà richieste.
 * Qualunque errore = l'ordine dato, mai un errore per la mobile.
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const OPTIMIZE_TIMEOUT_MS = 10_000;
const ORDER_TTL_S = 60 * 60 * 24 * 90;
const ORDER_PREFIX = "road:order:v1:";

const coord = ([lat, lng]: LatLng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
export const orderKey = (points: LatLng[]) => `${ORDER_PREFIX}${points.map(coord).join(">")}`;

export type OptimizeResult = {
  order: number[];
  legs: LatLng[][];
  /** REG-676: le svolte di ogni leg (assenti = non seminare la cache delle svolte). */
  steps?: RoadStep[][];
};
export type FetchOptimized = (points: LatLng[]) => Promise<OptimizeResult>;

const toWaypoint = (p: LatLng) => ({ location: { latLng: { latitude: p[0], longitude: p[1] } } });

export const fetchOptimizedFromGoogle: FetchOptimized = async (points) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Routes API non configurata");
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "routes.optimizedIntermediateWaypointIndex",
        "routes.legs.polyline.geoJsonLinestring",
        "routes.legs.steps.navigationInstruction",
        "routes.legs.steps.startLocation",
        "routes.legs.steps.distanceMeters",
      ].join(","),
    },
    body: JSON.stringify({
      origin: toWaypoint(points[0]),
      destination: toWaypoint(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(toWaypoint),
      optimizeWaypointOrder: true,
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "GEO_JSON_LINESTRING",
      languageCode: "it",
      units: "METRIC",
    }),
    signal: AbortSignal.timeout(OPTIMIZE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`computeRoutes ${res.status}`);
  const data = (await res.json().catch(() => null)) as {
    routes?: Array<{ optimizedIntermediateWaypointIndex?: number[]; legs?: GoogleLeg[] }>;
  } | null;
  const route = data?.routes?.[0];
  if (!route) throw new Error("computeRoutes senza percorso");
  const legs = (route.legs ?? []).map((leg) =>
    (leg.polyline?.geoJsonLinestring?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as LatLng),
  );
  return { order: route.optimizedIntermediateWaypointIndex ?? [], legs, steps: (route.legs ?? []).map(legSteps) };
};

function legSequence(start: LatLng, ordered: StoredPlanStop[], end: LatLng): Array<{ p: LatLng; exam: boolean }> {
  return [
    { p: start, exam: false },
    ...ordered.map((s) => ({ p: [s.lat, s.lng] as LatLng, exam: s.source === "exam" })),
    { p: end, exam: false },
  ];
}

/**
 * I tratti della risposta da mettere nella cache per tratto: la leg i va dal
 * punto i al punto i+1 della sequenza già ordinata, e vale solo se il punto di
 * partenza non è l'ingresso di un percorso d'esame.
 */
export function legsToCache(
  start: LatLng,
  ordered: StoredPlanStop[],
  end: LatLng,
  legs: LatLng[][],
): Array<[string, LatLng[]]> {
  const seq = legSequence(start, ordered, end);
  if (legs.length !== seq.length - 1) return [];
  return legs.flatMap((line, i) =>
    seq[i].exam || line.length < 2 ? [] : [[segmentKey(seq[i].p, seq[i + 1].p), simplifyPath(line)] as [string, LatLng[]]],
  );
}

/** REG-676: come `legsToCache`, per le svolte (stesse leg valide, stessa chiave per coordinate). */
export function stepsToCache(
  start: LatLng,
  ordered: StoredPlanStop[],
  end: LatLng,
  legs: LatLng[][],
  steps: RoadStep[][],
): Array<[string, RoadStep[]]> {
  const seq = legSequence(start, ordered, end);
  if (legs.length !== seq.length - 1 || steps.length !== legs.length) return [];
  return steps.flatMap((list, i) =>
    seq[i].exam || legs[i].length < 2 ? [] : [[stepsKey(seq[i].p, seq[i + 1].p), list] as [string, RoadStep[]]],
  );
}

export async function optimizeStopOrder(
  start: { lat: number; lng: number },
  stops: StoredPlanStop[],
  end: { lat: number; lng: number } | null,
  deps: { fetchOptimized?: FetchOptimized; snapCache?: SnapCache; stepsCache?: StepsCache } = {},
): Promise<{ stops: StoredPlanStop[]; optimized: boolean; requests: number }> {
  const points = optimizeWaypoints(start, stops, end);
  if (!points || !end) return { stops, optimized: false, requests: 0 };
  const redis = getRedis();
  const key = orderKey(points);
  if (redis) {
    const hit = await redis.get<number[]>(key).catch(() => null);
    if (hit) {
      const ordered = applyStopOrder(stops, hit);
      if (ordered !== stops) return { stops: ordered, optimized: true, requests: 0 };
    }
  }
  try {
    const { order, legs, steps } = await (deps.fetchOptimized ?? fetchOptimizedFromGoogle)(points);
    // `applyStopOrder` ridà lo stesso array solo se l'ordine non è valido.
    const ordered = applyStopOrder(stops, order);
    if (ordered === stops) return { stops, optimized: false, requests: 1 };
    if (redis) await redis.set(key, order, { ex: ORDER_TTL_S }).catch(() => undefined);
    const from: LatLng = [start.lat, start.lng];
    const to: LatLng = [end.lat, end.lng];
    await (deps.snapCache ?? redisSnapCache).setMany(legsToCache(from, ordered, to, legs));
    if (steps) await (deps.stepsCache ?? redisStepsCache).setMany(stepsToCache(from, ordered, to, legs, steps));
    return { stops: ordered, optimized: true, requests: 1 };
  } catch (error) {
    console.warn("[road/plan/route] ordine non ottimizzato", error instanceof Error ? error.message : error);
    return { stops, optimized: false, requests: 1 };
  }
}
