/**
 * REG-638 Reglo Road — simboli 3D delle segnalazioni (web).
 *
 * Una chiave base (`ROAD_BASE_MARKERS` in `catalog.ts`) → un'immagine in
 * `public/images/road/`. Le voci personalizzate (`custom:<id>`) usano tutte la
 * puntina `f-cus`. Stesse immagini e stessa mappa della mobile.
 */
import { CUSTOM_KIND_PREFIX, ROAD_BASE_MARKERS, type RoadBaseMarkerKey } from "@/lib/autoscuole/road/catalog";
import { DEFAULT_CAR_COLOR, isCarColorKey } from "@/lib/autoscuole/road/car-colors";

const ROAD_IMG = "/images/road";

const BASE_SYMBOL_FILE: Record<RoadBaseMarkerKey, string> = {
  stop: "s-stop",
  precedenza: "s-prec",
  distanza: "s-dist",
  velocita: "f-vel",
  semaforo: "f-sem",
  rotonda: "f-rot",
  svolta: "f-svo",
  corsia: "f-cor",
  pedoni: "f-ped",
  specchietti: "f-spe",
  parcheggio: "f-par",
  altro: "f-alt",
};

/** Etichetta corta per la griglia delle impostazioni (il catalogo ha quelle lunghe). */
const BASE_SHORT_LABEL: Partial<Record<RoadBaseMarkerKey, string>> = {
  distanza: "Distanza",
  corsia: "Corsia",
};

export const CUSTOM_MARKER_SYMBOL = `${ROAD_IMG}/f-cus.png`;

/** Percorso pubblico del simbolo di una segnalazione (`kind` base o `custom:<id>`). */
export function roadMarkerSymbol(kind: string): string {
  if (kind.startsWith(CUSTOM_KIND_PREFIX)) return CUSTOM_MARKER_SYMBOL;
  const file = BASE_SYMBOL_FILE[kind as RoadBaseMarkerKey] ?? "f-alt";
  return `${ROAD_IMG}/${file}.png`;
}

export const ROAD_BASE_SYMBOLS = ROAD_BASE_MARKERS.map((m) => ({
  key: m.key,
  label: m.label,
  shortLabel: BASE_SHORT_LABEL[m.key] ?? m.label,
  src: roadMarkerSymbol(m.key),
}));

export const ROAD_IMAGES = {
  base: `${ROAD_IMG}/sede.png`,
} as const;

/** Auto 3D nella variante colore del veicolo (vista dall'alto e 3/4). */
export function roadCarImages(color: string | null | undefined) {
  const key = isCarColorKey(color) ? color : DEFAULT_CAR_COLOR;
  return { top: `${ROAD_IMG}/cars/auto-su-${key}.png`, threeQuarter: `${ROAD_IMG}/cars/auto-34-${key}.png` };
}
