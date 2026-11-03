import {
  availabilityByLocationEnabled,
  effectiveLocationChangeBufferMinutes,
  normalizeLocationChangeBufferMinutes,
  normalizeMemberLocations,
  rangeServesStudent,
  readLocationAvailabilitySettings,
  studentLocationScope,
} from "@/lib/autoscuole/location-availability";

describe("availabilityByLocationEnabled", () => {
  it("acceso solo se salvato acceso e con almeno due luoghi attivi", () => {
    expect(availabilityByLocationEnabled(true, 2)).toBe(true);
    expect(availabilityByLocationEnabled(true, 1)).toBe(false);
    expect(availabilityByLocationEnabled(false, 5)).toBe(false);
    expect(availabilityByLocationEnabled(undefined, 5)).toBe(false);
  });
});

describe("readLocationAvailabilitySettings", () => {
  it("default: spento, pausa spenta da 30 minuti", () => {
    expect(readLocationAvailabilitySettings(null)).toEqual({
      availabilityByLocation: false,
      locationChangeBufferEnabled: false,
      locationChangeBufferMinutes: 30,
    });
  });

  it("legge i valori salvati e normalizza i minuti", () => {
    expect(
      readLocationAvailabilitySettings({
        availabilityByLocation: true,
        locationChangeBufferEnabled: true,
        locationChangeBufferMinutes: 47,
      }),
    ).toEqual({
      availabilityByLocation: true,
      locationChangeBufferEnabled: true,
      locationChangeBufferMinutes: 45,
    });
  });
});

describe("normalizeLocationChangeBufferMinutes", () => {
  it("arrotonda a passi di 5 e resta tra 5 e 120", () => {
    expect(normalizeLocationChangeBufferMinutes(2)).toBe(5);
    expect(normalizeLocationChangeBufferMinutes(500)).toBe(120);
    expect(normalizeLocationChangeBufferMinutes(33)).toBe(35);
    expect(normalizeLocationChangeBufferMinutes("x")).toBe(30);
  });
});

describe("effectiveLocationChangeBufferMinutes", () => {
  const on = {
    availabilityByLocation: true,
    locationChangeBufferEnabled: true,
    locationChangeBufferMinutes: 20,
  };
  it("zero se la funzione è spenta o la pausa non è attiva", () => {
    expect(effectiveLocationChangeBufferMinutes(on, false)).toBe(0);
    expect(
      effectiveLocationChangeBufferMinutes({ ...on, locationChangeBufferEnabled: false }, true),
    ).toBe(0);
    expect(effectiveLocationChangeBufferMinutes(on, true)).toBe(20);
  });
});

describe("studentLocationScope + rangeServesStudent", () => {
  it("funzione spenta: nessun vincolo", () => {
    const scope = studentLocationScope(false, ["a"]);
    expect(scope).toBeNull();
    expect(rangeServesStudent("b", scope)).toBe(true);
  });

  it("allievo senza luoghi: vede tutti i luoghi", () => {
    const scope = studentLocationScope(true, []);
    expect(scope).toBeNull();
    expect(rangeServesStudent("b", scope)).toBe(true);
  });

  it("fascia senza luogo: vale per tutti", () => {
    expect(rangeServesStudent(null, studentLocationScope(true, ["a"]))).toBe(true);
    expect(rangeServesStudent(undefined, studentLocationScope(true, ["a"]))).toBe(true);
  });

  it("fascia con luogo: solo per chi ha quel luogo", () => {
    const scope = studentLocationScope(true, ["a", "c"]);
    expect(rangeServesStudent("a", scope)).toBe(true);
    expect(rangeServesStudent("b", scope)).toBe(false);
  });
});

describe("normalizeMemberLocations", () => {
  const ordered = ["sede", "a", "b"];

  it("ordina come i luoghi attivi, deduplica e scarta gli archiviati", () => {
    expect(
      normalizeMemberLocations({
        locationIds: ["b", "x", "sede", "b"],
        preferredDefaultId: null,
        orderedActiveIds: ordered,
      }).locationIds,
    ).toEqual(["sede", "b"]);
  });

  it("tiene il principale se è tra i luoghi", () => {
    expect(
      normalizeMemberLocations({
        locationIds: ["a", "b"],
        preferredDefaultId: "b",
        orderedActiveIds: ordered,
      }),
    ).toEqual({ locationIds: ["a", "b"], defaultLocationId: "b" });
  });

  it("principale fuori dai luoghi: diventa il primo luogo", () => {
    expect(
      normalizeMemberLocations({
        locationIds: ["b"],
        preferredDefaultId: "a",
        orderedActiveIds: ordered,
      }),
    ).toEqual({ locationIds: ["b"], defaultLocationId: "b" });
  });

  it("nessun luogo: il principale resta (serve solo a precompilare)", () => {
    expect(
      normalizeMemberLocations({
        locationIds: [],
        preferredDefaultId: "a",
        orderedActiveIds: ordered,
      }),
    ).toEqual({ locationIds: [], defaultLocationId: "a" });
  });

  it("principale archiviato e nessun luogo: nessun principale", () => {
    expect(
      normalizeMemberLocations({
        locationIds: [],
        preferredDefaultId: "vecchio",
        orderedActiveIds: ordered,
      }),
    ).toEqual({ locationIds: [], defaultLocationId: null });
  });
});
