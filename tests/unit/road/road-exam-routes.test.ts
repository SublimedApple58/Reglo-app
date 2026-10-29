import {
  EXAM_ROUTE_MAX_WAYPOINTS,
  parseExamRouteInput,
  parseLatLngList,
  parseLicenseCategories,
  pathLengthMeters,
  simplifyPath,
  type LatLng,
} from "@/lib/autoscuole/road/exam-routes";

// Una strada dritta verso nord a Torino: un punto ogni ~11 m per ~1,1 km.
const straight: LatLng[] = Array.from({ length: 101 }, (_, i) => [45.07 + i * 0.0001, 7.68]);

describe("Reglo Road — percorsi d'esame", () => {
  it("parseLatLngList rifiuta liste corte, troppo lunghe o con coordinate fuori dal mondo", () => {
    expect(parseLatLngList([[45, 7]], { min: 2, max: 5 })).toBeNull();
    expect(parseLatLngList([[45, 7], [91, 7]], { min: 2, max: 5 })).toBeNull();
    expect(parseLatLngList([[45, 7], ["x", 7]], { min: 2, max: 5 })).toBeNull();
    expect(parseLatLngList(Array(6).fill([45, 7]), { min: 2, max: 5 })).toBeNull();
    expect(parseLatLngList([[45, 7, 99], [45.1, 7.1]], { min: 2, max: 5 })).toEqual([[45, 7], [45.1, 7.1]]);
  });

  it("simplifyPath tiene solo gli estremi di una strada dritta", () => {
    const s = simplifyPath(straight);
    expect(s).toEqual([straight[0], straight[100]]);
  });

  it("simplifyPath tiene la curva (angolo a L)", () => {
    const east: LatLng[] = Array.from({ length: 50 }, (_, i) => [45.08, 7.68 + (i + 1) * 0.0001]);
    const l = [...straight, ...east];
    const s = simplifyPath(l);
    expect(s).toHaveLength(3);
    expect(s[1]).toEqual(straight[100]);
    // La lunghezza resta quella di prima (≈ 1,1 km + ≈ 0,4 km).
    expect(Math.abs(pathLengthMeters(s) - pathLengthMeters(l))).toBeLessThan(2);
  });

  it("parseLicenseCategories: maiuscole, senza doppioni; rifiuta valori strani", () => {
    expect(parseLicenseCategories(["b", "B", " a2 "])).toEqual(["B", "A2"]);
    expect(parseLicenseCategories(undefined)).toEqual([]);
    expect(parseLicenseCategories(["patente B"])).toBeNull();
  });

  it("parseExamRouteInput in creazione: nome, punti e linea obbligatori; lunghezza calcolata dal server", () => {
    expect(parseExamRouteInput({ waypoints: [[45, 7], [45.1, 7]], path: straight }, { partial: false })).toEqual({
      ok: false,
      message: "Dai un nome al percorso.",
    });
    const tooMany = Array.from({ length: EXAM_ROUTE_MAX_WAYPOINTS + 1 }, (_, i) => [45 + i * 0.001, 7]);
    expect(parseExamRouteInput({ name: "Giro", waypoints: tooMany, path: straight }, { partial: false }).ok).toBe(false);

    const res = parseExamRouteInput(
      { name: "  Giro nord  ", examSite: "Motorizzazione di Torino", licenseCategories: ["b"], waypoints: [straight[0], straight[100]], path: straight, lengthMeters: 1 },
      { partial: false },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.name).toBe("Giro nord");
    expect(res.value.licenseCategories).toEqual(["B"]);
    expect(res.value.path).toHaveLength(2);
    expect(res.value.lengthMeters).toBeGreaterThan(1100);
    expect(res.value.lengthMeters).toBeLessThan(1120);
  });

  it("parseExamRouteInput in modifica: solo i campi presenti", () => {
    const res = parseExamRouteInput({ examSite: "" }, { partial: true });
    expect(res).toEqual({ ok: true, value: { examSite: null } });
    expect(parseExamRouteInput({ sourceSessionId: "nope" }, { partial: true }).ok).toBe(false);
  });
});
