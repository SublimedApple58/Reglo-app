/**
 * REG-722 Reglo Road — le strade di OpenStreetMap a celle.
 *
 * L'Italia è divisa in celle fisse (0,05° di latitudine × 0,07° di longitudine,
 * circa 5,5 × 5,7 km). Ogni cella è un file binario compatto con le strade
 * percorribili in auto che la toccano (una strada che attraversa più celle sta
 * intera in ognuna; il telefono la riconosce dall'id e la tiene una volta sola).
 *
 * Formato (tutto varint, gli interi con segno in zigzag):
 *   "RGC1" | n strade | per strada: id, flags, layer, n punti, punti
 *   flags: bit 0-3 tipo (ROAD_KINDS), bit 4-5 senso unico (1 avanti, 2 indietro),
 *          bit 6 ponte o galleria
 *   punti: microgradi dall'angolo della cella, il primo assoluto, poi le differenze.
 * Due strade che si incrociano condividono il nodo OSM, quindi le stesse
 * coordinate: il grafo si ricostruisce da lì.
 *
 * Questo file è puro (niente Node, niente rete): lo usano il server, la web e,
 * copiato, la mobile (`reglo-mobile/src/road/osmCells.ts`).
 */

export const OSM_CELLS_VERSION = 1;
export const CELL_LAT = 0.05;
export const CELL_LNG = 0.07;

export const ROAD_KINDS = [
  "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
  "living_street", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link", "service",
] as const;
export type RoadKind = (typeof ROAD_KINDS)[number];

export type OsmWay = {
  id: number;
  kind: RoadKind;
  /** 1 = solo nel verso dei punti, -1 = solo al contrario, 0 = doppio senso. */
  oneway: 0 | 1 | -1;
  layer: number;
  bridgeOrTunnel: boolean;
  /** [lat, lng, lat, lng, …] in gradi. */
  pts: number[];
};

const MAGIC = [0x52, 0x47, 0x43, 0x31]; // "RGC1"

export function cellIndex(lat: number, lng: number): { ix: number; iy: number } {
  return { ix: Math.floor(lng / CELL_LNG), iy: Math.floor(lat / CELL_LAT) };
}

export function cellKey(ix: number, iy: number): string {
  return `${iy}_${ix}`;
}

export function cellOrigin(ix: number, iy: number): { lat: number; lng: number } {
  return { lat: iy * CELL_LAT, lng: ix * CELL_LNG };
}

/** Le celle che toccano un riquadro. */
export function cellsForBox(south: number, west: number, north: number, east: number): string[] {
  const a = cellIndex(south, west);
  const b = cellIndex(north, east);
  const out: string[] = [];
  for (let iy = a.iy; iy <= b.iy; iy++) for (let ix = a.ix; ix <= b.ix; ix++) out.push(cellKey(ix, iy));
  return out;
}

/** Le celle entro `radiusM` metri da un punto (riquadro che contiene il cerchio). */
export function cellsAround(lat: number, lng: number, radiusM: number): string[] {
  const dLat = radiusM / 110_574;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return cellsForBox(lat - dLat, lng - dLng, lat + dLat, lng + dLng);
}

/** Le celle sotto una traccia, con un margine (per l'aggancio a fine guida). */
export function cellsForTrack(points: Array<{ 0: number; 1: number }>, marginM = 300): string[] {
  if (!points.length) return [];
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const p of points) {
    s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]);
  }
  const dLat = marginM / 110_574;
  const dLng = marginM / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return cellsForBox(s - dLat, w - dLng, n + dLat, e + dLng);
}

/** Tag OSM → senso unico, come li legge un'auto. */
export function onewayFromTags(tags: Record<string, string | undefined>): 0 | 1 | -1 {
  const ow = tags.oneway;
  if (ow === "-1") return -1;
  if (ow === "yes" || ow === "1" || ow === "true") return 1;
  if (ow === "no") return 0;
  if (tags.junction === "roundabout" || tags.junction === "circular") return 1;
  if (tags.highway === "motorway" || tags.highway === "motorway_link") return 1;
  return 0;
}

// ---------- codifica ----------

function writeVarint(out: number[], n: number) {
  // n < 2^53, mai negativo
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}
const zigzag = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzigzag = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

export function encodeCell(ix: number, iy: number, ways: OsmWay[]): Uint8Array {
  const o = cellOrigin(ix, iy);
  const oy = Math.round(o.lat * 1e6);
  const ox = Math.round(o.lng * 1e6);
  const out: number[] = [...MAGIC];
  writeVarint(out, ways.length);
  for (const w of ways) {
    const kind = Math.max(0, ROAD_KINDS.indexOf(w.kind));
    const ow = w.oneway === 1 ? 1 : w.oneway === -1 ? 2 : 0;
    writeVarint(out, w.id);
    writeVarint(out, kind | (ow << 4) | (w.bridgeOrTunnel ? 1 << 6 : 0));
    writeVarint(out, zigzag(w.layer | 0));
    const n = w.pts.length / 2;
    writeVarint(out, n);
    let py = oy, px = ox;
    for (let k = 0; k < n; k++) {
      const y = Math.round(w.pts[2 * k] * 1e6);
      const x = Math.round(w.pts[2 * k + 1] * 1e6);
      writeVarint(out, zigzag(y - py));
      writeVarint(out, zigzag(x - px));
      py = y; px = x;
    }
  }
  return Uint8Array.from(out);
}

export function decodeCell(key: string, bytes: Uint8Array): OsmWay[] {
  const [iy, ix] = key.split("_").map(Number);
  const o = cellOrigin(ix, iy);
  for (let k = 0; k < 4; k++) if (bytes[k] !== MAGIC[k]) throw new Error("Cella OSM non valida");
  let i = 4;
  const read = () => {
    let n = 0, mul = 1, b: number;
    do {
      b = bytes[i++];
      if (b === undefined) throw new Error("Cella OSM troncata");
      n += (b & 0x7f) * mul;
      mul *= 0x80;
    } while (b & 0x80);
    return n;
  };
  const count = read();
  const ways: OsmWay[] = [];
  for (let w = 0; w < count; w++) {
    const id = read();
    const flags = read();
    const layer = unzigzag(read());
    const n = read();
    const pts = new Array<number>(n * 2);
    let y = Math.round(o.lat * 1e6), x = Math.round(o.lng * 1e6);
    for (let k = 0; k < n; k++) {
      y += unzigzag(read());
      x += unzigzag(read());
      pts[2 * k] = y / 1e6;
      pts[2 * k + 1] = x / 1e6;
    }
    const ow = (flags >> 4) & 3;
    ways.push({
      id,
      kind: ROAD_KINDS[flags & 15] ?? "service",
      oneway: ow === 1 ? 1 : ow === 2 ? -1 : 0,
      layer,
      bridgeOrTunnel: Boolean(flags & 64),
      pts,
    });
  }
  return ways;
}
