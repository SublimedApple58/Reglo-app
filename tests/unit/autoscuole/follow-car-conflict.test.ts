import { countCreatable, orderConflicts } from "@/lib/autoscuole/follow-car-conflict";

/**
 * Le due regole di lettura del foglio «Auto al seguito occupata» (REG-608).
 * Valgono identiche su web e app istruttore: se cambiano qui, cambiano la'.
 */
const entry = (index: number, hour: number, conflict = true) => ({
  index,
  startsAt: `2026-11-23T${String(hour).padStart(2, "0")}:00:00.000Z`,
  ...(conflict ? { conflict: { kind: "vehicle", label: "occupata" } } : {}),
});

describe("orderConflicts", () => {
  it("mette le date in ordine cronologico, non in quello in cui sono state scritte", () => {
    // L'utente le ha digitate 09, 15, 11: a schermo devono leggersi 09, 11, 15.
    const entries = [entry(0, 9), entry(1, 15), entry(2, 11)];
    expect(orderConflicts(entries).map((e) => e.index)).toEqual([0, 2, 1]);
  });

  it("le date libere non si elencano", () => {
    const entries = [entry(0, 9, false), entry(1, 11)];
    expect(orderConflicts(entries).map((e) => e.index)).toEqual([1]);
  });

  it("su giorni diversi conta il giorno, non solo l'ora", () => {
    const entries = [
      { index: 0, startsAt: "2026-11-24T09:00:00.000Z", conflict: {} },
      { index: 1, startsAt: "2026-11-23T15:00:00.000Z", conflict: {} },
    ];
    expect(orderConflicts(entries).map((e) => e.index)).toEqual([1, 0]);
  });
});

describe("countCreatable", () => {
  const tre = [entry(0, 9), entry(1, 11), entry(2, 15, false)];

  it("una riga ancora senza risposta non e' una guida", () => {
    // Libera: 1. Da sistemare: 2, nessuna risposta → il bottone dice 1.
    expect(countCreatable(tre, {})).toBe(1);
  });

  it("ogni riga sistemata si aggiunge al conto", () => {
    expect(countCreatable(tre, { 0: "golf" })).toBe(2);
    expect(countCreatable(tre, { 0: "golf", 1: null })).toBe(3);
  });

  it("la guida tolta non si conta, nemmeno se era libera", () => {
    expect(countCreatable(tre, { 0: "golf", 1: "remove" })).toBe(2);
    expect(countCreatable(tre, { 0: "golf", 1: "golf", 2: "remove" })).toBe(2);
  });

  it("tutte libere: il conto e' il gruppo intero", () => {
    const libere = [entry(0, 9, false), entry(1, 11, false)];
    expect(countCreatable(libere, {})).toBe(2);
  });
});
