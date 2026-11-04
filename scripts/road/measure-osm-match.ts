/**
 * REG-722 — misura della calamita OSM su una guida vera, contro la linea Google
 * salvata (`RoadSession.cleanTrack`). Legge solo file: lotti e traccia si
 * esportano prima in sola lettura (`pnpm db:prod:query`).
 *
 *   npx tsx scripts/road/measure-osm-match.ts --cells <dir> --raw lotti.json --clean clean.json
 *     lotti.json = [{ points: RoadPoint[] }…]   clean.json = [{ cleanTrack }]
 */
import fs from "node:fs";
import path from "node:path";

import { cleanTrackPoints } from "../../lib/autoscuole/road/clean-track";
import { decodeCell } from "../../lib/autoscuole/road/osm-cells";
import { RoadGraph, RoadMatcher, matchTrack, type MatchPoint } from "../../lib/autoscuole/road/osm-match";
import type { RoadPoint } from "../../lib/autoscuole/road/geo";

const args = process.argv.slice(2);
const arg = (f: string) => args[args.indexOf(f) + 1];

const raw: RoadPoint[] = (JSON.parse(fs.readFileSync(arg("--raw"), "utf8")) as Array<{ points: RoadPoint[] }>)
  .flatMap((b) => b.points)
  .sort((a, b) => a[0] - b[0]);
const google: Array<[number, number, number]> = JSON.parse(fs.readFileSync(arg("--clean"), "utf8"))[0].cleanTrack.path;

const graph = new RoadGraph(raw[0][1], raw[0][2]);
const dir = arg("--cells");
let cells = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".bin")) continue;
  graph.addWays(decodeCell(f.replace(".bin", ""), new Uint8Array(fs.readFileSync(path.join(dir, f)))));
  cells++;
}
console.log(`celle ${cells} · archi ${graph.edgeCount}`);

const xy = (p: { 0: number; 1: number }) => graph.toXY(p[0], p[1]);
const gl = google.map(xy);
function segDist(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1e-9;
  const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy);
}
const toLine = (p: [number, number], line: Array<[number, number]>) => {
  let m = Infinity;
  for (let i = 0; i + 1 < line.length; i++) m = Math.min(m, segDist(p, line[i], line[i + 1]));
  return m;
};
function resample(line: Array<[number, number]>, step = 5) {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out.concat(line.slice(-1));
}
function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return `mediana ${q(0.5).toFixed(1)} m · 95% ${q(0.95).toFixed(1)} m · max ${s[s.length - 1].toFixed(1)} m`;
}
const vsGoogle = (line: MatchPoint[]) => stats(resample(line.map(xy)).map((p) => toLine(p, gl)));
const googleVs = (line: MatchPoint[]) => {
  const l = line.map(xy);
  return stats(resample(gl).map((p) => toLine(p, l)));
};

const fixes = raw.filter((p) => p[5] == null || p[5] <= 25);
console.log(`guida: ${raw.length} punti, ${fixes.length} con precisione ≤ 25 m`);
console.log(`GPS grezzo → Google: ${stats(fixes.map((p) => toLine(xy([p[1], p[2]]), gl)))}`);

// fine guida: come in buildCleanTrack (pulizia, poi calamita)
let t0 = performance.now();
const clean = cleanTrackPoints(raw).path;
const final = matchTrack(graph, clean);
console.log(`\nFINE GUIDA (${(performance.now() - t0).toFixed(0)} ms, ${clean.length} punti puliti → ${final.length})`);
console.log(`  OSM → Google: ${vsGoogle(final)}`);
console.log(`  Google → OSM: ${googleVs(final)}`);

// la stessa calamita sugli stessi fix del telefono, con tutta la traccia davanti
const fm = new RoadMatcher(graph, { lagMs: Infinity });
for (const p of fixes) fm.push({ t: p[0], lat: p[1], lng: p[2], speed: p[3], heading: p[4] });
const finalRaw = fm.finish();
console.log(`  (sugli stessi fix del telefono) OSM → Google: ${vsGoogle(finalRaw)}`);

// dal vivo: fix uno alla volta, come il telefono
for (const lag of (process.env.LAGS ?? "4000,0").split(",").map(Number)) {
  const m = new RoadMatcher(graph, { lagMs: lag });
  const line: MatchPoint[] = [];
  let maxStep = 0;
  t0 = performance.now();
  for (const p of fixes) {
    const s = performance.now();
    const u = m.push({ t: p[0], lat: p[1], lng: p[2], speed: p[3], heading: p[4] });
    maxStep = Math.max(maxStep, performance.now() - s);
    line.push(...u.committed);
  }
  line.push(...m.finish());
  const ms = performance.now() - t0;
  // fix confermati su una strada lontana da quella di fine guida
  const fl = finalRaw.map(xy);
  const offPts = resample(line.map(xy), 5).filter((p) => toLine(p, fl) > 8);
  const off = offPts.length;
  if (off) console.log("  lontani:", offPts.map((p) => p.map((v) => Math.round(v)).join(",")).join(" "));
  console.log(`\nDAL VIVO, ritardo ${lag / 1000} s (${(ms / fixes.length).toFixed(2)} ms a fix, max ${maxStep.toFixed(1)} ms)`);
  console.log(`  OSM → Google: ${vsGoogle(line)}`);
  console.log(`  salti (strada non collegata): ${m.jumps} · tratti da 5 m lontani > 8 m dalla linea di fine guida: ${off}`);
}
