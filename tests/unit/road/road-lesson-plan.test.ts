import type { Hotspot, HotspotMarker } from "@/lib/autoscuole/road/hotspots";
import {
  buildLessonPlan,
  buildStudentHotspots,
  examRouteCoverage,
  planCandidates,
  samplePath,
  studentErrorKinds,
  COVERAGE_DONE,
  PLAN_STOP_MINUTES,
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

  it("ordine «più vicina prima» e minuti a 25 km/h", () => {
    const plan = buildLessonPlan(
      input({ studentHotspots: [sh({ key: "lontana", dLat: 0.02 }), sh({ key: "vicina", dLat: 0.005 })] }),
    );
    expect(plan.stops.map((s) => s.key)).toEqual(["vicina", "lontana"]);
    // ~556 m a 25 km/h ≈ 1,3 min → 2.
    expect(plan.stops[0].minutes).toBe(2);
    expect(plan.stops[0].reason).toBe("Precedenza da migliorare 3 volte in 2 guide");
    // Andata 2 + 5 (~1,7 km fra le due) + ritorno 6 (~2,2 km) + lavoro 2×5.
    expect(plan.minutes).toBe(2 + 5 + 6 + 2 * PLAN_STOP_MINUTES);
  });

  it("toglie le tappe meno importanti se il giro non sta nella guida", () => {
    const far = sh({ key: "seconda", dLat: 0.1 }); // ~11 km: 27 min andata e ritorno
    const plan = buildLessonPlan(input({ durationMin: 30, studentHotspots: [sh({ key: "prima", dLat: 0.005 }), far] }));
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
