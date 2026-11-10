import { parseExamRouteInput } from "@/lib/autoscuole/road/exam-routes";
import { parseStoredPlan, PLAN_MAX_STOPS, type StoredPlan } from "@/lib/autoscuole/road/lesson-plan";
import {
  canStartRoadExam,
  examAnchorRow,
  examRouteName,
  examRowsExaminers,
  examStopFromRoute,
  groupExamRoutesByExaminer,
  NO_EXAMINER_KEY,
  planWithExamStop,
  roadSessionMode,
} from "@/lib/autoscuole/road/road-exam";

describe("R4 Road Exam — chi può registrare", () => {
  const row = (instructorId: string | null, co: string[] = []) => ({ instructorId, coInstructorIds: co });

  it("il titolare sempre, anche senza scheda istruttore", () => {
    expect(canStartRoadExam([row("i1")], { isOwner: true, instructorId: null })).toBe(true);
  });
  it("istruttore dell'esame e co-istruttori sì, gli altri no", () => {
    const rows = [row("i1", ["i2"]), row("i1")];
    expect(canStartRoadExam(rows, { isOwner: false, instructorId: "i1" })).toBe(true);
    expect(canStartRoadExam(rows, { isOwner: false, instructorId: "i2" })).toBe(true);
    expect(canStartRoadExam(rows, { isOwner: false, instructorId: "i3" })).toBe(false);
  });
  it("esame senza istruttore: qualunque istruttore", () => {
    expect(canStartRoadExam([row(null), row(null)], { isOwner: false, instructorId: "i9" })).toBe(true);
  });
  it("chi non è istruttore né titolare no", () => {
    expect(canStartRoadExam([row(null)], { isOwner: false, instructorId: null })).toBe(false);
  });
});

describe("R4 Road Exam — ancora e dati dell'esame", () => {
  it("àncora alla riga non annullata con l'id più piccolo", () => {
    const rows = [
      { id: "b", status: "scheduled" },
      { id: "a", status: "cancelled" },
      { id: "c", status: "scheduled" },
    ];
    expect(examAnchorRow(rows)?.id).toBe("b");
    expect(examAnchorRow([{ id: "a", status: "cancelled" }])).toBeNull();
  });
  it("esaminatori di tutte le righe, senza doppioni", () => {
    expect(examRowsExaminers([{ examiners: ["Ing. Rossi"] }, { examiners: ["ing. rossi", "Bianchi"] }])).toEqual([
      "Ing. Rossi",
      "Bianchi",
    ]);
  });
  it("modalità: tutto ciò che non è «exam» è una guida", () => {
    expect(roadSessionMode("exam")).toBe("exam");
    expect(roadSessionMode(null)).toBe("lesson");
    expect(roadSessionMode("altro")).toBe("lesson");
  });
  it("nome del percorso registrato", () => {
    const at = new Date("2026-11-12T08:30:00Z"); // 9:30 a Roma
    expect(examRouteName(at, ["Rossi"])).toBe("Esame 12 nov · Rossi");
    expect(examRouteName(at, ["Rossi", "Bianchi"])).toBe("Esame 12 nov · Rossi e Bianchi");
    expect(examRouteName(at, [])).toBe("Esame 12 nov · 9:30");
  });
});

describe("R4b — percorsi per esaminatore", () => {
  const r = (id: string, examiners: string[], examAt: string | null, createdAt = "2026-10-01T00:00:00Z") => ({
    id,
    examiners,
    examAt,
    createdAt,
  });

  it("due esaminatori = il percorso sta sotto entrambi; senza esaminatore in fondo", () => {
    const groups = groupExamRoutesByExaminer([
      r("p1", ["Rossi", "Bianchi"], "2026-11-12T08:00:00Z"),
      r("p2", ["rossi"], "2026-11-05T08:00:00Z"),
      r("p3", [], null, "2026-11-20T00:00:00Z"),
      r("p4", ["Verdi"], "2026-11-14T08:00:00Z"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["verdi", "bianchi", "rossi", NO_EXAMINER_KEY]); // stesso ultimo esame: alfabetico
    expect(groups.find((g) => g.key === "rossi")?.routes.map((x) => x.id)).toEqual(["p1", "p2"]);
    expect(groups.find((g) => g.key === "bianchi")?.routes.map((x) => x.id)).toEqual(["p1"]);
    expect(groups.find((g) => g.key === NO_EXAMINER_KEY)?.name).toBeNull();
    // Grafia del più recente.
    expect(groups.find((g) => g.key === "rossi")?.name).toBe("Rossi");
  });

  it("il titolare assegna gli esaminatori (puliti, senza doppioni)", () => {
    const parsed = parseExamRouteInput({ examiners: [" Ing.  Rossi ", "ing. rossi", ""] }, { partial: true });
    expect(parsed).toEqual({ ok: true, value: { examiners: ["Ing. Rossi"] } });
    expect(parseExamRouteInput({ examiners: "Rossi" }, { partial: true }).ok).toBe(false);
  });
});

describe("R4c — «Prova il percorso» durante una guida", () => {
  const route = { id: "r1", name: "Esame 12 nov · Rossi", path: [[45, 7], [45.01, 7.01]] as [number, number][] };
  const stopOf = (key: string, source: "student" | "school" | "exam" = "student") => ({
    key,
    source,
    kind: "precedenza",
    title: key,
    reason: "",
    lat: 45,
    lng: 7,
    minutes: 3,
    examRouteId: source === "exam" ? key : null,
    endLat: source === "exam" ? 45.1 : null,
    endLng: source === "exam" ? 7.1 : null,
  });

  it("la tappa la costruisce il server ed è valida per il giro salvato", () => {
    const stop = examStopFromRoute(route)!;
    expect(stop).toMatchObject({ key: "exam:r1", source: "exam", examRouteId: "r1", lat: 45, endLat: 45.01 });
    const plan = planWithExamStop(null, stop, new Date("2026-11-10T10:00:00Z"))!;
    expect(parseStoredPlan(plan)?.stops).toHaveLength(1);
    expect(plan.custom).toBe(true);
    expect(examStopFromRoute({ ...route, path: [[45, 7]] })).toBeNull();
  });

  it("sostituisce un altro percorso d'esame e tiene le altre tappe", () => {
    const current: StoredPlan = { stops: [stopOf("a"), stopOf("old", "exam")], minutes: 40, chosenAt: "x" };
    const next = planWithExamStop(current, examStopFromRoute(route))!;
    expect(next.stops.map((s) => s.key)).toEqual(["a", "exam:r1"]);
    expect(next.minutes).toBe(40);
  });

  it("giro pieno: cede l'ultima tappa", () => {
    const full: StoredPlan = { stops: [stopOf("a"), stopOf("b"), stopOf("c")], minutes: 50, chosenAt: "x" };
    const next = planWithExamStop(full, examStopFromRoute(route))!;
    expect(next.stops).toHaveLength(PLAN_MAX_STOPS);
    expect(next.stops.map((s) => s.key)).toEqual(["a", "b", "exam:r1"]);
  });

  it("togliere il percorso: restano le altre tappe, o nessun giro", () => {
    const current: StoredPlan = { stops: [stopOf("a"), stopOf("old", "exam")], minutes: 40, chosenAt: "x" };
    expect(planWithExamStop(current, null)?.stops.map((s) => s.key)).toEqual(["a"]);
    expect(planWithExamStop({ stops: [stopOf("old", "exam")], minutes: 10, chosenAt: "x" }, null)).toBeNull();
  });
});
