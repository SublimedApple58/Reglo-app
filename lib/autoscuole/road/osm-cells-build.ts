import {
  CELL_LAT,
  CELL_LNG,
  OSM_CELLS_VERSION,
  ROAD_KINDS,
  cellKey,
  encodeCell,
  onewayFromTags,
  type OsmWay,
  type RoadKind,
} from "@/lib/autoscuole/road/osm-cells";

/**
 * REG-722 — preparazione delle celle OSM (script a mano e job mensile).
 * Puro: riceve strade già lette (Overpass o `osmium export`), restituisce i
 * file delle celle.
 */

export const OSM_CELLS_PREFIX = `road/osm/v${OSM_CELLS_VERSION}`;
export const osmCellObjectKey = (key: string) => `${OSM_CELLS_PREFIX}/${key}.bin`;

export type OsmCellBlock = {
  /** Prima riga e prima colonna di celle del blocco. */
  by: number;
  bx: number;
  /** `ovest,sud,est,nord` per `osmium extract -b`. */
  bbox: string;
};

/**
 * I blocchi di `rows` × `cols` celle che coprono `box`, da sud a nord e da
 * ovest a est (l'ordine del job). Con `fromLat` si parte dalla fascia di
 * blocchi che contiene quella latitudine: un giro interrotto riparte da lì
 * senza buchi (le fasce restano allineate alla griglia del riquadro).
 */
export function osmCellBlocks(
  box: { south: number; west: number; north: number; east: number },
  rows: number,
  cols: number,
  fromLat?: number,
): OsmCellBlock[] {
  const iy0 = Math.floor(box.south / CELL_LAT), iy1 = Math.floor(box.north / CELL_LAT);
  const ix0 = Math.floor(box.west / CELL_LNG), ix1 = Math.floor(box.east / CELL_LNG);
  const fromIy = fromLat == null ? iy0 : Math.max(iy0, Math.floor(fromLat / CELL_LAT));
  const startBy = iy0 + Math.floor((fromIy - iy0) / rows) * rows;
  const out: OsmCellBlock[] = [];
  for (let by = startBy; by <= iy1; by += rows) {
    for (let bx = ix0; bx <= ix1; bx += cols) {
      const bbox = [bx * CELL_LNG, by * CELL_LAT, (bx + cols) * CELL_LNG, (by + rows) * CELL_LAT].map((v) => v.toFixed(5)).join(",");
      out.push({ by, bx, bbox });
    }
  }
  return out;
}

/** Filtro OSM delle strade percorribili in auto (per Overpass e osmium). */
export const DRIVABLE_HIGHWAYS = ROAD_KINDS;

const NOT_FOR_CARS = new Set(["no", "private"]);

/** Una strada OSM (tag + punti) → strada per le celle, o null se non serve. */
export function wayFromOsm(id: number, tags: Record<string, string | undefined>, pts: number[]): OsmWay | null {
  const kind = tags.highway as RoadKind | undefined;
  if (!kind || !ROAD_KINDS.includes(kind)) return null;
  if (NOT_FOR_CARS.has(tags.motor_vehicle ?? "") || NOT_FOR_CARS.has(tags.motorcar ?? "")) return null;
  if (tags.area === "yes" || pts.length < 4) return null;
  const layer = Number.parseInt(tags.layer ?? "0", 10);
  return {
    id,
    kind,
    oneway: onewayFromTags(tags),
    layer: Number.isFinite(layer) ? layer : 0,
    bridgeOrTunnel: Boolean((tags.bridge && tags.bridge !== "no") || (tags.tunnel && tags.tunnel !== "no")),
    pts,
  };
}

/** Le celle toccate da una strada (riquadro di ogni tratto). */
function cellsOfWay(w: OsmWay): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (let k = 0; k + 2 < w.pts.length + 1; k += 2) {
    const la = w.pts[k], ga = w.pts[k + 1];
    const lb = w.pts[k + 2] ?? la, gb = w.pts[k + 3] ?? ga;
    for (let iy = Math.floor(Math.min(la, lb) / CELL_LAT); iy <= Math.floor(Math.max(la, lb) / CELL_LAT); iy++) {
      for (let ix = Math.floor(Math.min(ga, gb) / CELL_LNG); ix <= Math.floor(Math.max(ga, gb) / CELL_LNG); ix++) {
        const key = cellKey(ix, iy);
        if (!seen.has(key)) { seen.add(key); out.push([ix, iy]); }
      }
    }
  }
  return out;
}

/**
 * Taglia le strade in celle. `keep(ix, iy)` decide quali celle scrivere (il job
 * lavora a blocchi: scrive solo le celle del suo blocco).
 */
export function cutCells(ways: OsmWay[], keep: (ix: number, iy: number) => boolean = () => true): Map<string, Uint8Array> {
  const byCell = new Map<string, { ix: number; iy: number; ways: OsmWay[] }>();
  for (const w of ways) {
    for (const [ix, iy] of cellsOfWay(w)) {
      if (!keep(ix, iy)) continue;
      const key = cellKey(ix, iy);
      const c = byCell.get(key);
      if (c) c.ways.push(w);
      else byCell.set(key, { ix, iy, ways: [w] });
    }
  }
  const out = new Map<string, Uint8Array>();
  for (const [key, c] of byCell) out.set(key, encodeCell(c.ix, c.iy, c.ways));
  return out;
}

/** Strade da una risposta Overpass `out tags geom`. */
export function waysFromOverpass(json: { elements?: Array<{ type: string; id: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }> }): OsmWay[] {
  const out: OsmWay[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "way" || !el.geometry) continue;
    const w = wayFromOsm(el.id, el.tags ?? {}, el.geometry.flatMap((g) => [g.lat, g.lon]));
    if (w) out.push(w);
  }
  return out;
}

/** Strada da una riga di `osmium export -f geojsonseq --add-unique-id=type_id`. */
export function wayFromGeojsonLine(line: string): OsmWay | null {
  const s = line.replace(/^\x1e/, "").trim();
  if (!s) return null;
  const f = JSON.parse(s) as { id?: string; geometry?: { type: string; coordinates: number[][] }; properties?: Record<string, string> };
  if (f.geometry?.type !== "LineString" || !f.id?.startsWith("w")) return null;
  const id = Number(f.id.slice(1));
  return wayFromOsm(id, f.properties ?? {}, f.geometry.coordinates.flatMap(([lng, lat]) => [lat, lng]));
}

/** Query Overpass delle strade in auto in un riquadro (per le celle fatte a mano). */
export function overpassQuery(south: number, west: number, north: number, east: number): string {
  return `[out:json][timeout:120];way["highway"~"^(${DRIVABLE_HIGHWAYS.join("|")})$"](${south},${west},${north},${east});out tags geom qt;`;
}
