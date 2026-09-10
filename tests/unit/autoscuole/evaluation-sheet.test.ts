import {
  asEvaluationScale,
  clampEvaluationScore,
  defaultEvaluationScore,
  evaluationItemDisplayLabel,
  EVALUATION_SCALES,
} from "@/lib/autoscuole/evaluation-sheet";

describe("pagellino — scale", () => {
  it("ammette solo 3 e 5 stelline", () => {
    expect(EVALUATION_SCALES).toEqual([3, 5]);
  });

  it("ripiega su 5 per valori non ammessi (inclusa la vecchia 10)", () => {
    expect(asEvaluationScale(10)).toBe(5);
    expect(asEvaluationScale(0)).toBe(5);
    expect(asEvaluationScale("5")).toBe(5);
    expect(asEvaluationScale(undefined)).toBe(5);
  });

  it("tiene 3 quando è 3", () => {
    expect(asEvaluationScale(3)).toBe(3);
  });
});

describe("pagellino — punteggio di partenza", () => {
  it("è metà scala arrotondata per eccesso", () => {
    expect(defaultEvaluationScore(5)).toBe(3);
    expect(defaultEvaluationScore(3)).toBe(2);
  });

  it("non scende mai sotto 1", () => {
    expect(defaultEvaluationScore(1)).toBe(3); // 1 non è una scala valida → 5
  });
});

describe("pagellino — clamp dei punteggi", () => {
  it("tiene i punteggi validi", () => {
    expect(clampEvaluationScore(4, 5)).toBe(4);
    expect(clampEvaluationScore(1, 3)).toBe(1);
  });

  it("taglia sopra e sotto la scala", () => {
    expect(clampEvaluationScore(9, 5)).toBe(5);
    expect(clampEvaluationScore(0, 5)).toBe(1);
    expect(clampEvaluationScore(5, 3)).toBe(3);
  });

  it("arrotonda i decimali e ripiega sul default per NaN", () => {
    expect(clampEvaluationScore(3.6, 5)).toBe(4);
    expect(clampEvaluationScore(Number.NaN, 5)).toBe(3);
  });
});

describe("pagellino — etichette storiche", () => {
  it("marca le voci archiviate", () => {
    expect(evaluationItemDisplayLabel({ label: "Manovre", archivedAt: null })).toBe("Manovre");
    expect(evaluationItemDisplayLabel({ label: "Manovre", archivedAt: new Date() })).toBe(
      "Manovre (non più in uso)",
    );
  });
});
