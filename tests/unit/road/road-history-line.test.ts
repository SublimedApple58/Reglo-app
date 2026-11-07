import { historyLine } from "@/lib/autoscuole/road/history-line";

describe("Road storico: traccia sfoltita", () => {
  it("una retta diventa i due estremi", () => {
    const path = Array.from({ length: 200 }, (_, i) => [45 + i * 1e-5, 9, i * 1000] as [number, number, number]);
    expect(historyLine(path)).toEqual([
      [45, 9],
      [45 + 199 * 1e-5, 9],
    ]);
  });

  it("tiene le curve e non supera il massimo", () => {
    // Zig-zag di ~30 m: nessun punto è superfluo.
    const path = Array.from({ length: 1000 }, (_, i) => [45 + i * 1e-4, 9 + (i % 2) * 4e-4] as [number, number]);
    const line = historyLine(path, 100);
    expect(line).toHaveLength(100);
    expect(line[0]).toEqual([45, 9]);
    expect(line[99]).toEqual(path[999]);
  });

  it("percorso vuoto o di un punto resta com'è", () => {
    expect(historyLine([])).toEqual([]);
    expect(historyLine([[45, 9]])).toEqual([[45, 9]]);
  });
});
