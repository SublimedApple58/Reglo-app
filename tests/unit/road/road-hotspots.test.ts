
import {
  buildHotspots,
  clusterMarkers,
  distanceToPathMeters,
  findHotspot,
  hotspotKey,
  parseHotspotFilters,
  parseHotspotKey,
  type HotspotMarker,
} from "@/lib/autoscuole/road/hotspots";


// Incrocio a Torino; ~11 m per 0,0001° di latitudine.
const BASE = { lat: 45.07, lng: 7.68 };
let seq = 0;
function m(over: Partial<HotspotMarker> & { dLat?: number; student?: string }): HotspotMarker {
  seq++;
  return {
    id: `m${String(seq).padStart(3, "0")}`,
    sessionId: over.sessionId ?? `s-${over.student ?? "a"}`,
    studentId: over.student ?? "a",
    kind: over.kind ?? "precedenza",
    label: over.label ?? "Precedenza",
    lat: BASE.lat + (over.dLat ?? 0),
    lng: over.lng ?? BASE.lng,
    street: over.street === undefined ? "Via Roma" : over.street,
    recordedAt: over.recordedAt ?? new Date(Date.UTC(2026, 9, 1, 10, 0, seq)),
  };
}

describe("Reglo Road — punti critici", () => {
  it("raggruppa per tipo entro ~60 m, anche se la via cambia all'incrocio", () => {
    const clusters = clusterMarkers([
      m({ street: "Via Roma" }),
      m({ dLat: 0.0003, street: "Corso Vittorio" }), // ~33 m, altra via: stesso punto
      m({ dLat: 0.002 }), // ~220 m: altro punto
      m({ kind: "stop" }), // stesso posto, altro tipo: altro punto
    ]);
    expect(clusters.map((c) => c.markers.length).sort()).toEqual([1, 1, 2]);
  });

  it("soglia: almeno 3 errori da almeno 2 allievi", () => {
    // 3 errori di un allievo solo: non è un punto critico.
    expect(buildHotspots([m({ student: "a" }), m({ student: "a" }), m({ student: "a" })])).toEqual([]);
    // 2 errori di 2 allievi: troppo pochi.
    expect(buildHotspots([m({ student: "a" }), m({ student: "b" })])).toEqual([]);
    const hs = buildHotspots([
      m({ student: "a", street: "Via Roma" }),
      m({ student: "a", street: "Corso Vittorio", dLat: 0.0002 }),
      m({ student: "b", street: "Via Roma", dLat: 0.0001 }),
    ]);
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({ kind: "precedenza", errors: 3, students: 2, sessions: 2, street: "Via Roma", examRoutes: [] });
  });

  it("ordina per errori, poi per allievi", () => {
    const far = 0.01;
    const hs = buildHotspots([
      m({ student: "a" }), m({ student: "b" }), m({ student: "c" }),
      m({ student: "a", dLat: far }), m({ student: "b", dLat: far }), m({ student: "a", dLat: far }), m({ student: "b", dLat: far }),
    ]);
    expect(hs.map((h) => h.errors)).toEqual([4, 3]);
  });

  it("segno «sul percorso d'esame» entro 50 m dalla linea", () => {
    const markers = [m({ student: "a" }), m({ student: "b" }), m({ student: "c" })];
    // Linea est-ovest che passa ~33 m a nord del punto; l'altra ~330 m.
    const near = { id: "r1", name: "Giro Motorizzazione", path: [[45.0703, 7.67], [45.0703, 7.69]] as [number, number][] };
    const away = { id: "r2", name: "Lontano", path: [[45.073, 7.67], [45.073, 7.69]] as [number, number][] };
    expect(buildHotspots(markers, [near, away])[0].examRoutes).toEqual([{ id: "r1", name: "Giro Motorizzazione" }]);
    expect(distanceToPathMeters(45.07, 7.68, near.path)).toBeGreaterThan(30);
    expect(distanceToPathMeters(45.07, 7.68, near.path)).toBeLessThan(36);
  });

  it("la chiave si rilegge e ritrova il punto anche se il centro si sposta di poco", () => {
    const hs = buildHotspots([m({ student: "a" }), m({ student: "b" }), m({ student: "c" })]);
    expect(parseHotspotKey(hs[0].key)).toMatchObject({ kind: "precedenza" });
    expect(findHotspot(hs, hs[0].key)).toBe(hs[0]);
    expect(findHotspot(hs, hotspotKey("precedenza", BASE.lat + 0.0002, BASE.lng))).toBe(hs[0]);
    expect(findHotspot(hs, hotspotKey("stop", BASE.lat, BASE.lng))).toBeNull();
    expect(parseHotspotKey("rotta")).toBeNull();
  });

  it("filtri: il periodo non va oltre i 12 mesi e i valori strani sono rifiutati", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const def = parseHotspotFilters({}, now);
    expect(def.ok && def.value.from.toISOString()).toBe("2025-10-29T12:00:00.000Z");
    const old = parseHotspotFilters({ from: "2020-01-01" }, now);
    expect(old.ok && old.value.from.toISOString()).toBe("2025-10-29T12:00:00.000Z");
    const lic = parseHotspotFilters({ license: "a2" }, now);
    expect(lic.ok && lic.value.license).toBe("A2");
    expect(parseHotspotFilters({ from: "boh" }, now).ok).toBe(false);
    expect(parseHotspotFilters({ instructorId: "x" }, now).ok).toBe(false);
    expect(parseHotspotFilters({ from: "2026-10-20", to: "2026-10-10" }, now).ok).toBe(false);
  });
});
