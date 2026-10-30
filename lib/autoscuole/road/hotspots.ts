import { haversineMeters } from "@/lib/autoscuole/road/geo";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import { ROAD_RETENTION_MONTHS } from "@/lib/autoscuole/road/maintenance";

/**
 * REG-643 Reglo Road — punti critici: dove gli allievi sbagliano più spesso.
 * Logica pura (nessun DB): il service carica le segnalazioni «da migliorare» e
 * i percorsi d'esame, qui si raggruppano.
 *
 * - Un punto critico = segnalazioni dello stesso tipo entro ~60 m l'una dal
 *   centro del gruppo. La via NON divide i gruppi: a un incrocio la stessa
 *   manovra viene registrata ora su una via ora sull'altra (e la segnalazione
 *   arriva con qualche secondo di ritardo); la via più frequente dà il nome.
 * - Soglia fissa: almeno 3 errori da almeno 2 allievi diversi (niente casi
 *   isolati, nessun punto che parli di un allievo solo).
 * - «Sul percorso d'esame»: il centro dista meno di 50 m da un percorso attivo.
 */

export const HOTSPOT_RADIUS_M = 60;
export const HOTSPOT_MIN_ERRORS = 3;
export const HOTSPOT_MIN_STUDENTS = 2;
export const HOTSPOT_EXAM_ROUTE_M = 50;

export type HotspotMarker = {
  id: string;
  sessionId: string;
  studentId: string | null;
  kind: string;
  label: string;
  lat: number;
  lng: number;
  street: string | null;
  recordedAt: Date;
  /** REG-677: la nota dell'istruttore (letta solo per i punti dell'allievo). */
  note?: string | null;
};

export type HotspotExamRoute = { id: string; name: string; path: LatLng[] };

export type Hotspot = {
  /** Chiave stabile: tipo + centro arrotondato (~10 m). Serve al dettaglio. */
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

type Cluster = { kind: string; lat: number; lng: number; markers: HotspotMarker[] };

export const hotspotKey = (kind: string, lat: number, lng: number) =>
  `${kind}~${lat.toFixed(4)}~${lng.toFixed(4)}`;

export function parseHotspotKey(key: string): { kind: string; lat: number; lng: number } | null {
  const parts = key.split("~");
  if (parts.length !== 3 || !parts[0]) return null;
  const lat = Number(parts[1]);
  const lng = Number(parts[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { kind: parts[0], lat, lng };
}

/**
 * Raggruppamento goloso e deterministico: segnalazioni in ordine di tempo (poi
 * id), ognuna va nel gruppo dello stesso tipo col centro più vicino entro il
 * raggio, altrimenti ne apre uno nuovo; il centro è la media dei punti.
 */
export function clusterMarkers(markers: HotspotMarker[], radiusM = HOTSPOT_RADIUS_M): Cluster[] {
  const sorted = [...markers].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id.localeCompare(b.id),
  );
  const byKind = new Map<string, Cluster[]>();
  for (const m of sorted) {
    const list = byKind.get(m.kind) ?? [];
    byKind.set(m.kind, list);
    let best: Cluster | null = null;
    let bestD = Infinity;
    for (const c of list) {
      const d = haversineMeters(c.lat, c.lng, m.lat, m.lng);
      if (d <= radiusM && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      const n = best.markers.length;
      best.lat = (best.lat * n + m.lat) / (n + 1);
      best.lng = (best.lng * n + m.lng) / (n + 1);
      best.markers.push(m);
    } else {
      list.push({ kind: m.kind, lat: m.lat, lng: m.lng, markers: [m] });
    }
  }
  return [...byKind.values()].flat();
}

/** Distanza in metri fra un punto e una linea (proiezione locale, va bene in città). */
export function distanceToPathMeters(lat: number, lng: number, path: LatLng[]): number {
  if (!path.length) return Infinity;
  if (path.length === 1) return haversineMeters(lat, lng, path[0][0], path[0][1]);
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1][1] - lng) * mLng;
    const ay = (path[i - 1][0] - lat) * mLat;
    const bx = (path[i][1] - lng) * mLng;
    const by = (path[i][0] - lat) * mLat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

function mostFrequent(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

export type HotspotWithMarkers = Hotspot & { markers: HotspotMarker[] };

export function buildHotspotsWithMarkers(
  markers: HotspotMarker[],
  examRoutes: HotspotExamRoute[] = [],
): HotspotWithMarkers[] {
  const out: HotspotWithMarkers[] = [];
  for (const c of clusterMarkers(markers)) {
    const students = new Set(c.markers.map((m) => m.studentId).filter(Boolean));
    if (c.markers.length < HOTSPOT_MIN_ERRORS || students.size < HOTSPOT_MIN_STUDENTS) continue;
    const last = c.markers[c.markers.length - 1];
    out.push({
      key: hotspotKey(c.kind, c.lat, c.lng),
      kind: c.kind,
      label: last.label,
      lat: Number(c.lat.toFixed(6)),
      lng: Number(c.lng.toFixed(6)),
      street: mostFrequent(c.markers.map((m) => m.street)),
      errors: c.markers.length,
      students: students.size,
      sessions: new Set(c.markers.map((m) => m.sessionId)).size,
      lastAt: last.recordedAt.toISOString(),
      examRoutes: examRoutes
        .filter((r) => distanceToPathMeters(c.lat, c.lng, r.path) <= HOTSPOT_EXAM_ROUTE_M)
        .map((r) => ({ id: r.id, name: r.name })),
      markers: c.markers,
    });
  }
  // Prima i più frequenti; a pari errori, più allievi, poi il più recente.
  return out.sort((a, b) => b.errors - a.errors || b.students - a.students || b.lastAt.localeCompare(a.lastAt));
}

export function buildHotspots(markers: HotspotMarker[], examRoutes: HotspotExamRoute[] = []): Hotspot[] {
  return buildHotspotsWithMarkers(markers, examRoutes).map(({ markers: _m, ...h }) => h);
}

/** Il punto della lista che corrisponde a una chiave (stesso tipo, centro entro il raggio). */
export function findHotspot<T extends Hotspot>(hotspots: T[], key: string): T | null {
  const k = parseHotspotKey(key);
  if (!k) return null;
  const exact = hotspots.find((h) => h.key === key);
  if (exact) return exact;
  let best: T | null = null;
  let bestD = HOTSPOT_RADIUS_M;
  for (const h of hotspots) {
    if (h.kind !== k.kind) continue;
    const d = haversineMeters(h.lat, h.lng, k.lat, k.lng);
    if (d <= bestD) [best, bestD] = [h, d];
  }
  return best;
}

// ─── Filtri delle API ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HotspotFilters = {
  from?: string | null;
  to?: string | null;
  instructorId?: string | null;
  license?: string | null;
  kind?: string | null;
};

export type CleanHotspotFilters = { from: Date; to: Date; instructorId: string | null; license: string | null; kind: string | null };

/** Il periodo non va mai oltre la conservazione (12 mesi): prima non c'è niente. */
function retentionStart(now: Date) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - ROAD_RETENTION_MONTHS);
  return d;
}

export function parseHotspotFilters(input: HotspotFilters, now = new Date()): { ok: true; value: CleanHotspotFilters } | { ok: false; message: string } {
  const date = (v: string | null | undefined) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const from = date(input.from);
  const to = date(input.to);
  if (from === undefined || to === undefined) return { ok: false, message: "Periodo non valido." };
  const floor = retentionStart(now);
  const f = from && from > floor ? from : floor;
  const t = to && to < now ? to : now;
  if (t <= f) return { ok: false, message: "Periodo non valido." };
  const instructorId = input.instructorId?.trim() || null;
  if (instructorId && !UUID_RE.test(instructorId)) return { ok: false, message: "Istruttore non valido." };
  const license = input.license?.trim().toUpperCase() || null;
  if (license && !/^[A-Z0-9]{1,4}$/.test(license)) return { ok: false, message: "Patente non valida." };
  const kind = input.kind?.trim() || null;
  if (kind && kind.length > 60) return { ok: false, message: "Tipo non valido." };
  return { ok: true, value: { from: f, to: t, instructorId, license, kind } };
}
