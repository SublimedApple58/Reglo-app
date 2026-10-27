/**
 * REG-638 Reglo Road — catalogo delle segnalazioni.
 *
 * La lista base è uguale per tutte le autoscuole e vive qui (le chiavi sono
 * contratto con la mobile: ogni chiave ha il suo simbolo 3D lato app/web).
 * Le voci personalizzate stanno in `limits.roadCustomMarkers` e diventano
 * `kind = "custom:<id>"`.
 */

export const ROAD_BASE_MARKERS = [
  { key: "stop", label: "Stop" },
  { key: "precedenza", label: "Precedenza" },
  { key: "distanza", label: "Distanza di sicurezza" },
  { key: "velocita", label: "Velocità" },
  { key: "semaforo", label: "Semaforo" },
  { key: "rotonda", label: "Rotonda" },
  { key: "svolta", label: "Svolta" },
  { key: "corsia", label: "Posizione in corsia" },
  { key: "pedoni", label: "Pedoni" },
  { key: "specchietti", label: "Specchietti" },
  { key: "parcheggio", label: "Parcheggio" },
  { key: "altro", label: "Altro" },
] as const;

export type RoadBaseMarkerKey = (typeof ROAD_BASE_MARKERS)[number]["key"];
export type RoadCustomMarker = { id: string; label: string };

export const ROAD_CUSTOM_MARKERS_MAX = 12;
export const ROAD_CUSTOM_MARKER_LABEL_MAX = 40;
export const CUSTOM_KIND_PREFIX = "custom:";

const BASE_KEYS = new Set<string>(ROAD_BASE_MARKERS.map((m) => m.key));

export function parseRoadCustomMarkers(raw: unknown): RoadCustomMarker[] {
  if (!Array.isArray(raw)) return [];
  const out: RoadCustomMarker[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, label } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) continue;
    if (typeof label !== "string" || !label.trim()) continue;
    out.push({ id: id.trim(), label: label.trim().slice(0, ROAD_CUSTOM_MARKER_LABEL_MAX) });
    if (out.length >= ROAD_CUSTOM_MARKERS_MAX) break;
  }
  return out;
}

/**
 * Risolve kind → etichetta. Una voce custom rimossa nel frattempo resta valida
 * se il client manda la propria etichetta (es. coda offline): lo storico vince.
 */
export function resolveMarkerLabel(
  kind: string,
  custom: RoadCustomMarker[],
  fallbackLabel?: string | null,
): string | null {
  if (BASE_KEYS.has(kind)) {
    return ROAD_BASE_MARKERS.find((m) => m.key === kind)!.label;
  }
  if (kind.startsWith(CUSTOM_KIND_PREFIX)) {
    const id = kind.slice(CUSTOM_KIND_PREFIX.length);
    const found = custom.find((c) => c.id === id);
    if (found) return found.label;
    const fb = fallbackLabel?.trim();
    return fb ? fb.slice(0, ROAD_CUSTOM_MARKER_LABEL_MAX) : null;
  }
  return null;
}

/** Segno di una segnalazione: fatto bene / da migliorare. Null = neutra (storico). */
export type RoadMarkerSentiment = "good" | "bad";
export function normalizeSentiment(v: unknown): RoadMarkerSentiment | null {
  return v === "good" || v === "bad" ? v : null;
}
