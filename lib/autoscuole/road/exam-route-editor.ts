import { haversineMeters } from "@/lib/autoscuole/road/geo";
import { EXAM_ROUTE_MAX_WAYPOINTS, joinSegments, pathLengthMeters, type LatLng } from "@/lib/autoscuole/road/exam-routes";

/**
 * REG-645 Reglo Road — logica pura dell'editor web dei percorsi d'esame.
 *
 * L'editor tiene in memoria i tratti già agganciati alle strade, uno per ogni
 * coppia di punti consecutivi (chiave = le due coordinate). Quando il titolare
 * lascia un punto, ne aggiunge o ne toglie uno, mancano solo i tratti che lo
 * toccano: si chiede al backend (`/road/exam-routes/snap`) solo quel pezzo di
 * percorso, mai tutto. Durante il trascinamento i tratti toccati si disegnano
 * dritti e tratteggiati, senza chiamare nessuno.
 */

export const legKey = (a: LatLng, b: LatLng) =>
  `${a[0].toFixed(6)},${a[1].toFixed(6)}>${b[0].toFixed(6)},${b[1].toFixed(6)}`;

/** Massimo di tratti per richiesta: il backend accetta fino a 25 punti. */
export const EDITOR_MAX_LEGS_PER_REQUEST = EXAM_ROUTE_MAX_WAYPOINTS - 1;

/**
 * Tratti mancanti raggruppati in pezzi consecutivi: ognuno diventa UNA
 * richiesta con i punti `waypoints.slice(from, from + legs + 1)`.
 */
export function missingLegRuns(
  waypoints: LatLng[],
  has: (key: string) => boolean,
  maxLegs = EDITOR_MAX_LEGS_PER_REQUEST,
): Array<{ from: number; legs: number }> {
  const runs: Array<{ from: number; legs: number }> = [];
  for (let i = 0; i + 1 < waypoints.length; i++) {
    if (has(legKey(waypoints[i], waypoints[i + 1]))) continue;
    const last = runs[runs.length - 1];
    if (last && last.from + last.legs === i && last.legs < maxLegs) last.legs++;
    else runs.push({ from: i, legs: 1 });
  }
  return runs;
}

/** Per ogni tratto: la linea agganciata se c'è, altrimenti null (si disegna dritto). */
export function legsFor(waypoints: LatLng[], get: (key: string) => LatLng[] | undefined): Array<LatLng[] | null> {
  const out: Array<LatLng[] | null> = [];
  for (let i = 0; i + 1 < waypoints.length; i++) out.push(get(legKey(waypoints[i], waypoints[i + 1])) ?? null);
  return out;
}

/** La linea completa solo se tutti i tratti sono agganciati, altrimenti null. */
export function joinedPath(legs: Array<LatLng[] | null>): LatLng[] | null {
  if (!legs.length || legs.some((l) => !l)) return null;
  return joinSegments(legs as LatLng[][]);
}

/** Lunghezza mostrata: tratti agganciati veri, gli altri in linea d'aria. */
export function editorLengthMeters(waypoints: LatLng[], legs: Array<LatLng[] | null>) {
  let total = 0;
  legs.forEach((leg, i) => {
    if (leg) total += pathLengthMeters(leg);
    else total += haversineMeters(waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]);
  });
  return Math.round(total);
}

/** Indice del punto della linea più vicino a `p`, cercando da `from` in avanti. */
export function nearestIndex(path: LatLng[], p: LatLng, from = 0) {
  let best = -1;
  let bestD = Infinity;
  for (let i = from; i < path.length; i++) {
    const d = haversineMeters(path[i][0], path[i][1], p[0], p[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, meters: bestD };
}

/**
 * Riaprendo un percorso salvato: divide la linea in un tratto per ogni coppia
 * di punti, così spostare un punto ricalcola solo i suoi due tratti. Se un
 * punto è lontano dalla linea (oltre `maxOffM`) non si divide: i tratti
 * verranno chiesti al backend alla prima modifica.
 */
export function splitPathAtWaypoints(path: LatLng[], waypoints: LatLng[], maxOffM = 60): LatLng[][] | null {
  if (path.length < 2 || waypoints.length < 2) return null;
  const idx: number[] = [];
  let from = 0;
  for (const w of waypoints) {
    const { index, meters } = nearestIndex(path, w, from);
    if (index < 0 || meters > maxOffM) return null;
    idx.push(index);
    from = index;
  }
  idx[0] = 0;
  idx[idx.length - 1] = path.length - 1;
  const legs: LatLng[][] = [];
  for (let i = 0; i + 1 < idx.length; i++) {
    if (idx[i + 1] < idx[i]) return null;
    const leg = path.slice(idx[i], idx[i + 1] + 1);
    legs.push(leg.length >= 2 ? leg : [path[idx[i]], path[idx[i + 1]]]);
  }
  return legs;
}
