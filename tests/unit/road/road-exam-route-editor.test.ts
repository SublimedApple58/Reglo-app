import {
  editorLengthMeters,
  joinedPath,
  legKey,
  legsFor,
  missingLegRuns,
  splitPathAtWaypoints,
} from "@/lib/autoscuole/road/exam-route-editor";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";

const wp: LatLng[] = [
  [45.07, 7.68],
  [45.071, 7.681],
  [45.072, 7.682],
  [45.073, 7.683],
];

describe("editor percorsi d'esame (REG-645)", () => {
  it("chiede solo i tratti mancanti, consecutivi in una richiesta", () => {
    const known = new Set([legKey(wp[0], wp[1])]);
    expect(missingLegRuns(wp, (k) => known.has(k))).toEqual([{ from: 1, legs: 2 }]);
  });

  it("spostare un punto in mezzo tocca solo i suoi due tratti", () => {
    const moved: LatLng[] = [wp[0], wp[1], [45.0725, 7.6825], wp[3]];
    const known = new Set([legKey(wp[0], wp[1]), legKey(wp[1], wp[2]), legKey(wp[2], wp[3])]);
    expect(missingLegRuns(moved, (k) => known.has(k))).toEqual([{ from: 1, legs: 2 }]);
  });

  it("tutto agganciato = nessuna richiesta", () => {
    const known = new Set([legKey(wp[0], wp[1]), legKey(wp[1], wp[2]), legKey(wp[2], wp[3])]);
    expect(missingLegRuns(wp, (k) => known.has(k))).toEqual([]);
  });

  it("spezza i pezzi lunghi oltre il massimo per richiesta", () => {
    expect(missingLegRuns(wp, () => false, 2)).toEqual([
      { from: 0, legs: 2 },
      { from: 2, legs: 1 },
    ]);
  });

  it("la linea completa esiste solo con tutti i tratti agganciati", () => {
    const cache = new Map<string, LatLng[]>([
      [legKey(wp[0], wp[1]), [wp[0], [45.0705, 7.6805], wp[1]]],
      [legKey(wp[1], wp[2]), [wp[1], wp[2]]],
    ]);
    const legs = legsFor(wp, (k) => cache.get(k));
    expect(legs[2]).toBeNull();
    expect(joinedPath(legs)).toBeNull();
    expect(editorLengthMeters(wp, legs)).toBeGreaterThan(0);
    cache.set(legKey(wp[2], wp[3]), [wp[2], wp[3]]);
    expect(joinedPath(legsFor(wp, (k) => cache.get(k)))).toEqual([wp[0], [45.0705, 7.6805], wp[1], wp[2], wp[3]]);
  });

  it("riaprendo un percorso divide la linea per punto", () => {
    const path: LatLng[] = [wp[0], [45.0705, 7.6805], wp[1], [45.0715, 7.6815], wp[2]];
    const legs = splitPathAtWaypoints(path, [wp[0], wp[1], wp[2]]);
    expect(legs).toEqual([
      [wp[0], [45.0705, 7.6805], wp[1]],
      [wp[1], [45.0715, 7.6815], wp[2]],
    ]);
  });

  it("non divide se un punto è lontano dalla linea", () => {
    const path: LatLng[] = [wp[0], wp[1]];
    expect(splitPathAtWaypoints(path, [wp[0], [45.09, 7.7], wp[1]])).toBeNull();
  });
});
