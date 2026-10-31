/**
 * REG-638 Reglo Road — geometria del percorso.
 *
 * Punto compatto: [tMs, lat, lng, speedMs|null, heading|null, accuracyM|null].
 */

export type RoadPoint = [number, number, number, number | null, number | null, number | null];

/** Oltre questa incertezza il fix GPS non entra nel calcolo dei km. */
const MAX_ACCURACY_M = 50;
/** Salti impossibili per un'auto in città (≈ 180 km/h) = rumore GPS. */
const MAX_SPEED_MS = 50;

const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => (isNum(v) ? v : null);

/** Valida e normalizza un lotto in arrivo dal telefono (scarta i punti malformati). */
export function sanitizePoints(raw: unknown): RoadPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: RoadPoint[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length < 3) continue;
    const [t, lat, lng, speed, heading, acc] = p;
    if (!isNum(t) || !isNum(lat) || !isNum(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push([
      Math.round(t),
      Math.round(lat * 1e6) / 1e6,
      Math.round(lng * 1e6) / 1e6,
      numOrNull(speed),
      numOrNull(heading),
      numOrNull(acc),
    ]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

const usable = (p: RoadPoint) => p[5] == null || p[5] <= MAX_ACCURACY_M;

/**
 * Metri percorsi lungo i punti, partendo eventualmente da un punto precedente
 * (l'ultimo del lotto prima). Ignora fix imprecisi e salti impossibili.
 */
/** Salti impossibili di fila prima di ripartire dal punto nuovo. */
const MAX_SPIKES = 3;

export function trackDistanceMeters(points: RoadPoint[], prev?: RoadPoint | null): number {
  let total = 0;
  let last = prev && usable(prev) ? prev : null;
  let spikes = 0;
  for (const p of points) {
    if (!usable(p)) continue;
    if (last) {
      const d = haversineMeters(last[1], last[2], p[1], p[2]);
      const dt = Math.max(1, (p[0] - last[0]) / 1000);
      if (d / dt <= MAX_SPEED_MS) {
        total += d;
        spikes = 0;
      } else if (++spikes < MAX_SPIKES) {
        continue; // salto isolato: tieni il punto buono precedente
      } else {
        // REG-691: salti di fila = era sbagliato il punto di riferimento
        // (primo fix vecchio di chilometri): si riparte da qui, senza il salto.
        spikes = 0;
      }
    }
    last = p;
  }
  return total;
}

/**
 * Secondi «di guida» di una sessione Road: dall'inizio della guida se in Road si
 * è entrati dopo (es. invito accettato a guida già partita), altrimenti
 * dall'ingresso in Road. Fino a `end` (chiusura, o adesso se ancora attiva).
 */
export function drivingSeconds(startedAt: Date, end: Date, lessonStartsAt?: Date | null): number {
  const from = lessonStartsAt && lessonStartsAt < startedAt ? lessonStartsAt : startedAt;
  return Math.max(0, Math.round((end.getTime() - from.getTime()) / 1000));
}

/**
 * Road libero: fine reale di una guida nata da Road. Arrotondata per eccesso ai
 * 5 minuti, almeno 5 minuti dopo l'inizio, mai oltre la fine prenotata.
 */
export function freeLessonEnd(startsAt: Date, bookedEnd: Date, endedAt: Date): Date {
  const step = 5 * 60 * 1000;
  const rounded = Math.ceil(endedAt.getTime() / step) * step;
  return new Date(Math.min(bookedEnd.getTime(), Math.max(rounded, startsAt.getTime() + step)));
}
