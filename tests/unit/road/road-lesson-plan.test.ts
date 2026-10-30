import type { Hotspot, HotspotMarker } from "@/lib/autoscuole/road/hotspots";
import {
  buildLessonPlan,
  assignChecks,
  buildStudentHotspots,
  examRouteCoverage,
  hotspotStatus,
  planCandidates,
  samplePath,
  studentErrorKinds,
  COVERAGE_DONE,
  PLAN_STOP_MINUTES,
  type HotspotCheck,
  type LessonPlanInput,
  type StudentHotspot,
} from "@/lib/autoscuole/road/lesson-plan";
import type { LatLng } from "@/lib/autoscuole/road/exam-routes";

// Torino; ~111 m per 0,001° di latitudine.
const BASE = { lat: 45.07, lng: 7.68 };
let seq = 0;
function m(over: Partial<HotspotMarker> & { dLat?: number; session?: string }): HotspotMarker {
  seq++;
  return {
    id: `m${String(seq).padStart(3, "0")}`,
    sessionId: over.session ?? "s1",
    studentId: "me",
    kind: over.kind ?? "precedenza",
    label: over.label ?? "Precedenza",
    lat: BASE.lat + (over.dLat ?? 0),
    lng: over.lng ?? BASE.lng,
    street: over.street === undefined ? "Via Roma" : over.street,
    recordedAt: over.recordedAt ?? new Date(Date.UTC(2026, 9, 1, 10, 0, seq)),
    note: over.note ?? null,
  };
}

const sh = (over: Partial<StudentHotspot> & { dLat?: number }): StudentHotspot => ({
  key: `precedenza~${over.dLat ?? 0}`,
  kind: "precedenza",
  label: "Precedenza",
  lat: BASE.lat + (over.dLat ?? 0),
  lng: BASE.lng,
  street: "Via Roma",
  errors: 3,
  sessions: 2,
  lastAt: "2026-10-20T10:00:00.000Z",
  note: null,
  checks: { better: 0, worse: 0 },
  lastCheck: null,
  status: "open",
  ...over,
});

let checkSeq = 0;
const chk = (over: Partial<HotspotCheck> & { dLat?: number; day?: number }): HotspotCheck => ({
  id: `c${++checkSeq}`,
  kind: "precedenza",
  lat: BASE.lat + (over.dLat ?? 0),
  lng: BASE.lng,
  outcome: "better",
  recordedAt: new Date(Date.UTC(2026, 9, over.day ?? 10, 10)),
  ...over,
});

const school = (over: Partial<Hotspot> & { dLat?: number }): Hotspot => ({
  key: `${over.kind ?? "stop"}~school~${over.dLat ?? 0}`,
  kind: "stop",
  label: "Stop",
  lat: BASE.lat + (over.dLat ?? 0),
  lng: BASE.lng,
  street: "Corso Francia",
  errors: 7,
  students: 4,
  sessions: 6,
  lastAt: "2026-10-21T10:00:00.000Z",
  examRoutes: [],
  ...over,
});

const line = (dLatFrom: number, dLatTo: number, lng = BASE.lng): LatLng[] => [
  [BASE.lat + dLatFrom, lng],
  [BASE.lat + dLatTo, lng],
];

const input = (over: Partial<LessonPlanInput>): LessonPlanInput => ({
  durationMin: 60,
  start: { lat: BASE.lat, lng: BASE.lng },
  studentHotspots: [],
  studentKinds: [],
  schoolHotspots: [],
  examRoutes: [],
  ...over,
});

describe("Reglo Road — giro: punti critici dell'allievo", () => {
  it("tiene solo gli errori ripetuti in almeno 2 guide", () => {
    // Tre errori nella stessa guida: non è un punto ripetuto.
    expect(buildStudentHotspots([m({ session: "s1" }), m({ session: "s1" }), m({ session: "s1" })])).toEqual([]);
    const hs = buildStudentHotspots([
      m({ session: "s1" }),
      m({ session: "s2", dLat: 0.0003, street: "Corso Vittorio" }), // ~33 m: stesso punto
      m({ session: "s2", dLat: 0.01 }), // ~1,1 km: altro punto, una guida sola
    ]);
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({ kind: "precedenza", errors: 2, sessions: 2 });
  });

  it("tipi di errore dal più frequente", () => {
    expect(studentErrorKinds([m({ kind: "stop" }), m({ kind: "precedenza" }), m({ kind: "precedenza" })])).toEqual([
      "precedenza",
      "stop",
    ]);
  });
});

describe("Reglo Road — ripasso sui punti critici (REG-677)", () => {
  const ev = (type: "error" | "better", day: number) => ({ type, at: Date.UTC(2026, 9, day) });

  it("stato dalla coda dopo l'ultimo errore: 0 open, 1 improving, ≥2 overcome", () => {
    expect(hotspotStatus([])).toBe("open");
    expect(hotspotStatus([ev("error", 1)])).toBe("open");
    expect(hotspotStatus([ev("error", 1), ev("better", 2)])).toBe("improving");
    expect(hotspotStatus([ev("better", 3), ev("error", 1), ev("better", 2)])).toBe("overcome");
    // Un errore (segnalazione o «No») dopo i «Meglio» riapre il punto.
    expect(hotspotStatus([ev("error", 1), ev("better", 2), ev("better", 3), ev("error", 4)])).toBe("open");
    expect(hotspotStatus([ev("error", 1), ev("better", 2), ev("better", 3), ev("error", 4), ev("better", 5)])).toBe("improving");
    // A pari istante l'errore conta dopo.
    expect(hotspotStatus([ev("better", 2), ev("better", 3), ev("error", 3)])).toBe("open");
  });

  it("ogni ripasso va al punto più vicino dello stesso tipo, entro 60 m", () => {
    const near = { kind: "precedenza", lat: BASE.lat, lng: BASE.lng };
    const close = { kind: "precedenza", lat: BASE.lat + 0.0004, lng: BASE.lng }; // ~44 m
    const other = { kind: "stop", lat: BASE.lat, lng: BASE.lng };
    const a = chk({ dLat: 0.0003 }); // più vicino a `close`
    const b = chk({ dLat: 0 });
    const c = chk({ dLat: 0.01 }); // lontano da tutti
    const d = chk({ kind: "rotonda" }); // tipo che non c'è
    const out = assignChecks([near, close, other], [a, b, c, d]);
    expect(out.get(near)).toEqual([b]);
    expect(out.get(close)).toEqual([a]);
    expect(out.get(other)).toEqual([]);
  });

  it("buildStudentHotspots: nota più recente, conteggi, ultimo ripasso e stato", () => {
    const markers = [
      m({ session: "s1", note: "Guarda a destra", recordedAt: new Date(Date.UTC(2026, 9, 1)) }),
      m({ session: "s2", note: "   ", recordedAt: new Date(Date.UTC(2026, 9, 3)) }),
      m({ session: "s3", note: "Rallenta prima", recordedAt: new Date(Date.UTC(2026, 9, 2)) }),
    ];
    const base = buildStudentHotspots(markers);
    expect(base[0]).toMatchObject({ note: "Rallenta prima", checks: { better: 0, worse: 0 }, lastCheck: null, status: "open" });

    const one = buildStudentHotspots(markers, [chk({ day: 5 }), chk({ day: 4, outcome: "worse" })]);
    expect(one[0]).toMatchObject({
      checks: { better: 1, worse: 1 },
      lastCheck: { outcome: "better", at: new Date(Date.UTC(2026, 9, 5, 10)).toISOString() },
      status: "improving",
    });
    const two = buildStudentHotspots(markers, [chk({ day: 5 }), chk({ day: 6 })]);
    expect(two[0].status).toBe("overcome");
    // «Meglio» precedenti all'ultimo errore non contano.
    expect(buildStudentHotspots(markers, [chk({ day: 1 }), chk({ day: 2 })])[0].status).toBe("open");
  });

  it("un punto superato non diventa una tappa né lascia il posto al punto dell'autoscuola lì vicino", () => {
    const c = planCandidates(
      input({
        studentHotspots: [sh({ key: "superato", status: "overcome" }), sh({ key: "aperto", dLat: 0.01, status: "improving" })],
        studentKinds: ["precedenza"],
        schoolHotspots: [school({ kind: "precedenza", label: "Precedenza", dLat: 0.0002 })],
      }),
    );
    expect(c.map((x) => x.key)).toEqual(["aperto"]);
  });
});

describe("Reglo Road — giro: copertura dei percorsi d'esame", () => {
  it("campiona la linea ogni 10 m", () => {
    const s = samplePath(line(0, 0.001)); // ~111 m
    expect(s.length).toBeGreaterThanOrEqual(11);
    expect(s[0]).toEqual([BASE.lat, BASE.lng]);
    expect(s[s.length - 1]).toEqual([BASE.lat + 0.001, BASE.lng]);
  });

  it("conta la parte del percorso passata entro 30 m", () => {
    const route = line(0, 0.002); // ~222 m
    expect(examRouteCoverage(route, [])).toBe(0);
    // Guida sulla prima metà, 10 m a lato.
    const track: LatLng[] = Array.from({ length: 60 }, (_, i) => [BASE.lat + (i * 0.001) / 60, BASE.lng + 0.00013]);
    const c = examRouteCoverage(route, [track]);
    expect(c).toBeGreaterThan(0.4);
    expect(c).toBeLessThan(0.65);
    // Una guida a 200 m non conta.
    expect(examRouteCoverage(route, [track.map(([la, ln]) => [la, ln + 0.0026] as LatLng)])).toBe(0);
  });
});

describe("Reglo Road — giro: tappe", () => {
  it("priorità: allievo (max 2 se ci sono altre fonti), poi autoscuola, poi percorso d'esame", () => {
    const c = planCandidates(
      input({
        studentHotspots: [sh({ dLat: 0.001 }), sh({ dLat: 0.002 }), sh({ dLat: 0.003 })],
        studentKinds: ["stop"],
        schoolHotspots: [school({ dLat: 0.004 })],
        examRoutes: [{ id: "r1", name: "Percorso Nord", path: line(0.005, 0.006), lengthMeters: 111, coverage: 0.2 }],
      }),
    );
    expect(c.map((x) => x.source)).toEqual(["student", "student", "school"]);
  });

  it("senza altre fonti, fino a 3 tappe dell'allievo", () => {
    const c = planCandidates(input({ studentHotspots: [sh({ dLat: 0.001 }), sh({ dLat: 0.002 }), sh({ dLat: 0.003 })] }));
    expect(c.map((x) => x.source)).toEqual(["student", "student", "student"]);
  });

  it("autoscuola: il punto del suo errore più frequente, non uno già tra le sue tappe", () => {
    const c = planCandidates(
      input({
        studentHotspots: [sh({ dLat: 0 })],
        studentKinds: ["precedenza", "stop"],
        schoolHotspots: [
          school({ kind: "precedenza", label: "Precedenza", dLat: 0.0002 }), // è il suo stesso punto
          school({ kind: "stop", dLat: 0.01 }),
        ],
      }),
    );
    expect(c[1]).toMatchObject({ source: "school", kind: "stop" });
    expect(c[1].reason).toBe("Qui sbagliano in tanti: stop, 7 errori di 4 allievi");
  });

  it("percorso d'esame: il meno coperto, mai uno già fatto", () => {
    const c = planCandidates(
      input({
        examRoutes: [
          { id: "fatto", name: "A", path: line(0, 0.001), lengthMeters: 111, coverage: COVERAGE_DONE },
          { id: "poco", name: "B", path: line(0, 0.001), lengthMeters: 111, coverage: 0.3 },
          { id: "mai", name: "C", path: line(0, 0.001), lengthMeters: 111, coverage: 0 },
        ],
      }),
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ key: "exam:mai", source: "exam", title: "C", reason: "Percorso d'esame mai fatto" });
  });

  it("giro chiuso in sede: a parità comincia dalla più vicina, minuti a 25 km/h", () => {
    const plan = buildLessonPlan(
      input({ end: BASE, studentHotspots: [sh({ key: "lontana", dLat: 0.02 }), sh({ key: "vicina", dLat: 0.005 })] }),
    );
    expect(plan.stops.map((s) => s.key)).toEqual(["vicina", "lontana"]);
    // ~556 m a 25 km/h ≈ 1,3 min → 2.
    expect(plan.stops[0].minutes).toBe(2);
    expect(plan.stops[0].reason).toBe("Precedenza da migliorare 3 volte in 2 guide");
    // Andata 2 + 5 (~1,7 km fra le due) + ritorno in sede 6 (~2,2 km) + lavoro 2×5.
    expect(plan.minutes).toBe(2 + 5 + 6 + 2 * PLAN_STOP_MINUTES);
    // Senza sede il giro finisce all'ultima tappa: niente ritorno.
    expect(buildLessonPlan(input({ studentHotspots: [sh({ key: "vicina", dLat: 0.005 })] })).minutes).toBe(
      2 + PLAN_STOP_MINUTES,
    );
  });

  it("REG-653: l'ordine tiene conto del ritorno in sede", () => {
    // Sede 3,3 km a nord. «Più vicina prima» farebbe nord (333 m) → sud → sede, 4,5 km;
    // conviene sud (444 m) → nord → sede, 4,2 km.
    const plan = buildLessonPlan(
      input({
        durationMin: 120,
        end: { lat: BASE.lat + 0.03, lng: BASE.lng },
        studentHotspots: [sh({ key: "nord", dLat: 0.003 }), sh({ key: "sud", dLat: -0.004 })],
      }),
    );
    expect(plan.stops.map((s) => s.key)).toEqual(["sud", "nord"]);
    // 2 (444 m) + 2 (777 m) + 8 in sede (3 km) + lavoro.
    expect(plan.minutes).toBe(2 + 2 + 8 + 2 * PLAN_STOP_MINUTES);
  });

  it("toglie le tappe meno importanti se il giro non sta nella guida", () => {
    const far = sh({ key: "seconda", dLat: 0.1 }); // ~11 km: 27 min andata e ritorno
    const plan = buildLessonPlan(input({ durationMin: 30, end: BASE, studentHotspots: [sh({ key: "prima", dLat: 0.005 }), far] }));
    expect(plan.stops.map((s) => s.key)).toEqual(["prima"]);
    expect(buildLessonPlan(input({ durationMin: 5, studentHotspots: [sh({ dLat: 0.005 })] }))).toEqual({ stops: [], minutes: 0 });
  });

  it("dopo il percorso d'esame si riparte da dove finisce", () => {
    const plan = buildLessonPlan(
      input({
        durationMin: 120,
        studentHotspots: [sh({ key: "dopo", dLat: 0.021 })],
        examRoutes: [{ id: "r", name: "Nord", path: line(0.001, 0.02), lengthMeters: 2100, coverage: 0 }],
      }),
    );
    expect(plan.stops.map((s) => s.key)).toEqual(["exam:r", "dopo"]);
    expect(plan.stops[1].minutes).toBe(1); // dalla fine del percorso, ~111 m
  });

  it("senza partenza: ordine di priorità, prima tappa a 0 minuti", () => {
    const plan = buildLessonPlan(input({ start: null, studentHotspots: [sh({ key: "a", dLat: 0.02 }), sh({ key: "b", dLat: 0 })] }));
    expect(plan.stops[0]).toMatchObject({ key: "a", minutes: 0 });
  });
});

import {
  computePlanReached,
  parseStoredPlan,
  planRoutePieces,
  planSettings,
  planStart,
  type StoredPlanStop,
} from "@/lib/autoscuole/road/lesson-plan";

const stop = (over: Partial<StoredPlanStop> & { dLat?: number }): StoredPlanStop => ({
  key: over.key ?? `k${over.dLat ?? 0}`,
  source: "student",
  kind: "precedenza",
  title: "Via Roma",
  reason: "Precedenza da migliorare 3 volte in 2 guide",
  lat: BASE.lat + (over.dLat ?? 0),
  lng: BASE.lng,
  minutes: 2,
  examRouteId: null,
  endLat: null,
  endLng: null,
  ...over,
});

describe("Reglo Road — giro: API (REG-648)", () => {
  it("interruttori accesi se assenti", () => {
    expect(planSettings({})).toEqual({ planEnabled: true, planAlertsEnabled: true });
    expect(planSettings({ roadPlanEnabled: false, roadPlanAlertsEnabled: true })).toEqual({
      planEnabled: false,
      planAlertsEnabled: true,
    });
  });

  it("giro dalla mobile: vuoto = senza giro, malformato = undefined, tiene solo i campi noti", () => {
    expect(parseStoredPlan(undefined)).toBeNull();
    expect(parseStoredPlan({ stops: [] })).toBeNull();
    expect(parseStoredPlan({ stops: "x" })).toBeUndefined();
    expect(parseStoredPlan({ stops: [stop({}), stop({}), stop({}), stop({})] })).toBeUndefined();
    expect(parseStoredPlan({ stops: [{ ...stop({}), lat: 200 }] })).toBeUndefined();
    expect(parseStoredPlan({ stops: [{ ...stop({ source: "exam" }) }] })).toBeUndefined(); // senza percorso
    const now = new Date("2026-10-29T10:00:00Z");
    const p = parseStoredPlan({ stops: [{ ...stop({ key: "a" }), extra: "via" }], minutes: 17.4 }, now)!;
    expect(p).toEqual({ stops: [stop({ key: "a" })], minutes: 17, chosenAt: now.toISOString() });
  });

  it("tappe raggiunte: entro 40 m; percorso d'esame coperto almeno al 60%", () => {
    const track: LatLng[] = Array.from({ length: 100 }, (_, i) => [BASE.lat + (i * 0.002) / 100, BASE.lng]);
    const exam = stop({ key: "exam:r", source: "exam", examRouteId: "r", endLat: BASE.lat + 0.002, endLng: BASE.lng });
    const r = computePlanReached(
      [stop({ key: "sulla", dLat: 0.001 }), stop({ key: "lontana", dLat: 0.01 }), exam],
      track,
      new Map([["r", line(0, 0.002)]]),
    );
    expect(r).toEqual({ reached: ["sulla", "exam:r"], total: 3 });
    // Percorso d'esame a 200 m: non fatto.
    expect(computePlanReached([exam], track, new Map([["r", line(0, 0.002, BASE.lng + 0.0026)]])).reached).toEqual([]);
  });

  it("linea a pezzi: si aggancia fino al percorso d'esame, lo si usa com'è, si riparte dalla sua fine", () => {
    const path = line(0.005, 0.008);
    const pieces = planRoutePieces(
      BASE,
      [stop({ dLat: 0.001 }), stop({ key: "exam:r", source: "exam", examRouteId: "r", dLat: 0.005 }), stop({ dLat: 0.01 })],
      new Map([["r", path]]),
    );
    expect(pieces).toEqual([
      { kind: "snap", points: [[BASE.lat, BASE.lng], [BASE.lat + 0.001, BASE.lng], path[0]] },
      { kind: "path", path },
      { kind: "snap", points: [path[1], [BASE.lat + 0.01, BASE.lng]] },
    ]);
  });

  it("partenza vicino alla sede = la sede", () => {
    const hq = { lat: BASE.lat, lng: BASE.lng };
    expect(planStart({ lat: BASE.lat + 0.001, lng: BASE.lng }, hq)).toBe(hq); // ~111 m
    expect(planStart({ lat: BASE.lat + 0.01, lng: BASE.lng }, hq)).toEqual({ lat: BASE.lat + 0.01, lng: BASE.lng });
    expect(planStart(null, hq)).toBe(hq);
  });
});

import { applyStopOrder, optimizeWaypoints, planEnd } from "@/lib/autoscuole/road/lesson-plan";
import { legsToCache, optimizeStopOrder, stepsToCache } from "@/lib/autoscuole/road/plan-route";
import { geocodeAddress } from "@/lib/autoscuole/road/headquarters";
import { segmentKey, stepsKey, type SnapCache, type StepsCache } from "@/lib/autoscuole/road/snap";

jest.mock("@/lib/cache/redis", () => ({ getRedis: () => null }));
jest.mock("@/db/prisma", () => ({ prisma: {} }));

describe("Reglo Road — giro chiuso in sede e ordine ottimizzato (REG-653)", () => {
  const hq = { lat: BASE.lat + 0.03, lng: BASE.lng };
  const a = stop({ key: "a", dLat: 0.003 });
  const b = stop({ key: "b", dLat: -0.004 });
  const exam = stop({ key: "exam:r", source: "exam", examRouteId: "r", dLat: 0.01, endLat: BASE.lat + 0.02, endLng: BASE.lng });

  it("la linea a pezzi si chiude in sede, anche dopo un percorso d'esame", () => {
    const path = line(0.01, 0.02);
    expect(planRoutePieces(BASE, [a], new Map(), hq)).toEqual([
      { kind: "snap", points: [[BASE.lat, BASE.lng], [a.lat, a.lng], [hq.lat, hq.lng]] },
    ]);
    expect(planRoutePieces(BASE, [exam], new Map([["r", path]]), hq)).toEqual([
      { kind: "snap", points: [[BASE.lat, BASE.lng], path[0]] },
      { kind: "path", path },
      { kind: "snap", points: [path[1], [hq.lat, hq.lng]] },
    ]);
    // Riaggancio senza tappe rimaste: dritti in sede.
    expect(planRoutePieces(BASE, [], new Map(), hq)).toEqual([
      { kind: "snap", points: [[BASE.lat, BASE.lng], [hq.lat, hq.lng]] },
    ]);
  });

  it("la sede chiude il giro solo se è entro 15 km dalla partenza", () => {
    expect(planEnd(BASE, hq)).toBe(hq);
    expect(planEnd(null, hq)).toBe(hq);
    expect(planEnd(BASE, null)).toBeNull();
    expect(planEnd(BASE, { lat: 45.4654, lng: 9.1859 })).toBeNull(); // Torino → Milano
  });

  it("si ottimizza solo con la sede e almeno due tappe; l'ordine di Google si usa solo se valido", () => {
    expect(optimizeWaypoints(BASE, [a, b], null)).toBeNull();
    expect(optimizeWaypoints(BASE, [a], hq)).toBeNull();
    expect(optimizeWaypoints(BASE, [a, b], hq)).toEqual([[BASE.lat, BASE.lng], [a.lat, a.lng], [b.lat, b.lng], [hq.lat, hq.lng]]);
    expect(applyStopOrder([a, b], [1, 0])).toEqual([b, a]);
    for (const bad of [[0], [0, 0], [0, 2], [0.5, 1], null, "1,0"]) expect(applyStopOrder([a, b], bad)).toEqual([a, b]);
  });

  it("i tratti della risposta vanno in cache, tranne quelli che escono da un percorso d'esame", () => {
    const legs: LatLng[][] = [line(0, 0.003), line(0.003, 0.01), line(0.01, 0.03)];
    const entries = legsToCache([BASE.lat, BASE.lng], [a, exam], [hq.lat, hq.lng], legs);
    expect(entries.map(([k]) => k)).toEqual([
      segmentKey([BASE.lat, BASE.lng], [a.lat, a.lng]),
      segmentKey([a.lat, a.lng], [exam.lat, exam.lng]),
    ]);
    expect(legsToCache([BASE.lat, BASE.lng], [a], [hq.lat, hq.lng], legs)).toEqual([]); // legs che non tornano
  });

  it("REG-676: le svolte della risposta vanno nella cache delle svolte con le stesse regole", () => {
    const legs: LatLng[][] = [line(0, 0.003), line(0.003, 0.01), line(0.01, 0.03)];
    const turn = (text: string) => [{ lat: BASE.lat, lng: BASE.lng, maneuver: "TURN_LEFT", text }];
    const entries = stepsToCache([BASE.lat, BASE.lng], [a, exam], [hq.lat, hq.lng], legs, [turn("1"), turn("2"), turn("3")]);
    expect(entries).toEqual([
      [stepsKey([BASE.lat, BASE.lng], [a.lat, a.lng]), turn("1")],
      [stepsKey([a.lat, a.lng], [exam.lat, exam.lng]), turn("2")],
    ]);
    expect(stepsToCache([BASE.lat, BASE.lng], [a, exam], [hq.lat, hq.lng], legs, [turn("1")])).toEqual([]);
  });

  it("optimizeStopOrder: una richiesta, ordine applicato, tratti in cache; errore = ordine dato", async () => {
    const saved: Array<[string, LatLng[]]> = [];
    const snapCache: SnapCache = { getMany: async (k) => k.map(() => null), setMany: async (e) => void saved.push(...e) };
    const fetchOptimized = jest.fn(async () => ({ order: [1, 0], legs: [line(0, -0.004), line(-0.004, 0.003), line(0.003, 0.03)] }));
    const r = await optimizeStopOrder(BASE, [a, b], hq, { fetchOptimized, snapCache });
    expect(r).toEqual({ stops: [b, a], optimized: true, requests: 1 });
    expect(saved).toHaveLength(3);

    // REG-676: con le svolte nella risposta, anche la cache delle svolte.
    const savedSteps: Array<[string, unknown]> = [];
    const stepsCache: StepsCache = { getMany: async (k) => k.map(() => null), setMany: async (e) => void savedSteps.push(...e) };
    const withSteps = jest.fn(async () => ({
      order: [1, 0],
      legs: [line(0, -0.004), line(-0.004, 0.003), line(0.003, 0.03)],
      steps: [[], [], []],
    }));
    await optimizeStopOrder(BASE, [a, b], hq, { fetchOptimized: withSteps, snapCache, stepsCache });
    expect(savedSteps).toHaveLength(3);
    expect(fetchOptimized).toHaveBeenCalledWith([[BASE.lat, BASE.lng], [a.lat, a.lng], [b.lat, b.lng], [hq.lat, hq.lng]]);

    const broken = jest.fn(async () => {
      throw new Error("giù");
    });
    expect(await optimizeStopOrder(BASE, [a, b], hq, { fetchOptimized: broken, snapCache })).toEqual({
      stops: [a, b],
      optimized: false,
      requests: 1,
    });
    // Senza sede niente richiesta.
    const never = jest.fn();
    expect((await optimizeStopOrder(BASE, [a, b], null, { fetchOptimized: never, snapCache })).requests).toBe(0);
    expect(never).not.toHaveBeenCalled();
  });

  it("geocodifica della sede: il risultato di Google, null se non trova o se Google è giù", async () => {
    expect(await geocodeAddress("Via Roma 1, Torino", async () => ({ lat: 45.07, lng: 7.68 }))).toEqual({ lat: 45.07, lng: 7.68 });
    expect(await geocodeAddress("Via Inesistente", async () => null)).toBeNull();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      await geocodeAddress("Via Roma 1", async () => {
        throw new Error("403");
      }),
    ).toBeNull();
    warn.mockRestore();
  });
});
