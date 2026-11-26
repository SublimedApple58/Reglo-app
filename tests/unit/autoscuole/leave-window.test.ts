/**
 * REG-797: malattia e ferie usavano un offset fisso +2 per Roma. D'inverno
 * (+1) inizio e fine slittavano di un'ora: il blocco partiva alle 23 del giorno
 * prima e finiva alle 22:59, e «dalle 14» diventava dalle 13.
 */

import { buildLeaveWindow, romeDateTimeToUtc } from "@/lib/autoscuole/leave-window";

const iso = (d: Date) => d.toISOString();

describe("REG-797 finestra malattia/ferie: offset di Roma della data", () => {
  it("estate (CEST, +2): giornate piene", () => {
    const w = buildLeaveWindow({ startDate: "2026-07-14", endDate: "2026-07-15" });
    expect(iso(w.start)).toBe("2026-07-13T22:00:00.000Z");
    expect(iso(w.end)).toBe("2026-07-15T21:59:00.000Z");
    expect(w.blocks.map((b) => [iso(b.startsAt), iso(b.endsAt)])).toEqual([
      ["2026-07-13T22:00:00.000Z", "2026-07-14T21:59:00.000Z"],
      ["2026-07-14T22:00:00.000Z", "2026-07-15T21:59:00.000Z"],
    ]);
  });

  it("inverno (CET, +1): giornate piene", () => {
    const w = buildLeaveWindow({ startDate: "2026-12-14", endDate: "2026-12-15" });
    expect(iso(w.start)).toBe("2026-12-13T23:00:00.000Z");
    expect(iso(w.end)).toBe("2026-12-15T22:59:00.000Z");
    expect(w.blocks.map((b) => [iso(b.startsAt), iso(b.endsAt)])).toEqual([
      ["2026-12-13T23:00:00.000Z", "2026-12-14T22:59:00.000Z"],
      ["2026-12-14T23:00:00.000Z", "2026-12-15T22:59:00.000Z"],
    ]);
  });

  it("estate, da metà del primo giorno: solo il primo blocco parte dalle 14", () => {
    const w = buildLeaveWindow({ startDate: "2026-07-14", startTime: "14:00", endDate: "2026-07-15" });
    expect(iso(w.start)).toBe("2026-07-14T12:00:00.000Z");
    expect(iso(w.blocks[0].startsAt)).toBe("2026-07-14T12:00:00.000Z");
    expect(iso(w.blocks[1].startsAt)).toBe("2026-07-14T22:00:00.000Z");
  });

  it("inverno, da metà del primo giorno: le 14 italiane sono le 13 UTC", () => {
    const w = buildLeaveWindow({ startDate: "2026-12-14", startTime: "14:00", endDate: "2026-12-15" });
    expect(iso(w.start)).toBe("2026-12-14T13:00:00.000Z");
    expect(iso(w.blocks[0].startsAt)).toBe("2026-12-14T13:00:00.000Z");
    expect(iso(w.blocks[0].endsAt)).toBe("2026-12-14T22:59:00.000Z");
    expect(iso(w.blocks[1].startsAt)).toBe("2026-12-14T23:00:00.000Z");
  });

  it("a cavallo del cambio d'ora (25 ottobre): ogni giorno col suo offset", () => {
    const w = buildLeaveWindow({ startDate: "2026-10-24", endDate: "2026-10-26" });
    expect(w.blocks.map((b) => iso(b.startsAt))).toEqual([
      "2026-10-23T22:00:00.000Z",
      "2026-10-24T22:00:00.000Z",
      "2026-10-25T23:00:00.000Z",
    ]);
    expect(iso(w.end)).toBe("2026-10-26T22:59:00.000Z");
  });

  it("un giorno solo con orario: un blocco solo", () => {
    const w = buildLeaveWindow({ startDate: "2026-12-14", startTime: "09:30", endDate: "2026-12-14" });
    expect(w.blocks).toHaveLength(1);
    expect(iso(romeDateTimeToUtc("2026-12-14", "09:30"))).toBe("2026-12-14T08:30:00.000Z");
  });
});
