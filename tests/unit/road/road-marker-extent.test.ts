import { haversineMeters } from "@/lib/autoscuole/road/geo";
import { markerExtent, normalizeExtentM, storedExtent } from "@/lib/autoscuole/road/marker-extent";

// Strada dritta verso est a Teramo: un punto ogni ~10 m, uno al secondo.
const LAT = 42.66;
const STEP = 10 / (111_320 * Math.cos((LAT * Math.PI) / 180));
const line = (n: number, t0 = 0) => Array.from({ length: n }, (_, i) => [LAT, 13.7 + i * STEP, t0 + i * 1000] as [number, number, number]);
const length = (l: Array<[number, number]>) => l.slice(1).reduce((s, p, i) => s + haversineMeters(l[i][0], l[i][1], p[0], p[1]), 0);

describe("Road novembre R7 — tratto di una segnalazione «zona»", () => {
  it("lunghezze ammesse 50/100/200, il resto è un punto", () => {
    expect(normalizeExtentM(100)).toBe(100);
    expect(normalizeExtentM("200")).toBe(200);
    expect(normalizeExtentM(75)).toBeNull();
    expect(normalizeExtentM(null)).toBeNull();
    expect(markerExtent(line(50), { lat: LAT, lng: 13.7 + 20 * STEP, recordedAtMs: 20_000, extentM: null })).toBeNull();
  });

  it("centrato sul punto, lungo quanto chiesto", () => {
    const path = line(60);
    const ext = markerExtent(path, { lat: LAT, lng: 13.7 + 30 * STEP, recordedAtMs: 30_000, extentM: 100 })!;
    expect(length(ext)).toBeCloseTo(100, 0);
    const mid = 13.7 + 30 * STEP;
    expect(ext[0][1]).toBeCloseTo(mid - 5 * STEP, 5);
    expect(ext[ext.length - 1][1]).toBeCloseTo(mid + 5 * STEP, 5);
  });

  it("ai capi della traccia si accorcia (niente strada inventata)", () => {
    const ext = markerExtent(line(60), { lat: LAT, lng: 13.7 + 2 * STEP, recordedAtMs: 2000, extentM: 200 })!;
    expect(length(ext)).toBeCloseTo(120, 0); // 20 m prima + 100 m dopo
  });

  it("strada fatta due volte: vale il passaggio all'ora della segnalazione", () => {
    // andata verso est (0–40 s), ritorno verso ovest (41–80 s) sulla stessa strada
    const there = line(41);
    const back = there.slice(0, 40).reverse().map(([a, b], i) => [a, b, 41_000 + i * 1000] as [number, number, number]);
    const path = [...there, ...back];
    const at = { lat: LAT, lng: 13.7 + 10 * STEP };
    const going = markerExtent(path, { ...at, recordedAtMs: 10_000, extentM: 50 })!;
    const coming = markerExtent(path, { ...at, recordedAtMs: 70_000, extentM: 50 })!;
    // all'andata il tratto va verso est, al ritorno verso ovest
    expect(going[going.length - 1][1]).toBeGreaterThan(going[0][1]);
    expect(coming[coming.length - 1][1]).toBeLessThan(coming[0][1]);
  });

  it("spostata a mano: si aggancia al passaggio più vicino; lontana dalla strada resta un punto", () => {
    const path = line(60);
    const moved = markerExtent(path, { lat: LAT, lng: 13.7 + 45 * STEP, recordedAtMs: 10_000, extentM: 50 })!;
    expect(moved[0][1]).toBeCloseTo(13.7 + 42.5 * STEP, 5);
    const far = markerExtent(path, { lat: LAT + 0.002, lng: 13.7 + 30 * STEP, recordedAtMs: 30_000, extentM: 50 });
    expect(far).toBeNull();
  });

  it("tratto salvato: valido o null", () => {
    expect(storedExtent([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
    expect(storedExtent([[1, 2]])).toBeNull();
    expect(storedExtent("x")).toBeNull();
  });
});
