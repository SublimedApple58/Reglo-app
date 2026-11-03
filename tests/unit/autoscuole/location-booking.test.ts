import {
  locationOfCoveringRange,
  scopeAvailabilityRecord,
  scopeResolver,
  studentCanTakeLocation,
  violatesLocationChangeBuffer,
  withLocationName,
} from "@/lib/autoscuole/location-booking";

const record = {
  daysOfWeek: [1],
  ranges: [
    { startMinutes: 480, endMinutes: 780, locationId: "sede" },
    { startMinutes: 870, endMinutes: 1110, locationId: "lingotto" },
    { startMinutes: 1140, endMinutes: 1200 },
  ],
};

describe("scopeAvailabilityRecord", () => {
  it("senza vincolo restituisce il record intatto", () => {
    expect(scopeAvailabilityRecord(record, null)).toBe(record);
  });

  it("tiene le fasce dei luoghi dell'allievo e quelle senza luogo", () => {
    const out = scopeAvailabilityRecord(record, new Set(["lingotto"]));
    expect(out?.ranges.map((r) => r.startMinutes)).toEqual([870, 1140]);
    expect(out?.daysOfWeek).toEqual([1]);
  });

  it("giorno senza fasce rimaste = giorno non attivo", () => {
    const onlySede = { daysOfWeek: [1], ranges: [{ startMinutes: 480, endMinutes: 780, locationId: "sede" }] };
    expect(scopeAvailabilityRecord(onlySede, new Set(["lingotto"]))?.daysOfWeek).toEqual([]);
  });

  it("filtra anche la mappa per giorno", () => {
    const perDay = {
      daysOfWeek: [1, 2],
      ranges: [],
      rangesByDay: {
        1: [{ startMinutes: 480, endMinutes: 780, locationId: "sede" }],
        2: [{ startMinutes: 480, endMinutes: 780, locationId: "lingotto" }],
      },
    };
    const out = scopeAvailabilityRecord(perDay, new Set(["lingotto"]));
    expect(out?.daysOfWeek).toEqual([2]);
    expect(out?.rangesByDay?.[1]).toEqual([]);
  });

  it("null resta null", () => {
    expect(scopeAvailabilityRecord(null, new Set(["x"]))).toBeNull();
  });
});

describe("scopeResolver", () => {
  it("avvolge resolve e lascia il resto", () => {
    const base = { resolve: (_id: string, _at: Date) => record, extra: 1 };
    const wrapped = scopeResolver(base, new Set(["sede"]));
    expect(wrapped.extra).toBe(1);
    expect(wrapped.resolve("i", new Date())?.ranges).toHaveLength(2);
    expect(scopeResolver(base, null)).toBe(base);
  });
});

describe("locationOfCoveringRange", () => {
  it("restituisce il luogo della fascia che contiene la guida", () => {
    expect(locationOfCoveringRange(record.ranges, 900, 960)).toBe("lingotto");
    expect(locationOfCoveringRange(record.ranges, 1140, 1200)).toBeNull();
    // A cavallo di due fasce: nessuna la contiene.
    expect(locationOfCoveringRange(record.ranges, 760, 900)).toBeNull();
  });
});

describe("violatesLocationChangeBuffer", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 9, h, m));
  const busy = [{ startsAt: at(9), endsAt: at(10), locationId: "sede" }];
  const base = { busy, bufferMinutes: 30, defaultLocationId: "sede" };

  it("stesso luogo: nessuna pausa", () => {
    expect(violatesLocationChangeBuffer({ ...base, startsAt: at(10), endsAt: at(11), locationId: "sede" })).toBe(false);
  });

  it("luogo diverso subito dopo: viola", () => {
    expect(
      violatesLocationChangeBuffer({ ...base, startsAt: at(10, 15), endsAt: at(11, 15), locationId: "lingotto" }),
    ).toBe(true);
  });

  it("luogo diverso dopo la pausa: ok", () => {
    expect(
      violatesLocationChangeBuffer({ ...base, startsAt: at(10, 30), endsAt: at(11, 30), locationId: "lingotto" }),
    ).toBe(false);
  });

  it("luogo diverso subito prima: viola", () => {
    expect(
      violatesLocationChangeBuffer({ ...base, startsAt: at(7, 45), endsAt: at(8, 45), locationId: "lingotto" }),
    ).toBe(true);
  });

  it("guida senza luogo conta come la sede", () => {
    expect(
      violatesLocationChangeBuffer({
        ...base,
        busy: [{ startsAt: at(9), endsAt: at(10), locationId: null }],
        startsAt: at(10),
        endsAt: at(11),
        locationId: "sede",
      }),
    ).toBe(false);
  });

  it("pausa spenta: mai", () => {
    expect(
      violatesLocationChangeBuffer({ ...base, bufferMinutes: 0, startsAt: at(10), endsAt: at(11), locationId: "x" }),
    ).toBe(false);
  });
});

describe("studentCanTakeLocation", () => {
  it("senza luoghi prende tutto; altrimenti solo i suoi (null = sede)", () => {
    expect(studentCanTakeLocation(null, "lingotto", "sede")).toBe(true);
    expect(studentCanTakeLocation(new Set(["sede"]), null, "sede")).toBe(true);
    expect(studentCanTakeLocation(new Set(["sede"]), "lingotto", "sede")).toBe(false);
  });
});

describe("withLocationName", () => {
  const names = new Map([["lotto", "Piazzale Lotto"]]);

  it("aggiunge id e nome del luogo", () => {
    expect(withLocationName({ id: "o1" }, "lotto", names)).toEqual({
      id: "o1",
      locationId: "lotto",
      locationName: "Piazzale Lotto",
    });
  });

  it("fascia senza luogo: entrambi null", () => {
    expect(withLocationName({ id: "o1" }, undefined, names)).toEqual({ id: "o1", locationId: null, locationName: null });
  });

  it("luogo archiviato: id resta, nome null", () => {
    expect(withLocationName({ id: "o1" }, "sparito", names)).toEqual({ id: "o1", locationId: "sparito", locationName: null });
  });
});
