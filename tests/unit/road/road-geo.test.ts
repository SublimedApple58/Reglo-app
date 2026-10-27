import { haversineMeters, sanitizePoints, trackDistanceMeters, type RoadPoint } from "@/lib/autoscuole/road/geo";
import { parseRoadCustomMarkers, resolveMarkerLabel } from "@/lib/autoscuole/road/catalog";

describe("Reglo Road geo", () => {
  it("haversine: 1° di latitudine ≈ 111 km", () => {
    expect(haversineMeters(45, 7, 46, 7)).toBeGreaterThan(111000);
    expect(haversineMeters(45, 7, 46, 7)).toBeLessThan(111400);
  });

  it("sanitizePoints scarta i punti malformati e ordina per tempo", () => {
    const pts = sanitizePoints([
      [2000, 45.1, 7.1, 5, 90, 8],
      ["x", 45, 7],
      [1000, 45.0, 7.0],
      [3000, 95, 7, null, null, null],
      "rotto",
    ]);
    expect(pts.map((p) => p[0])).toEqual([1000, 2000]);
    expect(pts[0]).toEqual([1000, 45, 7, null, null, null]);
  });

  it("trackDistanceMeters ignora i fix imprecisi e i salti impossibili", () => {
    const base: RoadPoint[] = [
      [0, 45.0, 7.0, null, null, 5],
      [10_000, 45.001, 7.0, null, null, 5], // ~111 m in 10 s
      [20_000, 45.5, 7.0, null, null, 5], // salto di 55 km: rumore
      [30_000, 45.002, 7.0, null, null, 200], // fix impreciso
      [40_000, 45.002, 7.0, null, null, 5], // ~111 m dal punto buono
    ];
    const d = trackDistanceMeters(base);
    expect(d).toBeGreaterThan(215);
    expect(d).toBeLessThan(230);
  });

  it("trackDistanceMeters parte dall'ultimo punto del lotto precedente", () => {
    const prev: RoadPoint = [0, 45.0, 7.0, null, null, null];
    const d = trackDistanceMeters([[10_000, 45.001, 7.0, null, null, null]], prev);
    expect(Math.round(d)).toBe(111);
  });
});

describe("Reglo Road catalogo", () => {
  const custom = parseRoadCustomMarkers([
    { id: "a1", label: "  Cambio marcia " },
    { id: "", label: "senza id" },
    { label: "senza id 2" },
    "rotto",
  ]);

  it("legge solo le voci custom valide", () => {
    expect(custom).toEqual([{ id: "a1", label: "Cambio marcia" }]);
  });

  it("risolve etichette base e custom", () => {
    expect(resolveMarkerLabel("stop", custom)).toBe("Stop");
    expect(resolveMarkerLabel("custom:a1", custom)).toBe("Cambio marcia");
    expect(resolveMarkerLabel("boh", custom)).toBeNull();
  });

  it("una voce custom tolta nel frattempo usa l'etichetta del client", () => {
    expect(resolveMarkerLabel("custom:zz", custom, "Freno a mano")).toBe("Freno a mano");
    expect(resolveMarkerLabel("custom:zz", custom)).toBeNull();
  });
});
