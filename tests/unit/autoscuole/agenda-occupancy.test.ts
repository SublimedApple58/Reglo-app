import {
  buildDeclaredIntervals,
  computeAgendaOccupancy,
  romeNoonDays,
  romeYmdKey,
  sumOccupancy,
  type AvailabilityDayResolver,
} from "@/lib/autoscuole/agenda-occupancy";
import { romeWallClockToInstant } from "@/lib/backoffice/agenda-saturation";

/** Un istante di orologio italiano in un giorno preciso: niente Date locali. */
const rome = (day: number, hour: number, minute = 0) =>
  romeWallClockToInstant(2026, 9, day, hour * 60 + minute);
const iv = (from: number, to: number) => ({ start: from, end: to });

/** Resolver finto: stesse fasce tutti i giorni indicati. */
const fixedResolver = (
  daysOfWeek: number[],
  ranges: Array<{ startMinutes: number; endMinutes: number }>,
): AvailabilityDayResolver => ({
  resolve: () => ({ daysOfWeek, ranges }),
});

describe("occupazione agenda — il conto", () => {
  it("rapporta le ore occupate a quelle disponibili", () => {
    const out = computeAgendaOccupancy({
      declared: [iv(rome(14, 9), rome(14, 13))], // 4h
      blocks: [],
      busy: [iv(rome(14, 9), rome(14, 10)), iv(rome(14, 11), rome(14, 12))], // 2h
    });
    expect(out.availableMinutes).toBe(240);
    expect(out.busyMinutes).toBe(120);
    expect(out.outsideMinutes).toBe(0);
    expect(out.ratio).toBeCloseTo(0.5);
  });

  it("toglie ferie e malattia dalle ore disponibili, non dalle dichiarate", () => {
    const out = computeAgendaOccupancy({
      declared: [iv(rome(14, 9), rome(14, 13))],
      blocks: [iv(rome(14, 11), rome(14, 13))], // 2h di ferie
      busy: [iv(rome(14, 9), rome(14, 10))],
    });
    expect(out.declaredMinutes).toBe(240);
    expect(out.availableMinutes).toBe(120);
    expect(out.busyMinutes).toBe(60);
    expect(out.ratio).toBeCloseTo(0.5);
  });

  it("conta a parte le guide svolte fuori dalle fasce dichiarate", () => {
    const out = computeAgendaOccupancy({
      declared: [iv(rome(14, 9), rome(14, 13))],
      blocks: [],
      busy: [iv(rome(14, 8), rome(14, 10))], // un'ora dentro, una prima dell'apertura
    });
    expect(out.busyMinutes).toBe(60);
    expect(out.outsideMinutes).toBe(60);
    expect(out.ratio).toBeCloseTo(0.25);
  });

  it("non conta due volte i posti della stessa guida di gruppo", () => {
    // Tre posti + il contenitore del gruppo: stessa ora, una volta sola.
    const slot = iv(rome(14, 10), rome(14, 11));
    const out = computeAgendaOccupancy({
      declared: [iv(rome(14, 9), rome(14, 13))],
      blocks: [],
      busy: [slot, slot, slot, slot],
    });
    expect(out.busyMinutes).toBe(60);
  });

  it("senza disponibilità dichiarata il rapporto è 0, non NaN", () => {
    const out = computeAgendaOccupancy({
      declared: [],
      blocks: [],
      busy: [iv(rome(14, 10), rome(14, 11))],
    });
    expect(out.availableMinutes).toBe(0);
    expect(out.ratio).toBe(0);
    expect(out.outsideMinutes).toBe(60);
  });

  it("un'agenda completamente bloccata resta distinguibile da una vuota", () => {
    const blocked = computeAgendaOccupancy({
      declared: [iv(rome(14, 9), rome(14, 13))],
      blocks: [iv(rome(14, 8), rome(14, 20))],
      busy: [],
    });
    expect(blocked.declaredMinutes).toBe(240);
    expect(blocked.availableMinutes).toBe(0);

    const empty = computeAgendaOccupancy({ declared: [], blocks: [], busy: [] });
    expect(empty.declaredMinutes).toBe(0);
  });
});

describe("occupazione agenda — somma di più istruttori", () => {
  it("rifà il rapporto sui totali, non la media dei rapporti", () => {
    // Uno pieno con 2h dichiarate, uno vuoto con 40h: la media dei rapporti
    // direbbe 50%, la verità è 2/42.
    const pieno = computeAgendaOccupancy({
      declared: [iv(rome(14, 9), rome(14, 11))],
      blocks: [],
      busy: [iv(rome(14, 9), rome(14, 11))],
    });
    const vuoto = computeAgendaOccupancy({
      declared: [iv(rome(15, 0), rome(15, 0) + 40 * 3_600_000)],
      blocks: [],
      busy: [],
    });
    const total = sumOccupancy([pieno, vuoto]);
    expect(total.availableMinutes).toBe(42 * 60);
    expect(total.busyMinutes).toBe(120);
    expect(total.ratio).toBeCloseTo(2 / 42);
  });

  it("su un elenco vuoto non esplode", () => {
    expect(sumOccupancy([]).ratio).toBe(0);
  });
});

describe("occupazione agenda — dalle fasce agli istanti", () => {
  // Lun 14 settembre 2026 00:00 UTC → domenica 20 compresa.
  const weekStart = new Date("2026-09-14T00:00:00Z");
  const weekEnd = new Date("2026-09-21T00:00:00Z");

  it("copre sette giorni italiani, uno per giorno", () => {
    const days = romeNoonDays(weekStart, weekEnd);
    expect(days).toHaveLength(7);
    expect(days.map(romeYmdKey)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("materializza le fasce solo nei giorni attivi della settimana tipo", () => {
    // Lunedì e mercoledì, 9–13.
    const out = buildDeclaredIntervals({
      instructorId: "i1",
      days: romeNoonDays(weekStart, weekEnd),
      resolver: fixedResolver([1, 3], [{ startMinutes: 540, endMinutes: 780 }]),
      closedDays: new Set(),
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(iv(rome(14, 9), rome(14, 13)));
    expect(out[1]).toEqual(iv(rome(16, 9), rome(16, 13)));
  });

  it("salta i giorni di chiusura dell'autoscuola", () => {
    const out = buildDeclaredIntervals({
      instructorId: "i1",
      days: romeNoonDays(weekStart, weekEnd),
      resolver: fixedResolver([1, 3], [{ startMinutes: 540, endMinutes: 780 }]),
      closedDays: new Set(["2026-09-16"]),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(iv(rome(14, 9), rome(14, 13)));
  });

  it("le fasce sono ore italiane, non UTC", () => {
    // A settembre Roma è UTC+2: le 9:00 italiane sono le 7:00 UTC.
    const out = buildDeclaredIntervals({
      instructorId: "i1",
      days: romeNoonDays(weekStart, weekEnd),
      resolver: fixedResolver([1], [{ startMinutes: 540, endMinutes: 600 }]),
      closedDays: new Set(),
    });
    expect(new Date(out[0].start).toISOString()).toBe("2026-09-14T07:00:00.000Z");
  });

  it("regge il cambio dell'ora legale senza perdere né sdoppiare un giorno", () => {
    // L'ora legale 2026 finisce domenica 25 ottobre.
    const from = new Date("2026-10-19T00:00:00Z");
    const to = new Date("2026-10-26T00:00:00Z");
    const days = romeNoonDays(from, to);
    expect(days.map(romeYmdKey)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    const out = buildDeclaredIntervals({
      instructorId: "i1",
      days,
      resolver: fixedResolver([0, 1], [{ startMinutes: 540, endMinutes: 600 }]),
      closedDays: new Set(),
    });
    // Lunedì 19 (ora legale, UTC+2) e domenica 25 (ora solare, UTC+1): in
    // entrambi i casi sono le 9:00 sull'orologio italiano.
    expect(new Date(out[0].start).toISOString()).toBe("2026-10-19T07:00:00.000Z");
    expect(new Date(out[1].start).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(out.every((i) => i.end - i.start === 3_600_000)).toBe(true);
  });

  it("ignora le fasce a durata nulla o rovesciata", () => {
    const out = buildDeclaredIntervals({
      instructorId: "i1",
      days: romeNoonDays(weekStart, weekEnd),
      resolver: fixedResolver(
        [1],
        [
          { startMinutes: 540, endMinutes: 540 },
          { startMinutes: 780, endMinutes: 600 },
        ],
      ),
      closedDays: new Set(),
    });
    expect(out).toEqual([]);
  });
});
