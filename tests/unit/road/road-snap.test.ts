jest.mock("@/lib/cache/redis", () => ({ getRedis: () => null }));

import type { LatLng } from "@/lib/autoscuole/road/exam-routes";
import {
  joinSegments,
  legSteps,
  planSnapRuns,
  segmentKey,
  snapWaypoints,
  snapWaypointsWithSteps,
  stepsKey,
  waypointsFromTrack,
  type FetchLegs,
  type FetchLegsWithSteps,
  type RoadStep,
  type SnapCache,
  type StepsCache,
} from "@/lib/autoscuole/road/snap";

// Cache in memoria e una «Google» finta: ogni tratto è una L (prima a nord,
// poi a est) con un punto ogni ~11 m, così la semplificazione ha lavoro da fare.
function memoryCache() {
  const store = new Map<string, LatLng[]>();
  const cache: SnapCache = {
    getMany: async (keys) => keys.map((k) => store.get(k) ?? null),
    setMany: async (entries) => entries.forEach(([k, v]) => store.set(k, v)),
  };
  return { store, cache };
}

function fakeGoogle() {
  const calls: LatLng[][] = [];
  const fetchLegs: FetchLegs = async (points) => {
    calls.push(points);
    return points.slice(0, -1).map((a, i) => {
      const b = points[i + 1];
      const up = Array.from({ length: 11 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / 10, a[1]] as LatLng);
      const right = Array.from({ length: 11 }, (_, k) => [b[0], a[1] + ((b[1] - a[1]) * k) / 10] as LatLng);
      return [...up, ...right.slice(1)];
    });
  };
  return { calls, fetchLegs };
}

const wp = (n: number): LatLng[] => Array.from({ length: n }, (_, i) => [45.07 + i * 0.001, 7.68 + i * 0.001]);

describe("Reglo Road — aggancio alle strade", () => {
  it("planSnapRuns raggruppa i tratti consecutivi, al massimo 11 per richiesta", () => {
    expect(planSnapRuns([])).toEqual([]);
    expect(planSnapRuns([0, 1, 2, 5, 6, 9])).toEqual([
      { from: 0, legs: 3 },
      { from: 5, legs: 2 },
      { from: 9, legs: 1 },
    ]);
    const all = Array.from({ length: 24 }, (_, i) => i);
    expect(planSnapRuns(all)).toEqual([
      { from: 0, legs: 11 },
      { from: 11, legs: 11 },
      { from: 22, legs: 2 },
    ]);
  });

  it("joinSegments non doppia il punto di giunzione", () => {
    expect(
      joinSegments([
        [[1, 1], [2, 2]],
        [[2, 2], [3, 3]],
      ]),
    ).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it("la chiave del tratto ignora differenze sotto il metro e dipende dal verso", () => {
    expect(segmentKey([45.070001, 7.68], [45.08, 7.69])).toBe(segmentKey([45.070004, 7.680001], [45.08, 7.69]));
    expect(segmentKey([45.07, 7.68], [45.08, 7.69])).not.toBe(segmentKey([45.08, 7.69], [45.07, 7.68]));
  });

  it("prima volta: una richiesta per tutti i tratti; linea unita e semplificata", async () => {
    const { cache, store } = memoryCache();
    const g = fakeGoogle();
    const res = await snapWaypoints(wp(4), { fetchLegs: g.fetchLegs, cache });
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]).toHaveLength(4);
    expect(res.segments).toHaveLength(3);
    // Ogni L semplificata = 3 punti (partenza, angolo, arrivo).
    res.segments.forEach((s) => expect(s).toHaveLength(3));
    expect(res.path).toHaveLength(7);
    expect(res.lengthMeters).toBeGreaterThan(300);
    expect(store.size).toBe(3);
    expect(res).toMatchObject({ cachedSegments: 0, requests: 1 });
  });

  it("spostare un punto ricalcola solo i due tratti che lo toccano", async () => {
    const { cache } = memoryCache();
    const g = fakeGoogle();
    const points = wp(6);
    await snapWaypoints(points, { fetchLegs: g.fetchLegs, cache });
    const moved = points.map((p, i) => (i === 3 ? ([p[0] + 0.0004, p[1]] as LatLng) : p));
    const res = await snapWaypoints(moved, { fetchLegs: g.fetchLegs, cache });
    expect(g.calls).toHaveLength(2);
    // Una richiesta sola, dal punto 2 al 4 passando per il punto spostato.
    expect(g.calls[1]).toEqual([moved[2], moved[3], moved[4]]);
    expect(res).toMatchObject({ cachedSegments: 3, requests: 1 });

    const again = await snapWaypoints(moved, { fetchLegs: g.fetchLegs, cache });
    expect(g.calls).toHaveLength(2);
    expect(again).toMatchObject({ cachedSegments: 5, requests: 0 });
  });

  it("un errore di Google arriva al chiamante e non riempie la cache", async () => {
    const { cache, store } = memoryCache();
    const failing: FetchLegs = async () => {
      throw new Error("giù");
    };
    await expect(snapWaypoints(wp(3), { fetchLegs: failing, cache })).rejects.toThrow("giù");
    expect(store.size).toBe(0);
  });

  it("waypointsFromTrack tiene partenza e arrivo e resta entro il massimo", () => {
    // Zig-zag lungo: ~400 punti, molte curve.
    const track: LatLng[] = Array.from({ length: 400 }, (_, i) => [45.07 + i * 0.0001, 7.68 + (i % 40 < 20 ? i % 20 : 20 - (i % 20)) * 0.0002]);
    const out = waypointsFromTrack(track, 25);
    expect(out.length).toBeLessThanOrEqual(25);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0]).toEqual(track[0]);
    expect(out[out.length - 1]).toEqual(track[track.length - 1]);
  });
});

describe("Reglo Road — svolte del giro (REG-676)", () => {
  function memoryStepsCache() {
    const store = new Map<string, RoadStep[]>();
    const cache: StepsCache = {
      getMany: async (keys) => keys.map((k) => store.get(k) ?? null),
      setMany: async (entries) => entries.forEach(([k, v]) => store.set(k, v)),
    };
    return { store, cache };
  }

  // «Google» finta con le svolte: una svolta a destra a metà di ogni tratto.
  function fakeGoogleWithSteps() {
    const g = fakeGoogle();
    const calls: LatLng[][] = [];
    const fetchLegs: FetchLegsWithSteps = async (points) => {
      calls.push(points);
      const lines = await g.fetchLegs(points);
      return lines.map((line, i) => ({
        line,
        steps: [{ lat: points[i + 1][0], lng: points[i][1], maneuver: "TURN_RIGHT", text: `Svolta ${i}` }],
      }));
    };
    return { calls, fetchLegs };
  }

  it("legSteps: posizione d'inizio, manovra (STRAIGHT se manca), prima riga; via DEPART e passi senza posizione", () => {
    const at = (latitude: number, longitude: number) => ({ latLng: { latitude, longitude } });
    expect(
      legSteps({
        steps: [
          { startLocation: at(45.07, 7.68), navigationInstruction: { maneuver: "DEPART", instructions: "Procedi verso nord" } },
          {
            startLocation: at(45.0712345678, 7.6812345678),
            distanceMeters: 120,
            navigationInstruction: { maneuver: "TURN_RIGHT", instructions: "Svolta a destra in Via Roma\nDestinazione sulla sinistra" },
          },
          { startLocation: at(45.072, 7.682), navigationInstruction: { instructions: "Continua su Corso Francia" } },
          { navigationInstruction: { maneuver: "TURN_LEFT", instructions: "Senza posizione" } },
          { startLocation: at(45.073, 7.683) },
        ],
      }),
    ).toEqual([
      { lat: 45.071235, lng: 7.681235, maneuver: "TURN_RIGHT", text: "Svolta a destra in Via Roma" },
      { lat: 45.072, lng: 7.682, maneuver: "STRAIGHT", text: "Continua su Corso Francia" },
      { lat: 45.073, lng: 7.683, maneuver: "STRAIGHT", text: "" },
    ]);
    expect(legSteps({})).toEqual([]);
  });

  it("prima volta: una richiesta, svolte in ordine di linea, entrambe le cache riempite", async () => {
    const lines = memoryCache();
    const steps = memoryStepsCache();
    const g = fakeGoogleWithSteps();
    const points = wp(4);
    const res = await snapWaypointsWithSteps(points, { fetchLegs: g.fetchLegs, cache: lines.cache, stepsCache: steps.cache });
    expect(g.calls).toHaveLength(1);
    expect(res.steps.map((x) => x.text)).toEqual(["Svolta 0", "Svolta 1", "Svolta 2"]);
    expect(res.path).toHaveLength(7);
    expect(lines.store.size).toBe(3);
    expect(steps.store.get(stepsKey(points[1], points[2]))).toEqual([res.steps[1]]);
    expect(res).toMatchObject({ cachedSegments: 0, requests: 1 });

    // Tutto in cache: nessuna richiesta, stesse svolte.
    const again = await snapWaypointsWithSteps(points, { fetchLegs: g.fetchLegs, cache: lines.cache, stepsCache: steps.cache });
    expect(g.calls).toHaveLength(1);
    expect(again.steps).toEqual(res.steps);
    expect(again).toMatchObject({ cachedSegments: 3, requests: 0 });
  });

  it("un tratto con la linea in cache ma senza svolte si richiede (e solo lui)", async () => {
    const lines = memoryCache();
    const steps = memoryStepsCache();
    const points = wp(4);
    // La linea c'è già per tutti i tratti (editor dei percorsi, ottimizzazione): mancano le svolte del tratto 1.
    await snapWaypoints(points, { fetchLegs: fakeGoogle().fetchLegs, cache: lines.cache });
    steps.store.set(stepsKey(points[0], points[1]), []);
    steps.store.set(stepsKey(points[2], points[3]), [{ lat: 1, lng: 2, maneuver: "ROUNDABOUT_LEFT", text: "Alla rotonda" }]);
    const g = fakeGoogleWithSteps();
    const res = await snapWaypointsWithSteps(points, { fetchLegs: g.fetchLegs, cache: lines.cache, stepsCache: steps.cache });
    expect(g.calls).toEqual([[points[1], points[2]]]);
    expect(res.steps.map((x) => x.maneuver)).toEqual(["TURN_RIGHT", "ROUNDABOUT_LEFT"]);
    expect(steps.store.get(stepsKey(points[1], points[2]))).toHaveLength(1);
    expect(res).toMatchObject({ cachedSegments: 2, requests: 1 });
  });

  it("al massimo 10 intermedi per richiesta anche con le svolte", async () => {
    const g = fakeGoogleWithSteps();
    const res = await snapWaypointsWithSteps(wp(25), {
      fetchLegs: g.fetchLegs,
      cache: memoryCache().cache,
      stepsCache: memoryStepsCache().cache,
    });
    expect(g.calls.map((c) => c.length)).toEqual([12, 12, 3]);
    expect(res.steps).toHaveLength(24);
  });

  it("un errore di Google arriva al chiamante e non riempie le cache", async () => {
    const lines = memoryCache();
    const steps = memoryStepsCache();
    const failing: FetchLegsWithSteps = async () => {
      throw new Error("giù");
    };
    await expect(
      snapWaypointsWithSteps(wp(3), { fetchLegs: failing, cache: lines.cache, stepsCache: steps.cache }),
    ).rejects.toThrow("giù");
    expect(lines.store.size + steps.store.size).toBe(0);
  });
});
