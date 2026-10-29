import { haversineMeters } from "@/lib/autoscuole/road/geo";

/**
 * REG-641 Reglo Road — percorsi d'esame dell'autoscuola: logica pura
 * (validazione, semplificazione, lunghezza). Nessun accesso al DB: il service
 * (`exam-routes-service.ts`) carica e salva.
 *
 * Un percorso ha due linee:
 * - `waypoints`: i punti messi dal titolare sulla mappa (per riaprire l'editor);
 * - `path`: la linea che segue le strade (aggancio, REG-642, o tracciato di una
 *   guida Road), salvata semplificata a ~10 m.
 * Coordinate sempre `[lat, lng]`.
 */

export type LatLng = [number, number];

export const EXAM_ROUTE_MAX_WAYPOINTS = 25;
/** Tetto della linea in arrivo (prima della semplificazione). */
export const EXAM_ROUTE_MAX_PATH_POINTS = 20000;
export const EXAM_ROUTE_NAME_MAX = 60;
export const EXAM_ROUTE_SITE_MAX = 80;
export const EXAM_ROUTE_MAX_CATEGORIES = 10;
/** Tolleranza della semplificazione: la linea salvata si scosta al massimo ~10 m. */
export const EXAM_ROUTE_SIMPLIFY_M = 10;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** `[[lat,lng],...]` valido (coordinate nel mondo, almeno `min` punti), altrimenti null. */
export function parseLatLngList(raw: unknown, opts: { min: number; max: number }): LatLng[] | null {
  if (!Array.isArray(raw) || raw.length < opts.min || raw.length > opts.max) return null;
  const out: LatLng[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const [lat, lng] = p;
    if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    out.push([lat, lng]);
  }
  return out;
}

/** Unisce i tratti in una linea sola, senza doppiare il punto di giunzione. */
export function joinSegments(segments: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const seg of segments) {
    for (const p of seg) {
      const prev = out[out.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
      out.push(p);
    }
  }
  return out;
}

export function pathLengthMeters(path: LatLng[]) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  return Math.round(total);
}

/**
 * Douglas-Peucker in metri (proiezione locale equirettangolare: in città
 * l'errore è trascurabile). Tiene sempre il primo e l'ultimo punto.
 */
export function simplifyPath(path: LatLng[], toleranceM = EXAM_ROUTE_SIMPLIFY_M): LatLng[] {
  if (path.length <= 2) return path.slice();
  const lat0 = (path[0][0] * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(lat0);
  const xy = path.map(([lat, lng]) => [lng * mPerDegLng, lat * mPerDegLat] as const);

  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let d: number;
      if (len2 === 0) {
        d = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return path.filter((_, i) => keep[i] === 1);
}

const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Patenti: «B», «A2», «AM»… maiuscole, senza doppioni. */
export function parseLicenseCategories(raw: unknown): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > EXAM_ROUTE_MAX_CATEGORIES) return null;
  const out = new Set<string>();
  for (const c of raw) {
    if (typeof c !== "string") return null;
    const v = c.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,4}$/.test(v)) return null;
    out.add(v);
  }
  return [...out];
}

export type ExamRouteFields = {
  name: string;
  examSite: string | null;
  licenseCategories: string[];
  waypoints: LatLng[];
  path: LatLng[];
  lengthMeters: number;
  sourceSessionId: string | null;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida il corpo di creazione (`partial: false`) o di modifica (`partial: true`,
 * solo i campi presenti). La linea viene sempre semplificata e la lunghezza
 * ricalcolata qui: il client non decide i numeri.
 */
export function parseExamRouteInput(
  raw: unknown,
  opts: { partial: boolean },
): Parsed<Partial<ExamRouteFields>> {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Dati mancanti." };
  const body = raw as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const out: Partial<ExamRouteFields> = {};

  if (!opts.partial || has("name")) {
    const name = cleanText(body.name, EXAM_ROUTE_NAME_MAX);
    if (!name) return { ok: false, message: "Dai un nome al percorso." };
    out.name = name;
  }
  if (has("examSite")) out.examSite = cleanText(body.examSite, EXAM_ROUTE_SITE_MAX) || null;
  if (has("licenseCategories")) {
    const cats = parseLicenseCategories(body.licenseCategories);
    if (!cats) return { ok: false, message: "Patenti non valide." };
    out.licenseCategories = cats;
  }
  if (!opts.partial || has("waypoints")) {
    const wp = parseLatLngList(body.waypoints, { min: 2, max: EXAM_ROUTE_MAX_WAYPOINTS });
    if (!wp) return { ok: false, message: `Servono da 2 a ${EXAM_ROUTE_MAX_WAYPOINTS} punti sulla mappa.` };
    out.waypoints = wp;
  }
  if (!opts.partial || has("path")) {
    const path = parseLatLngList(body.path, { min: 2, max: EXAM_ROUTE_MAX_PATH_POINTS });
    if (!path) return { ok: false, message: "Il percorso non segue ancora le strade: riprova." };
    out.path = simplifyPath(path);
    out.lengthMeters = pathLengthMeters(out.path);
  }
  if (has("sourceSessionId")) {
    const v = body.sourceSessionId;
    if (v != null && (typeof v !== "string" || !UUID_RE.test(v))) {
      return { ok: false, message: "Guida di origine non valida." };
    }
    out.sourceSessionId = (v as string | null) ?? null;
  }
  return { ok: true, value: out };
}
