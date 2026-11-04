import { cellsAround, decodeCell, encodeCell, onewayFromTags, type OsmWay } from "@/lib/autoscuole/road/osm-cells";
import { cutCells, wayFromOsm } from "@/lib/autoscuole/road/osm-cells-build";
import { RoadGraph, RoadMatcher, matchTrack, type MatchPoint } from "@/lib/autoscuole/road/osm-match";

const LAT0 = 42.61;
const LNG0 = 13.73;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110_574;
/** metri (x est, y nord) → [lat, lng] */
const ll = (x: number, y: number): [number, number] => [LAT0 + y / KY, LNG0 + x / KX];

let nextId = 1;
function way(points: Array<[number, number]>, oneway: 0 | 1 | -1 = 0): OsmWay {
  return { id: nextId++, kind: "residential", oneway, layer: 0, bridgeOrTunnel: false, pts: points.flatMap(([x, y]) => ll(x, y)) };
}
function graphOf(ways: OsmWay[]) {
  const g = new RoadGraph(LAT0, LNG0);
  g.addWays(ways);
  return g;
}
const toXY = (g: RoadGraph, p: MatchPoint) => g.toXY(p[0], p[1]);
/** Fix ogni `step` metri lungo una spezzata (x,y), 1 al secondo, con rumore deterministico. */
function drive(path: Array<[number, number]>, step = 8, noise: (i: number) => [number, number] = () => [0, 0]) {
  const out: Array<{ t: number; lat: number; lng: number; heading: number; speed: number }> = [];
  let t = 0;
  for (let s = 0; s + 1 < path.length; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const heading = ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
    for (let d = 0; d < len; d += step) {
      const [nx, ny] = noise(out.length);
      const [lat, lng] = ll(a[0] + ((b[0] - a[0]) * d) / len + nx, a[1] + ((b[1] - a[1]) * d) / len + ny);
      out.push({ t: (t += 1000), lat, lng, heading, speed: step });
    }
  }
  return out;
}
function runLive(g: RoadGraph, fixes: ReturnType<typeof drive>, lagMs = 4000) {
  const m = new RoadMatcher(g, { lagMs });
  const line: MatchPoint[] = [];
  for (const f of fixes) line.push(...m.push(f).committed);
  line.push(...m.finish());
  return { line, jumps: m.jumps };
}

describe("REG-722 celle OSM", () => {
  it("codifica e decodifica senza perdere niente (al micrograd)", () => {
    const w: OsmWay = { id: 123456789, kind: "primary", oneway: -1, layer: -1, bridgeOrTunnel: true, pts: [42.611234, 13.731234, 42.6125, 13.7329] };
    const [back] = decodeCell("852_196", encodeCell(196, 852, [w]));
    expect(back).toEqual(w);
  });

  it("taglia le strade nelle celle che toccano, anche attraversandole senza punti dentro", () => {
    const w = wayFromOsm(7, { highway: "secondary" }, [42.6, 13.66, 42.6, 13.83])!;
    const cells = cutCells([w]);
    expect([...cells.keys()].sort()).toEqual(["852_195", "852_196", "852_197"]);
  });

  it("legge i sensi unici come un'auto", () => {
    expect(onewayFromTags({ highway: "residential", oneway: "yes" })).toBe(1);
    expect(onewayFromTags({ highway: "residential", oneway: "-1" })).toBe(-1);
    expect(onewayFromTags({ highway: "primary", junction: "roundabout" })).toBe(1);
    expect(onewayFromTags({ highway: "motorway" })).toBe(1);
    expect(onewayFromTags({ highway: "residential" })).toBe(0);
    expect(wayFromOsm(1, { highway: "footway" }, [1, 1, 2, 2])).toBeNull();
    expect(wayFromOsm(1, { highway: "service", motor_vehicle: "no" }, [1, 1, 2, 2])).toBeNull();
  });

  it("le celle attorno alla sede coprono il raggio", () => {
    expect(cellsAround(42.6117, 13.7282, 20_000).length).toBeGreaterThanOrEqual(56);
  });
});

describe("REG-722 calamita", () => {
  it("strada parallela non collegata (controviale): non ci salta, anche col GPS più vicino a lei per qualche fix", () => {
    // corso a y=0, controviale a y=14, collegati solo agli estremi
    const g = graphOf([
      way([[-50, 0], [0, 0], [400, 0], [450, 0]]),
      way([[0, 0], [0, 14], [400, 14], [400, 0]]),
    ]);
    // GPS spostato verso il controviale fra i fix 20 e 24 (8–9 m)
    const fixes = drive([[-40, 0], [440, 0]], 8, (i) => [0, i >= 20 && i <= 24 ? 9 : 2]);
    const { line, jumps } = runLive(g, fixes);
    expect(jumps).toBe(0);
    for (const p of line) expect(Math.abs(toXY(g, p)[1])).toBeLessThan(1);
  });

  it("inversione a U a metà strada: torna indietro sulla stessa strada, senza giri dell'isolato", () => {
    // strada est-ovest con un isolato a nord (giro lungo possibile)
    const g = graphOf([
      way([[0, 0], [100, 0], [300, 0]]),
      way([[0, 0], [0, 80], [300, 80], [300, 0]]),
    ]);
    const fixes = drive([[10, 0], [180, 0], [20, 0]]);
    const { line, jumps } = runLive(g, fixes);
    expect(jumps).toBe(0);
    const ys = line.map((p) => toXY(g, p)[1]);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(1); // mai sull'isolato
    const xs = line.map((p) => toXY(g, p)[0]);
    expect(Math.max(...xs)).toBeGreaterThan(165);
    expect(xs[xs.length - 1]).toBeLessThan(35);
  });

  it("inversione in fondo a una laterale e ritorno: niente corsa fino al vicolo cieco", () => {
    // laterale cieca lunga 120 m verso sud; l'auto entra per 50 m e torna
    const g = graphOf([way([[-100, 0], [0, 0], [100, 0]]), way([[0, 0], [0, -120]])]);
    const fixes = drive([[-80, 0], [0, 0], [0, -50], [0, 0], [80, 0]]);
    const { line, jumps } = runLive(g, fixes);
    expect(jumps).toBe(0);
    expect(Math.min(...line.map((p) => toXY(g, p)[1]))).toBeGreaterThan(-60);
  });

  it("carreggiate separate a senso unico: prende quella del verso di marcia", () => {
    // y=0 solo verso est, y=12 solo verso ovest; il GPS va verso ovest a metà (y=6)
    const g = graphOf([way([[0, 0], [400, 0]], 1), way([[0, 12], [400, 12]], -1)]);
    const fixes = drive([[390, 6], [10, 6]]);
    const { line } = runLive(g, fixes);
    for (const p of line) expect(toXY(g, p)[1]).toBeGreaterThan(11);
  });

  it("dal vivo conferma solo i fix vecchi di almeno 4 s; il resto è provvisorio", () => {
    const g = graphOf([way([[0, 0], [500, 0]])]);
    const m = new RoadMatcher(g, { lagMs: 4000 });
    let last = { committed: [] as MatchPoint[], provisional: [] as MatchPoint[] };
    const fixes = drive([[0, 0], [200, 0]], 10);
    const committed: MatchPoint[] = [];
    for (const f of fixes) {
      last = m.push(f);
      committed.push(...last.committed);
    }
    const tLast = fixes[fixes.length - 1].t;
    expect(Math.max(...committed.map((p) => p[2]))).toBeLessThanOrEqual(tLast - 4000);
    expect(last.provisional[last.provisional.length - 1][2]).toBe(tLast);
    // la provvisoria parte dall'ultimo punto confermato: nessun buco
    expect(last.provisional[0]).toEqual(committed[committed.length - 1]);
  });

  it("dal vivo con 4 s e fine guida danno la stessa linea", () => {
    const g = graphOf([
      way([[0, 0], [200, 0], [400, 0]]),
      way([[200, 0], [200, 200]]),
      way([[0, 15], [400, 15]]),
    ]);
    const fixes = drive([[10, 0], [200, 0], [200, 180]], 8, (i) => [i % 3, (i % 5) - 2]);
    const live = runLive(g, fixes).line.map((p) => toXY(g, p).map(Math.round));
    const end = runLive(g, fixes, Infinity).line.map((p) => toXY(g, p).map(Math.round));
    expect(live).toEqual(end);
  });

  it("fuori dalle strade (piazzale) il punto resta grezzo", () => {
    const g = graphOf([way([[0, 0], [100, 0]])]);
    const track = [ll(10, 0), ll(50, 0), ll(60, 80), ll(90, 0)].map(([lat, lng], i) => [lat, lng, i * 5000] as [number, number, number]);
    const out = matchTrack(g, track);
    expect(out.some((p) => Math.abs(toXY(g, p)[1] - 80) < 1)).toBe(true);
  });
});

describe("REG-722 fine guida con la calamita", () => {
  it("buildCleanTrack aggancia alle strade OSM senza chiamare Google", async () => {
    const { buildCleanTrack } = await import("@/lib/autoscuole/road/clean-track");
    const g = graphOf([way([[-100, 0], [1000, 0]])]);
    const fetchSnap = jest.fn();
    const pts = drive([[0, 4], [800, 4]], 10).map((f) => [f.t, f.lat, f.lng, 10, 90, 5] as [number, number, number, number, number, number]);
    const t = await buildCleanTrack(pts, { osmGraph: async () => g, fetchSnap });
    expect(fetchSnap).not.toHaveBeenCalled();
    expect(t.snapped).toBe(true);
    expect(t.source).toBe("osm");
    for (const p of t.path) expect(Math.abs(g.toXY(p[0], p[1])[1])).toBeLessThan(0.5);
  });
});
