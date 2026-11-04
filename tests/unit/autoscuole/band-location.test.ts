import {
  bandLocationConflicts,
  rangesWithBandLocation,
  weeklyLikeFromRecord,
  weeklyWithBandLocation,
} from "@/lib/autoscuole/band-location";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const morning = { startMinutes: 510, endMinutes: 660 };
const afternoon = { startMinutes: 660, endMinutes: 810 };

describe("rangesWithBandLocation", () => {
  it("cambia solo il luogo di quella fascia", () => {
    const out = rangesWithBandLocation([{ ...morning, locationId: B }, { ...afternoon, locationId: A }], morning, A);
    expect(out).toEqual([{ ...morning, locationId: A }, { ...afternoon, locationId: A }]);
  });

  it("«Tutti i luoghi» toglie la chiave", () => {
    const out = rangesWithBandLocation([{ ...morning, locationId: B }], morning, null);
    expect(out).toEqual([morning]);
    expect(out![0]).not.toHaveProperty("locationId");
  });

  it("fascia non trovata: null", () => {
    expect(rangesWithBandLocation([afternoon], morning, A)).toBeNull();
  });
});

describe("weeklyWithBandLocation", () => {
  it("modello condiviso: passa al modello per giorno e cambia solo quel giorno", () => {
    const weekly = { daysOfWeek: [1, 2], startMinutes: 510, endMinutes: 660, ranges: [{ ...morning }], rangesByDay: null };
    const out = weeklyWithBandLocation(weekly, 1, morning, A)!;
    expect(out.rangesByDay).toEqual({ "1": [{ ...morning, locationId: A }], "2": [morning] });
    expect(out.daysOfWeek).toEqual([1, 2]);
    expect(out.startMinutes).toBe(510);
  });

  it("modello per giorno: tocca solo la fascia giusta", () => {
    const weekly = {
      daysOfWeek: [1],
      startMinutes: 510,
      endMinutes: 660,
      ranges: [],
      rangesByDay: { "1": [{ ...morning, locationId: B }, { ...afternoon }] },
    };
    const out = weeklyWithBandLocation(weekly, 1, afternoon, B)!;
    expect(out.rangesByDay["1"]).toEqual([{ ...morning, locationId: B }, { ...afternoon, locationId: B }]);
    expect(out.startMinutes2).toBe(660);
  });

  it("fascia o giorno assenti nella settimana tipo: null", () => {
    const weekly = { daysOfWeek: [1], startMinutes: 510, endMinutes: 660, ranges: [{ ...morning }], rangesByDay: null };
    expect(weeklyWithBandLocation(weekly, 1, afternoon, A)).toBeNull();
    expect(weeklyWithBandLocation(weekly, 3, morning, A)).toBeNull();
  });
});

describe("bandLocationConflicts", () => {
  const appts = [
    { id: "dentro-B", startMinutes: 570, endMinutes: 630, locationId: B },
    { id: "dentro-sede", startMinutes: 600, endMinutes: 660, locationId: null },
    { id: "fuori", startMinutes: 700, endMinutes: 760, locationId: B },
  ];

  it("guide della fascia in un luogo diverso dal nuovo (senza luogo = sede)", () => {
    expect(bandLocationConflicts(appts, morning, A, A).map((a) => a.id)).toEqual(["dentro-B"]);
    expect(bandLocationConflicts(appts, morning, B, A).map((a) => a.id)).toEqual(["dentro-sede"]);
  });

  it("verso «Tutti i luoghi» nessun conflitto", () => {
    expect(bandLocationConflicts(appts, morning, null, A)).toEqual([]);
  });
});

describe("weeklyLikeFromRecord", () => {
  it("record vecchio: la seconda fascia nei campi piatti non si perde", () => {
    const like = weeklyLikeFromRecord({
      daysOfWeek: [1, 2, 3, 4, 5],
      startMinutes: 480,
      endMinutes: 780,
      startMinutes2: 840,
      endMinutes2: 1140,
      ranges: null,
      rangesByDay: null,
    });
    expect(like.ranges).toEqual([
      { startMinutes: 480, endMinutes: 780 },
      { startMinutes: 840, endMinutes: 1140 },
    ]);
    const out = weeklyWithBandLocation(like, 2, { startMinutes: 480, endMinutes: 780 }, A)!;
    expect(out.rangesByDay["2"]).toEqual([
      { startMinutes: 480, endMinutes: 780, locationId: A },
      { startMinutes: 840, endMinutes: 1140 },
    ]);
    expect(out.rangesByDay["1"]).toEqual([
      { startMinutes: 480, endMinutes: 780 },
      { startMinutes: 840, endMinutes: 1140 },
    ]);
    expect(out.startMinutes2).toBe(840);
  });

  it("con `ranges` valgono quelle, i campi piatti no", () => {
    const like = weeklyLikeFromRecord({
      daysOfWeek: [1],
      startMinutes: 480,
      endMinutes: 780,
      startMinutes2: 840,
      endMinutes2: 1140,
      ranges: [{ startMinutes: 540, endMinutes: 600 }],
      rangesByDay: null,
    });
    expect(like.ranges).toEqual([{ startMinutes: 540, endMinutes: 600 }]);
  });
});
