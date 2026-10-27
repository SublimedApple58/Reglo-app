"use client";

import * as React from "react";
import type {
  LngLatBoundsLike,
  Map as MlMap,
  Marker as MlMarker,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Mappa di Reglo Road (web): MapLibre + tiles vettoriali OpenFreeMap
 * («liberty», gratis e senza chiave) ricolorate come il concept approvato
 * (fondo caldo, strade bianche, percorso nero). MapLibre si carica solo nel
 * browser (import dinamico): niente SSR.
 *
 * Gotcha MapLibre: l'elemento radice di un `Marker` non deve avere `position`
 * o `transform` propri, li sovrascrive lui. Stili e traslazioni vanno su un
 * figlio.
 */

type MapLibre = typeof import("maplibre-gl");

// Solo l'istanza pubblica di OpenFreeMap: nessun altro fornitore di tile.
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
/** Attribuzione obbligatoria, sempre visibile (controllo compatto in basso a destra). */
const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

let libPromise: Promise<MapLibre> | null = null;
function loadMapLibre() {
  libPromise ??= import("maplibre-gl").then((m) => (m.default ?? m) as unknown as MapLibre);
  return libPromise;
}

let stylePromise: Promise<StyleSpecification> | null = null;

/** Stile «liberty» ricolorato: stessi filtri e colori di `roadStyle()` del prototipo. */
function loadRoadStyle(): Promise<StyleSpecification> {
  stylePromise ??= fetch(OPENFREEMAP_STYLE)
    .then((r) => r.json() as Promise<StyleSpecification>)
    .then((s) => {
      const C = {
        bg: "#F4F1EA",
        res: "#F1EDE4",
        building: "#E9E4DA",
        buildingLine: "#E0DACD",
        park: "#D9EDCB",
        wood: "#CFE6BF",
        water: "#BCE3DE",
        road: "#FFFFFF",
        casing: "#E2DCCF",
        major: "#FFFFFF",
        majorCasing: "#D9D2C2",
        label: "#8F897C",
      };
      // Il TileJSON di OpenFreeMap porta già l'attribuzione: la fissiamo anche
      // nello stile, così resta garantita.
      for (const source of Object.values(s.sources)) {
        if (source.type === "vector") source.attribution = OPENFREEMAP_ATTRIBUTION;
      }
      s.layers = s.layers.filter(
        (l) =>
          !/^poi|shield|one_way|airport|natural_earth|hatching|label_country|label_state|aeroway|boundary|rail/.test(
            l.id,
          ),
      );
      for (const l of s.layers as Array<
        StyleSpecification["layers"][number] & {
          paint?: Record<string, unknown>;
          layout?: Record<string, unknown>;
        }
      >) {
        const p = (l.paint ??= {});
        const id = l.id;
        if (id === "background") p["background-color"] = C.bg;
        else if (id === "landuse_residential") {
          p["fill-color"] = C.res;
          p["fill-opacity"] = 1;
        } else if (/park$|landcover_grass|pitch|cemetery/.test(id) && l.type === "fill") {
          p["fill-color"] = C.park;
          p["fill-opacity"] = 1;
        } else if (/park_outline/.test(id)) p["line-opacity"] = 0;
        else if (/landcover_wood/.test(id)) {
          p["fill-color"] = C.wood;
          p["fill-opacity"] = 1;
        } else if (/hospital|school|track$/.test(id) && l.type === "fill") {
          p["fill-color"] = C.res;
        } else if (id === "water") p["fill-color"] = C.water;
        else if (/waterway/.test(id) && l.type === "line") p["line-color"] = C.water;
        else if (id === "building") {
          p["fill-color"] = C.building;
          p["fill-outline-color"] = C.buildingLine;
        } else if (id === "building-3d") {
          p["fill-extrusion-color"] = "#ECE7DE";
          p["fill-extrusion-opacity"] = 0.32;
        } else if (/casing/.test(id)) p["line-color"] = /trunk|motorway/.test(id) ? C.majorCasing : C.casing;
        else if (/^(road|bridge|tunnel)_/.test(id) && l.type === "line") {
          p["line-color"] = /path|pedestrian/.test(id)
            ? "#EEE9DF"
            : /trunk|motorway/.test(id)
              ? C.major
              : C.road;
        } else if (l.type === "symbol") {
          p["text-color"] = C.label;
          p["text-halo-color"] = "rgba(255,255,255,.9)";
          p["text-halo-width"] = 1.4;
          if (l.layout) {
            l.layout["text-font"] = ["Noto Sans Regular"];
            if (l.layout["text-field"]) {
              l.layout["text-field"] = ["coalesce", ["get", "name:it"], ["get", "name"]];
            }
          }
          if (/label_city|label_town|label_village/.test(id)) {
            l.layout = { ...l.layout, visibility: "none" };
          }
        }
      }
      return s;
    })
    .catch((error) => {
      stylePromise = null;
      throw error;
    });
  return stylePromise.then((s) => structuredClone(s));
}

export type RoadMapHandle = { map: MlMap; lib: MapLibre };

/** Crea la mappa nel contenitore; `null` finché stile e tiles non sono pronti. */
export function useRoadMap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  initial: { center: [number, number]; zoom: number },
) {
  const [handle, setHandle] = React.useState<RoadMapHandle | null>(null);
  const [failed, setFailed] = React.useState(false);
  const initialRef = React.useRef(initial);

  React.useEffect(() => {
    let disposed = false;
    let map: MlMap | null = null;
    void (async () => {
      try {
        const [lib, style] = await Promise.all([loadMapLibre(), loadRoadStyle()]);
        if (disposed || !containerRef.current) return;
        const { center, zoom } = initialRef.current;
        map = new lib.Map({
          container: containerRef.current,
          style,
          center: [center[1], center[0]],
          zoom,
          // Attribuzione OpenFreeMap/OpenStreetMap: obbligatoria e visibile.
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          fadeDuration: 0,
        });
        map.touchZoomRotate.disableRotation();
        map.on("load", () => {
          if (!disposed && map) setHandle({ map, lib });
        });
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      map?.remove();
      setHandle(null);
    };
  }, [containerRef]);

  return { handle, failed };
}

// ─── helper di disegno ──────────────────────────────────────────────────────

export const toLngLat = (p: { lat: number; lng: number } | [number, number]): [number, number] =>
  Array.isArray(p) ? [p[1], p[0]] : [p.lng, p.lat];

export function lineBounds(lib: MapLibre, coords: Array<[number, number]>): LngLatBoundsLike | null {
  if (!coords.length) return null;
  const b = new lib.LngLatBounds();
  coords.forEach((c) => b.extend(c));
  return b;
}

export type RouteStyle = { width: number; color: string; opacity: number };

/** Percorso con bordo bianco (casing). Crea sorgente e layer o li aggiorna. */
export function upsertRoute(map: MlMap, id: string, coords: Array<[number, number]>, style: RouteStyle) {
  const data = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: coords },
  };
  const src = map.getSource(id) as { setData?: (d: typeof data) => void } | undefined;
  if (src?.setData) src.setData(data);
  else map.addSource(id, { type: "geojson", data });
  if (!map.getLayer(`${id}-c`)) {
    map.addLayer({
      id: `${id}-c`,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff" },
    });
    map.addLayer({
      id,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  map.setPaintProperty(`${id}-c`, "line-width", style.width + 5);
  map.setPaintProperty(`${id}-c`, "line-opacity", style.opacity);
  map.setPaintProperty(id, "line-color", style.color);
  map.setPaintProperty(id, "line-width", style.width);
  map.setPaintProperty(id, "line-opacity", style.opacity);
}

export function removeRoute(map: MlMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getLayer(`${id}-c`)) map.removeLayer(`${id}-c`);
  if (map.getSource(id)) map.removeSource(id);
}

/** Porta il percorso sopra gli altri (il selezionato). */
export function raiseRoute(map: MlMap, id: string) {
  if (map.getLayer(`${id}-c`)) map.moveLayer(`${id}-c`);
  if (map.getLayer(id)) map.moveLayer(id);
}

export function htmlElement(html: string): HTMLElement {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

export function addHtmlMarker(
  handle: RoadMapHandle,
  at: [number, number],
  element: HTMLElement,
  anchor: "center" | "bottom" = "center",
): MlMarker {
  return new handle.lib.Marker({ element, anchor }).setLngLat(at).addTo(handle.map);
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
