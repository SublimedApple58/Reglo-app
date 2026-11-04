import type { OsmWay } from "@/lib/autoscuole/road/osm-cells";

/**
 * REG-722 Reglo Road — la «calamita»: aggancia la posizione GPS alle strade di
 * OpenStreetMap, senza chiamate a pagamento.
 *
 * Modello di Markov nascosto (come i navigatori): per ogni fix le strade entro
 * 30 m sono i candidati; vince la sequenza più probabile, che tiene conto di
 * - distanza del fix dalla strada (σ 5 m);
 * - direzione di marcia rispetto al verso della strada (sensi unici compresi:
 *   ogni verso percorribile è un arco a sé);
 * - continuità: fra due fix la strada percorsa sul grafo deve essere lunga
 *   quanto la distanza in linea d'aria. Saltare su una parallela non collegata
 *   (controviale, sopraelevata, galleria) costa un giro lungo, quindi perde;
 * - inversione a U sulla stessa strada: ammessa, con una penalità di 25 m
 *   (misura REG-722 sulla guida reale: senza, la linea faceva il giro
 *   dell'isolato).
 *
 * Dal vivo un fix si «conferma» solo 4 s dopo (`lagMs`): fino ad allora la
 * linea è provvisoria e può cambiare (la mobile la disegna in dissolvenza). Con
 * 4 s di ritardo la linea dal vivo coincide con quella di fine guida (misura
 * della fase 0); senza ritardo sbaglia per un attimo agli incroci.
 *
 * Puro (niente rete): lo usano il server (fine guida), la web («Dal vivo») e,
 * copiato, la mobile (`reglo-mobile/src/road/osmMatch.ts`).
 */

export const MATCH_RADIUS_M = 30;
export const MATCH_SIGMA_M = 5;
export const MATCH_BETA_M = 6;
export const UTURN_PENALTY_M = 25;
export const LIVE_LAG_MS = 4000;
/** Fix più vicini di così al precedente non aggiungono niente (auto ferma). */
const MIN_STEP_M = 5;
const GRID_M = 50;
const MAX_CANDIDATES = 8;
/** Arretrare di poco sulla stessa strada è rumore del GPS, non un'inversione. */
const BACK_NOISE_M = 6;

export type MatchFix = { t: number; lat: number; lng: number; speed?: number | null; heading?: number | null };
/** Punto della linea agganciata: [lat, lng, tMs]. */
export type MatchPoint = [number, number, number];

// ---------- grafo ----------

export class RoadGraph {
  readonly lat0: number;
  readonly lng0: number;
  private kx: number;
  private ky = 110_574;
  private nodeIds = new Map<string, number>();
  nx: number[] = [];
  ny: number[] = [];
  nlat: number[] = [];
  nlng: number[] = [];
  out: number[][] = [];
  eu: number[] = [];
  ev: number[] = [];
  elen: number[] = [];
  ehead: number[] = [];
  erev: number[] = [];
  private grid = new Map<string, number[]>();
  private ways = new Set<number>();

  constructor(lat0: number, lng0: number) {
    this.lat0 = lat0;
    this.lng0 = lng0;
    this.kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  }

  get edgeCount() {
    return this.eu.length;
  }

  hasWay(id: number) {
    return this.ways.has(id);
  }

  toXY(lat: number, lng: number): [number, number] {
    return [(lng - this.lng0) * this.kx, (lat - this.lat0) * this.ky];
  }

  toLatLng(x: number, y: number): [number, number] {
    return [round6(this.lat0 + y / this.ky), round6(this.lng0 + x / this.kx)];
  }

  private node(lat: number, lng: number): number {
    const k = `${Math.round(lat * 1e6)},${Math.round(lng * 1e6)}`;
    let id = this.nodeIds.get(k);
    if (id == null) {
      id = this.nx.length;
      this.nodeIds.set(k, id);
      const [x, y] = this.toXY(lat, lng);
      this.nx.push(x); this.ny.push(y); this.nlat.push(lat); this.nlng.push(lng); this.out.push([]);
    }
    return id;
  }

  private edge(u: number, v: number): number {
    const e = this.eu.length;
    this.eu.push(u); this.ev.push(v);
    const dx = this.nx[v] - this.nx[u], dy = this.ny[v] - this.ny[u];
    this.elen.push(Math.hypot(dx, dy));
    this.ehead.push(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
    this.erev.push(-1);
    this.out[u].push(e);
    const x0 = Math.min(this.nx[u], this.nx[v]), x1 = Math.max(this.nx[u], this.nx[v]);
    const y0 = Math.min(this.ny[u], this.ny[v]), y1 = Math.max(this.ny[u], this.ny[v]);
    for (let gx = Math.floor(x0 / GRID_M); gx <= Math.floor(x1 / GRID_M); gx++) {
      for (let gy = Math.floor(y0 / GRID_M); gy <= Math.floor(y1 / GRID_M); gy++) {
        const key = `${gx},${gy}`;
        const list = this.grid.get(key);
        if (list) list.push(e);
        else this.grid.set(key, [e]);
      }
    }
    return e;
  }

  /** Aggiunge strade (quelle già presenti, per id, si saltano). */
  addWays(ways: OsmWay[]) {
    for (const w of ways) {
      if (this.ways.has(w.id)) continue;
      this.ways.add(w.id);
      const ids: number[] = [];
      for (let k = 0; k < w.pts.length; k += 2) ids.push(this.node(w.pts[k], w.pts[k + 1]));
      for (let k = 0; k + 1 < ids.length; k++) {
        const a = ids[k], b = ids[k + 1];
        if (a === b) continue;
        const f = w.oneway !== -1 ? this.edge(a, b) : -1;
        const r = w.oneway !== 1 ? this.edge(b, a) : -1;
        if (f >= 0 && r >= 0) { this.erev[f] = r; this.erev[r] = f; }
      }
    }
  }

  /** Archi entro `radius` metri dal punto, i più vicini prima. */
  candidates(x: number, y: number, radius = MATCH_RADIUS_M): Cand[] {
    const seen = new Set<number>();
    const res: Cand[] = [];
    const r = Math.ceil(radius / GRID_M);
    const gx0 = Math.floor(x / GRID_M), gy0 = Math.floor(y / GRID_M);
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
      for (let gy = gy0 - r; gy <= gy0 + r; gy++) {
        for (const e of this.grid.get(`${gx},${gy}`) ?? []) {
          if (seen.has(e)) continue;
          seen.add(e);
          const c = this.project(e, x, y);
          if (c.d <= radius) res.push(c);
        }
      }
    }
    res.sort((a, b) => a.d - b.d);
    return res.slice(0, MAX_CANDIDATES);
  }

  project(e: number, x: number, y: number): Cand {
    const u = this.eu[e], v = this.ev[e];
    const ax = this.nx[u], ay = this.ny[u];
    const dx = this.nx[v] - ax, dy = this.ny[v] - ay;
    const l2 = dx * dx + dy * dy || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const px = ax + f * dx, py = ay + f * dy;
    return { e, f, x: px, y: py, d: Math.hypot(x - px, y - py) };
  }

  /**
   * Come si arriva a un candidato `b`: dal nodo d'inizio del suo arco, più il
   * tratto fino al punto; oppure (strada a doppio senso) dal nodo opposto sul
   * verso contrario, fino al punto, e lì inversione a U.
   */
  private arrivals(b: Cand): Array<{ node: number; extra: number; uturn: boolean }> {
    const out = [{ node: this.eu[b.e], extra: b.f * this.elen[b.e], uturn: false }];
    if (this.erev[b.e] >= 0) out.push({ node: this.ev[b.e], extra: (1 - b.f) * this.elen[b.e] + UTURN_PENALTY_M, uturn: true });
    return out;
  }

  /**
   * Partenze del Dijkstra da un candidato: avanti fino alla fine dell'arco, oppure
   * (se la strada è a doppio senso) inversione a U lì dove si trova, con la penalità.
   */
  private starts(a: Cand): { dist: Map<number, number>; heap: MinHeap } {
    const dist = new Map<number, number>();
    const heap = new MinHeap();
    const fwd = this.ev[a.e];
    dist.set(fwd, (1 - a.f) * this.elen[a.e]);
    heap.push(dist.get(fwd)!, fwd);
    if (this.erev[a.e] >= 0) {
      const back = this.eu[a.e];
      const d = a.f * this.elen[a.e] + UTURN_PENALTY_M;
      if (d < (dist.get(back) ?? Infinity)) { dist.set(back, d); heap.push(d, back); }
    }
    return { dist, heap };
  }

  /** Distanza diretta (senza grafo) quando `a` e `b` stanno sulla stessa strada, o null. */
  private sameRoad(a: Cand, b: Cand): number | null {
    if (b.e === a.e) {
      const back = (a.f - b.f) * this.elen[a.e];
      if (back <= 0) return -back;
      if (back <= BACK_NOISE_M) return 0;
    }
    // inversione a U sulla stessa strada
    if (b.e === this.erev[a.e]) return Math.abs(1 - b.f - a.f) * this.elen[a.e] + UTURN_PENALTY_M;
    return null;
  }

  /**
   * Dijkstra limitato a `limit` metri da `a` verso più arrivi. Restituisce, per
   * ogni arrivo, la distanza totale (o null) e i predecessori per ricostruire.
   */
  private search(a: Cand, goals: Array<{ node: number; extra: number }>, limit: number) {
    const best = goals.map(() => null as number | null);
    const byNode = new Map<number, number[]>();
    goals.forEach((g, i) => {
      const l = byNode.get(g.node);
      if (l) l.push(i);
      else byNode.set(g.node, [i]);
    });
    let left = byNode.size;
    const { dist, heap } = this.starts(a);
    const prev = new Map<number, number>();
    const done = new Set<number>();
    while (heap.size && left > 0) {
      const [d, n] = heap.pop();
      if (d > limit) break;
      if (done.has(n)) continue;
      done.add(n);
      const idx = byNode.get(n);
      if (idx) {
        for (const i of idx) best[i] = d + goals[i].extra;
        left--;
      }
      for (const e of this.out[n]) {
        const m = this.ev[e];
        const nd = d + this.elen[e];
        if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, n); heap.push(nd, m); }
      }
    }
    return { best, prev };
  }

  /**
   * Distanza sul grafo da `a` a ogni candidato di `targets` (limite `limit`
   * metri). `null` = non raggiungibile entro il limite.
   */
  routeDistances(a: Cand, targets: Cand[], limit: number): Array<number | null> {
    const res: Array<number | null> = targets.map(() => null);
    const goals: Array<{ node: number; extra: number; i: number }> = [];
    targets.forEach((b, i) => {
      const direct = this.sameRoad(a, b);
      if (direct != null) { res[i] = direct; return; }
      for (const g of this.arrivals(b)) goals.push({ ...g, i });
    });
    if (!goals.length) return res;
    const { best } = this.search(a, goals, limit);
    best.forEach((d, k) => {
      if (d == null) return;
      const i = goals[k].i;
      res[i] = res[i] == null ? d : Math.min(res[i]!, d);
    });
    return res;
  }

  /** I nodi della strada più breve da `a` a `b` (esclusi i due punti), o null. */
  routeNodes(a: Cand, b: Cand, limit: number): number[] | null {
    if (this.sameRoad(a, b) != null) return [];
    const goals = this.arrivals(b);
    const { best, prev } = this.search(a, goals, limit);
    let k = -1;
    best.forEach((d, i) => { if (d != null && (k < 0 || d < best[k]!)) k = i; });
    if (k < 0) return null;
    const path = [goals[k].node];
    while (prev.has(path[path.length - 1])) path.push(prev.get(path[path.length - 1])!);
    return path.reverse();
  }
}

export type Cand = { e: number; f: number; x: number; y: number; d: number };

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------- aggancio ----------

type Layer = {
  t: number;
  x: number;
  y: number;
  /** null = nessuna strada entro 30 m: il punto resta grezzo. */
  cands: Cand[] | null;
  score: number[];
  /** Indice del candidato precedente; -1 = qui si riparte (inizio o rottura). */
  back: number[];
};

export type MatchUpdate = {
  /** Punti nuovi, definitivi, da aggiungere in coda alla linea confermata. */
  committed: MatchPoint[];
  /** La parte provvisoria (ultimi ~4 s), dall'ultimo punto confermato all'auto. */
  provisional: MatchPoint[];
};

const NEG = -1e18;

/**
 * Aggancio passo passo. `push` a ogni fix; `finish` a fine traccia conferma
 * tutto. Con `lagMs: Infinity` e solo `finish` è l'aggancio di fine guida
 * (Viterbi su tutta la traccia).
 */
export class RoadMatcher {
  private layers: Layer[] = [];
  /** Indice (in `layers`) del primo strato non ancora confermato. */
  private next = 0;
  /** Candidato confermato dell'ultimo strato confermato (per unire con la strada). */
  private lastCommitted: { cand: Cand | null; t: number } | null = null;
  private lastFix: { x: number; y: number } | null = null;
  readonly lagMs: number;
  /** Punti confermati su una strada non collegata alla precedente (salti). */
  jumps = 0;

  constructor(private graph: RoadGraph, opts: { lagMs?: number } = {}) {
    this.lagMs = opts.lagMs ?? LIVE_LAG_MS;
  }

  push(fix: MatchFix): MatchUpdate {
    const [x, y] = this.graph.toXY(fix.lat, fix.lng);
    if (!this.lastFix || Math.hypot(x - this.lastFix.x, y - this.lastFix.y) >= MIN_STEP_M) {
      this.lastFix = { x, y };
      this.addLayer(fix, x, y);
    }
    const committed = this.commitUntil(fix.t - this.lagMs);
    return { committed, provisional: this.provisional() };
  }

  /** Conferma tutto quello che resta (fine guida o fine traccia). */
  finish(): MatchPoint[] {
    return this.commitUntil(Infinity);
  }

  private emission(c: Cand, fix: MatchFix): number {
    let lp = -0.5 * (c.d / MATCH_SIGMA_M) ** 2;
    const h = fix.heading;
    if (h != null && h >= 0 && (fix.speed ?? 0) > 2) {
      const dh = Math.abs(((this.graph.ehead[c.e] - h + 540) % 360) - 180);
      lp -= (dh / 45) ** 2;
    }
    return lp;
  }

  private addLayer(fix: MatchFix, x: number, y: number) {
    const cands = this.graph.candidates(x, y);
    const prev = this.layers[this.layers.length - 1];
    if (!cands.length) {
      this.layers.push({ t: fix.t, x, y, cands: null, score: [], back: [] });
      return;
    }
    const em = cands.map((c) => this.emission(c, fix));
    if (!prev || !prev.cands) {
      this.layers.push({ t: fix.t, x, y, cands, score: em, back: cands.map(() => -1) });
      return;
    }
    const gc = Math.hypot(x - prev.x, y - prev.y);
    const limit = 2 * gc + 150;
    const score = cands.map(() => NEG);
    const back = cands.map(() => -1);
    prev.cands.forEach((pc, j) => {
      if (prev.score[j] <= NEG) return;
      const rd = this.graph.routeDistances(pc, cands, limit);
      rd.forEach((d, i) => {
        if (d == null) return;
        const s = prev.score[j] - Math.abs(d - gc) / MATCH_BETA_M + em[i];
        if (s > score[i]) { score[i] = s; back[i] = j; }
      });
    });
    if (Math.max(...score) <= NEG) {
      // nessun collegamento plausibile: si riparte da qui
      this.layers.push({ t: fix.t, x, y, cands, score: em, back: cands.map(() => -1) });
      return;
    }
    // normalizza per non perdere precisione su guide lunghe
    const top = Math.max(...score);
    this.layers.push({ t: fix.t, x, y, cands, score: score.map((s) => (s <= NEG ? NEG : s - top)), back });
  }

  /** Il candidato scelto per ogni strato da `from` in poi, risalendo dal migliore in fondo. */
  private bestChain(from: number): Array<number | null> {
    const n = this.layers.length;
    const out: Array<number | null> = new Array(n - from).fill(null);
    let i = n - 1;
    let k: number | null = null;
    while (i >= from) {
      const L = this.layers[i];
      if (!L.cands) { out[i - from] = null; k = null; i--; continue; }
      if (k == null || k < 0) k = argmax(L.score);
      out[i - from] = k;
      const b: number = L.back[k];
      k = b >= 0 ? b : null;
      i--;
    }
    return out;
  }

  private commitUntil(tMax: number): MatchPoint[] {
    let end = this.next;
    while (end < this.layers.length && this.layers[end].t <= tMax) end++;
    if (end === this.next) return [];
    const chain = this.bestChain(this.next);
    const out: MatchPoint[] = [];
    for (let i = this.next; i < end; i++) {
      const L = this.layers[i];
      const k = chain[i - this.next];
      const cand = L.cands && k != null ? L.cands[k] : null;
      out.push(...this.join(this.lastCommitted, cand, L, true));
      this.lastCommitted = { cand, t: L.t };
    }
    this.next = end;
    // gli strati confermati servono solo come ultimo «precedente»
    if (this.next > 1) {
      this.layers.splice(0, this.next - 1);
      this.next = 1;
    }
    return out;
  }

  /** Punti da aggiungere per andare dal confermato precedente a questo strato. */
  private join(prev: { cand: Cand | null; t: number } | null, cand: Cand | null, L: Layer, counting = false): MatchPoint[] {
    const g = this.graph;
    if (!cand) {
      const [lat, lng] = g.toLatLng(L.x, L.y);
      return [[lat, lng, L.t]];
    }
    const here = g.toLatLng(cand.x, cand.y);
    if (!prev?.cand) return [[here[0], here[1], L.t]];
    const gc = Math.hypot(cand.x - prev.cand.x, cand.y - prev.cand.y);
    const route = g.routeNodes(prev.cand, cand, 2 * gc + 150);
    if (!route && counting) this.jumps++;
    const nodes = route ?? [];
    // inversione a U sulla stessa strada: niente nodi, la linea torna indietro sulla strada
    const pts: Array<[number, number]> = [];
    for (const n of nodes) pts.push([g.nx[n], g.ny[n]]);
    pts.push([cand.x, cand.y]);
    // tempi interpolati sulla lunghezza
    let total = 0;
    let px = prev.cand.x, py = prev.cand.y;
    const lens = pts.map(([x, y]) => { total += Math.hypot(x - px, y - py); px = x; py = y; return total; });
    return pts.map(([x, y], k) => {
      const [lat, lng] = g.toLatLng(x, y);
      const t = total > 0 ? Math.round(prev.t + ((L.t - prev.t) * lens[k]) / total) : L.t;
      return [lat, lng, t] as MatchPoint;
    });
  }

  private provisional(): MatchPoint[] {
    if (this.next >= this.layers.length) return [];
    const chain = this.bestChain(this.next);
    const out: MatchPoint[] = [];
    let prev = this.lastCommitted;
    if (prev?.cand) {
      const p = this.graph.toLatLng(prev.cand.x, prev.cand.y);
      out.push([p[0], p[1], prev.t]);
    }
    for (let i = this.next; i < this.layers.length; i++) {
      const L = this.layers[i];
      const k = chain[i - this.next];
      const cand = L.cands && k != null ? L.cands[k] : null;
      out.push(...this.join(prev, cand, L));
      prev = { cand, t: L.t };
    }
    return out;
  }
}

/** Aggancio di una traccia intera (fine guida): Viterbi su tutto. */
export function matchTrack(graph: RoadGraph, track: Array<[number, number, number]>): MatchPoint[] {
  const m = new RoadMatcher(graph, { lagMs: Infinity });
  let prev: [number, number, number] | null = null;
  for (const p of track) {
    let heading: number | null = null;
    let speed: number | null = null;
    if (prev) {
      const [ax, ay] = graph.toXY(prev[0], prev[1]);
      const [bx, by] = graph.toXY(p[0], p[1]);
      const d = Math.hypot(bx - ax, by - ay);
      const dt = (p[2] - prev[2]) / 1000;
      if (d > 3 && dt > 0) {
        heading = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
        speed = d / dt;
      }
    }
    m.push({ t: p[2], lat: p[0], lng: p[1], heading, speed });
    prev = p;
  }
  return m.finish();
}

function argmax(xs: number[]): number {
  let k = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[k]) k = i;
  return k;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
