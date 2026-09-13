import {
  clampIntervals,
  instructorSaturation,
  intersectIntervals,
  mergeIntervals,
  subtractIntervals,
  romeWallClockToInstant,
  romeYmd,
  totalMinutes,
  withRatio,
} from "@/lib/backoffice/agenda-saturation";

// Orari di un giorno qualsiasi, in millisecondi: più leggibile di Date.now().
const h = (hour: number, minute = 0) => new Date(2026, 8, 14, hour, minute).getTime();
const iv = (from: number, to: number) => ({ start: from, end: to });

describe("saturazione — aritmetica sugli intervalli", () => {
  it("fonde le fasce che si sovrappongono o si toccano", () => {
    const out = mergeIntervals([iv(h(9), h(11)), iv(h(10), h(12)), iv(h(12), h(13))]);
    expect(out).toEqual([iv(h(9), h(13))]);
  });

  it("scarta gli intervalli a durata zero o negativa", () => {
    expect(mergeIntervals([iv(h(9), h(9)), iv(h(11), h(10))])).toEqual([]);
  });

  it("sottrae un buco in mezzo spezzando la fascia", () => {
    const out = subtractIntervals([iv(h(9), h(13))], [iv(h(10), h(11))]);
    expect(out).toEqual([iv(h(9), h(10)), iv(h(11), h(13))]);
  });

  it("sottrae un buco che copre tutto", () => {
    expect(subtractIntervals([iv(h(9), h(13))], [iv(h(8), h(20))])).toEqual([]);
  });

  it("interseca due elenchi tenendo solo la parte comune", () => {
    const out = intersectIntervals(
      [iv(h(9), h(12)), iv(h(14), h(16))],
      [iv(h(11), h(15))],
    );
    expect(out).toEqual([iv(h(11), h(12)), iv(h(14), h(15))]);
  });

  it("ritaglia dentro la finestra del periodo", () => {
    const out = clampIntervals([iv(h(6), h(20))], iv(h(9), h(18)));
    expect(out).toEqual([iv(h(9), h(18))]);
  });

  it("conta i minuti una volta sola anche con sovrapposizioni", () => {
    expect(totalMinutes([iv(h(9), h(10)), iv(h(9, 30), h(10, 30))])).toBe(90);
  });
});

describe("saturazione — per istruttore", () => {
  it("calcola ore disponibili, occupate e rapporto", () => {
    // Disponibile 9-13 (4h), due guide da un'ora dentro.
    const out = withRatio(
      instructorSaturation(
        [iv(h(9), h(13))],
        [],
        [iv(h(9), h(10)), iv(h(11), h(12))],
      ),
    );
    expect(out.availableHours).toBe(4);
    expect(out.busyHours).toBe(2);
    expect(out.outsideHours).toBe(0);
    expect(out.ratio).toBe(0.5);
  });

  it("toglie i blocchi (malattia, ferie, teoria) dalle ore disponibili", () => {
    // 9-13 dichiarate, ma 11-13 è lezione di teoria: restano 2 ore.
    const out = withRatio(instructorSaturation([iv(h(9), h(13))], [iv(h(11), h(13))], [iv(h(9), h(10))]));
    expect(out.availableHours).toBe(2);
    expect(out.busyHours).toBe(1);
    expect(out.ratio).toBe(0.5);
  });

  it("tiene le guide fuori fascia fuori dal rapporto, ma le conta a parte", () => {
    const out = withRatio(instructorSaturation([iv(h(9), h(11))], [], [iv(h(9), h(10)), iv(h(15), h(16))]));
    expect(out.busyHours).toBe(1);
    expect(out.outsideHours).toBe(1);
    expect(out.ratio).toBe(0.5);
  });

  it("non conta due volte i posti della stessa guida di gruppo", () => {
    // Tre allievi, stessa guida 9-10 con lo stesso istruttore: è un'ora, non tre.
    const seats = [iv(h(9), h(10)), iv(h(9), h(10)), iv(h(9), h(10))];
    const out = withRatio(instructorSaturation([iv(h(9), h(13))], [], seats));
    expect(out.busyHours).toBe(1);
  });

  it("senza disponibilità dichiarata il rapporto è 0, non infinito", () => {
    const out = withRatio(instructorSaturation([], [], [iv(h(9), h(10))]));
    expect(out.availableHours).toBe(0);
    expect(out.ratio).toBe(0);
    expect(out.outsideHours).toBe(1);
  });
});

describe("saturazione — orologio italiano", () => {
  it("le 9:00 di gennaio sono le 08:00 UTC (ora solare)", () => {
    const instant = romeWallClockToInstant(2026, 1, 15, 9 * 60);
    expect(new Date(instant).toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("le 9:00 di luglio sono le 07:00 UTC (ora legale)", () => {
    const instant = romeWallClockToInstant(2026, 7, 15, 9 * 60);
    expect(new Date(instant).toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("una fascia di 4 ore resta di 4 ore anche in ora legale", () => {
    const start = romeWallClockToInstant(2026, 7, 15, 9 * 60);
    const end = romeWallClockToInstant(2026, 7, 15, 13 * 60);
    expect(totalMinutes([{ start, end }])).toBe(240);
  });

  it("il giorno di calendario è quello italiano, non quello UTC", () => {
    // 23:30 UTC del 13 settembre = 01:30 del 14 a Roma.
    expect(romeYmd(new Date("2026-09-13T23:30:00.000Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
  });
});
