import { nearestCarColor, resolveCarColor } from "@/lib/autoscuole/road/car-colors";

describe("Road car colors", () => {
  it("usa il colore del veicolo quando c'è", () => {
    expect(resolveCarColor("rosso", "#10B981")).toBe("rosso");
  });

  it("senza colore veicolo prende la variante più vicina alla tinta istruttore", () => {
    expect(resolveCarColor(null, "#10B981")).toBe("verde");
    expect(resolveCarColor(null, "#F97316")).toBe("arancio");
    expect(resolveCarColor(null, "#0EA5E9")).toBe("azzurro");
    expect(resolveCarColor(undefined, "#EF4444")).toBe("rosso");
  });

  it("chiave sconosciuta o tinta non valida → bianco", () => {
    expect(resolveCarColor("fucsia", null)).toBe("bianco");
    expect(resolveCarColor(null, "not-a-hex")).toBe("bianco");
    expect(nearestCarColor(null)).toBeNull();
  });

  it("una tinta satura non finisce mai su un neutro", () => {
    expect(["bianco", "argento", "grigio", "nero"]).not.toContain(nearestCarColor("#8B5CF6"));
  });
});
