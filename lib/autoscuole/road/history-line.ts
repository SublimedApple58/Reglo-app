import { simplifyPath, type LatLng } from "@/lib/autoscuole/road/exam-routes";

/**
 * Tasto «Storico» della guida dal vivo (Ricca, punti 8+9): le ultime tracce
 * dell'allievo disegnate tenui sotto quella in corso. Basta la forma: la
 * traccia pulita (migliaia di punti) si sfoltisce con Douglas-Peucker a pochi
 * metri e, se resta lunga, si campiona a `HISTORY_LINE_MAX` punti.
 */
export const HISTORY_SESSIONS = 5;
export const HISTORY_LINE_MAX = 400;
const HISTORY_SIMPLIFY_M = 4;

export function historyLine(path: Array<[number, number, ...unknown[]]>, max = HISTORY_LINE_MAX): LatLng[] {
  const simple = simplifyPath(path.map((p) => [p[0], p[1]] as LatLng), HISTORY_SIMPLIFY_M);
  if (simple.length <= max) return simple;
  const step = (simple.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => simple[Math.round(i * step)]);
}
