import { OSM_CELLS_VERSION, cellsForTrack, decodeCell } from "@/lib/autoscuole/road/osm-cells";
import { RoadGraph, RoadMatcher, type MatchPoint } from "@/lib/autoscuole/road/osm-match";

/**
 * REG-722 — «Dal vivo»: la linea di ogni auto agganciata alle strade OSM nel
 * browser, con la stessa calamita del telefono e della fine guida (ritardo di
 * 4 s: la parte provvisoria in coda può ancora cambiare). Le celle si
 * scaricano una volta (`/api/autoscuole/road/osm/v1/<cella>`); una zona senza
 * celle resta grezza.
 */

type LngLat = [number, number];
type Entry = { m: RoadMatcher; committed: LngLat[]; provisional: LngLat[]; prev: [number, number, number] | null };

const toLngLat = (p: MatchPoint): LngLat => [p[1], p[0]];

export class LiveSnap {
  private graph: RoadGraph | null = null;
  private cells = new Map<string, Promise<void>>();
  private entries = new Map<string, Entry>();

  private loadCells(points: Array<[number, number, number]>) {
    const graph = (this.graph ??= new RoadGraph(points[0][0], points[0][1]));
    const jobs = cellsForTrack(points).map((key) => {
      let job = this.cells.get(key);
      if (!job) {
        job = fetch(`/api/autoscuole/road/osm/v${OSM_CELLS_VERSION}/${key}`)
          .then(async (res) => {
            if (res.ok) graph.addWays(decodeCell(key, new Uint8Array(await res.arrayBuffer())));
          })
          .catch(() => {
            this.cells.delete(key); // rete: si riprova al giro dopo
          });
        this.cells.set(key, job);
      }
      return job;
    });
    return Promise.all(jobs);
  }

  /** Punti nuovi della guida ([lat, lng, tMs], in ordine). */
  async feed(sessionId: string, points: Array<[number, number, number]>) {
    if (!points.length) return;
    await this.loadCells(points);
    let e = this.entries.get(sessionId);
    if (!e) {
      e = { m: new RoadMatcher(this.graph!), committed: [], provisional: [], prev: null };
      this.entries.set(sessionId, e);
    }
    for (const p of points) {
      let heading: number | null = null;
      let speed: number | null = null;
      if (e.prev) {
        const [ax, ay] = this.graph!.toXY(e.prev[0], e.prev[1]);
        const [bx, by] = this.graph!.toXY(p[0], p[1]);
        const d = Math.hypot(bx - ax, by - ay);
        const dt = (p[2] - e.prev[2]) / 1000;
        if (d > 3 && dt > 0) {
          heading = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
          speed = d / dt;
        }
      }
      const u = e.m.push({ t: p[2], lat: p[0], lng: p[1], heading, speed });
      for (const c of u.committed) e.committed.push(toLngLat(c));
      e.provisional = u.provisional.map(toLngLat);
      e.prev = p;
    }
  }

  /** La linea da disegnare (confermata + provvisoria), o null se non ancora agganciata. */
  line(sessionId: string): LngLat[] | null {
    const e = this.entries.get(sessionId);
    if (!e || e.committed.length + e.provisional.length < 2) return null;
    // la provvisoria parte dall'ultimo punto confermato (se agganciato): niente doppione
    const tail = e.committed.at(-1);
    const first = e.provisional[0];
    const skip = tail && first && tail[0] === first[0] && tail[1] === first[1] ? 1 : 0;
    return [...e.committed, ...e.provisional.slice(skip)];
  }

  drop(sessionId: string) {
    this.entries.delete(sessionId);
  }
}
