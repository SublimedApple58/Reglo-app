import { applyRangeLocations, rangeLocationId } from "@/lib/autoscuole/range-locations";

describe("applyRangeLocations", () => {
  const valid = new Set(["sede", "lingotto"]);

  it("tiene solo i luoghi validi e omette quelli vuoti", () => {
    expect(
      applyRangeLocations(
        [
          { startMinutes: 480, endMinutes: 780, locationId: "sede" },
          { startMinutes: 870, endMinutes: 1110, locationId: "archiviato" },
          { startMinutes: 1140, endMinutes: 1200, locationId: null },
          { startMinutes: 1200, endMinutes: 1260 },
        ],
        valid,
      ),
    ).toEqual([
      { startMinutes: 480, endMinutes: 780, locationId: "sede" },
      { startMinutes: 870, endMinutes: 1110 },
      { startMinutes: 1140, endMinutes: 1200 },
      { startMinutes: 1200, endMinutes: 1260 },
    ]);
  });

  it("senza insieme valido (veicoli) toglie ogni luogo", () => {
    expect(
      applyRangeLocations([{ startMinutes: 480, endMinutes: 780, locationId: "sede" }], null),
    ).toEqual([{ startMinutes: 480, endMinutes: 780 }]);
  });

  it("non tocca altri campi e non aggiunge chiavi", () => {
    const out = applyRangeLocations([{ startMinutes: 480, endMinutes: 780 }], valid);
    expect(Object.keys(out[0])).toEqual(["startMinutes", "endMinutes"]);
  });
});

describe("rangeLocationId", () => {
  it("legge il luogo dal JSON non tipizzato", () => {
    expect(rangeLocationId({ startMinutes: 1, endMinutes: 2, locationId: "sede" })).toBe("sede");
    expect(rangeLocationId({ startMinutes: 1, endMinutes: 2 })).toBeNull();
    expect(rangeLocationId({ locationId: "" })).toBeNull();
    expect(rangeLocationId(null)).toBeNull();
  });
});
