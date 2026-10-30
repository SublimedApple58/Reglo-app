import type { RoadPoint } from "@/lib/autoscuole/road/geo";
import {
  buildCleanTrack,
  cleanTrackPoints,
  needsRebuild,
  snapPath,
  thinForSnap,
  type FetchSnap,
  type TrackPoint,
} from "@/lib/autoscuole/road/clean-track";

const T0 = Date.UTC(2026, 9, 30, 10, 0, 0);
const M_LAT = 1 / 111_320; // ~1 m di latitudine in gradi

/** Pseudo-casuale ripetibile per il «ballo» del GPS. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Auto ferma: un fix ogni 5 s per `ms`, sparsi entro `jitterM` metri. */
function still(lat: number, lng: number, from: number, ms: number, jitterM: number, r = rng(7)): RoadPoint[] {
  const out: RoadPoint[] = [];
  for (let t = from; t < from + ms; t += 5000) {
    out.push([t, lat + (r() - 0.5) * 2 * jitterM * M_LAT, lng + (r() - 0.5) * 2 * jitterM * M_LAT, 0, null, 6]);
  }
  return out;
}

/** In marcia verso nord a 10 m/s, un fix al secondo. */
function drive(lat: number, lng: number, from: number, seconds: number): RoadPoint[] {
  return Array.from({ length: seconds }, (_, i) => [from + i * 1000, lat + i * 10 * M_LAT, lng, 10, 0, 5] as RoadPoint);
}

describe("cleanTrackPoints", () => {
  it("accorpa 20 minuti da fermo in un punto e ne fa una sosta", () => {
    const pts = [...still(42.6, 13.7, T0, 20 * 60_000, 12), ...drive(42.6, 13.7, T0 + 20 * 60_000, 60)];
    const { path, stops } = cleanTrackPoints(pts);
    expect(stops).toHaveLength(1);
    expect(stops[0].minutes).toBe(20);
    // 240 fix da fermo → 2 punti (arrivo e ripartenza) + la marcia
    expect(path.length).toBeLessThan(70);
  });

  it("una fermata di 3 minuti si accorpa ma non è una sosta", () => {
    const pts = [...drive(42.6, 13.7, T0, 30), ...still(42.6 + 300 * M_LAT, 13.7, T0 + 30_000, 3 * 60_000, 8)];
    const { stops, path } = cleanTrackPoints(pts);
    expect(stops).toHaveLength(0);
    expect(path.length).toBeLessThan(40);
  });

  it("scarta fix imprecisi e salti impossibili", () => {
    const pts = drive(42.6, 13.7, T0, 20);
    pts[5] = [pts[5][0], pts[5][1], pts[5][2], 10, 0, 80]; // precisione 80 m
    pts[10] = [pts[10][0], pts[10][1] + 0.05, pts[10][2], 10, 0, 5]; // salto di ~5 km
    const { path } = cleanTrackPoints(pts);
    expect(path).toHaveLength(18);
  });
});

describe("thinForSnap", () => {
  it("tiene circa un punto ogni 30 m, sempre primo e ultimo", () => {
    const { path } = cleanTrackPoints(drive(42.6, 13.7, T0, 100)); // ~1 km, un punto ogni 10 m
    const thin = thinForSnap(path);
    expect(thin[0]).toEqual(path[0]);
    expect(thin[thin.length - 1]).toEqual(path[path.length - 1]);
    expect(thin.length).toBeGreaterThan(20);
    expect(thin.length).toBeLessThan(40);
  });
});

describe("snapPath", () => {
  // «Google» finta: rimanda i punti dati con originalIndex e ne aggiunge uno a metà.
  const echo: FetchSnap = async (path) =>
    path.flatMap(([lat, lng], i) => {
      const pts: Array<{ lat: number; lng: number; originalIndex?: number }> = [{ lat, lng, originalIndex: i }];
      if (i < path.length - 1) pts.push({ lat: (lat + path[i + 1][0]) / 2, lng: (lng + path[i + 1][1]) / 2 });
      return pts;
    });

  it("spezza in pezzi da 100 senza doppioni e interpola i tempi", async () => {
    const thin: TrackPoint[] = Array.from({ length: 250 }, (_, i) => [42.6 + i * 30 * M_LAT, 13.7, T0 + i * 3000]);
    const calls: number[] = [];
    const out = await snapPath(thin, async (p) => {
      calls.push(p.length);
      return echo(p);
    });
    expect(calls).toEqual([100, 100, 52]);
    expect(out).toHaveLength(250 + 249);
    for (let k = 1; k < out.length; k++) expect(out[k][2]).toBeGreaterThanOrEqual(out[k - 1][2]);
    expect(out[1][2]).toBe(T0 + 1500);
  });
});

describe("buildCleanTrack", () => {
  it("Google che non risponde = traccia solo pulita, da riprovare dopo un giorno", async () => {
    const t = await buildCleanTrack(drive(42.6, 13.7, T0, 60), {
      now: T0,
      fetchSnap: async () => {
        throw new Error("down");
      },
    });
    expect(t.snapped).toBe(false);
    expect(t.retryAfter).toBe(T0 + 24 * 3600_000);
    expect(t.path.length).toBe(60);
    expect(t.thumb.length).toBe(60);
    expect(needsRebuild(t, T0 + 1000)).toBe(false);
    expect(needsRebuild(t, T0 + 25 * 3600_000)).toBe(true);
  });

  it("agganciata: non va ricalcolata", async () => {
    const t = await buildCleanTrack(drive(42.6, 13.7, T0, 60), { fetchSnap: async (p) => p.map(([lat, lng], i) => ({ lat, lng, originalIndex: i })) });
    expect(t.snapped).toBe(true);
    expect(needsRebuild(t)).toBe(false);
    expect(needsRebuild(null)).toBe(true);
    expect(needsRebuild({ ...t, v: 0 })).toBe(true);
  });
});

describe("snapPath: deviazioni di Google", () => {
  it("dove Google devia (andata e ritorno di 400 m) restano i punti puliti", async () => {
    const thin: TrackPoint[] = Array.from({ length: 6 }, (_, i) => [42.6 + i * 30 * M_LAT, 13.7, T0 + i * 3000]);
    const clean: TrackPoint[] = Array.from({ length: 16 }, (_, i) => [42.6 + i * 10 * M_LAT, 13.7, T0 + i * 1000]);
    const out = await snapPath(
      thin,
      async (p) =>
        p.flatMap(([lat, lng], i) => {
          const pts: Array<{ lat: number; lng: number; originalIndex?: number }> = [{ lat, lng, originalIndex: i }];
          // fra il punto 2 e il 3: Google va 200 m a est e torna
          if (i === 2) pts.push({ lat, lng: lng + 200 * M_LAT * 1.36 }, { lat: lat + 30 * M_LAT, lng: lng + 200 * M_LAT * 1.36 });
          return pts;
        }),
      clean,
    );
    expect(out.every((q) => Math.abs(q[1] - 13.7) < 1e-9)).toBe(true);
    expect(out.map((q) => q[2])).toEqual([T0, T0 + 3000, T0 + 6000, T0 + 7000, T0 + 8000, T0 + 9000, T0 + 12000, T0 + 15000]);
  });
});
