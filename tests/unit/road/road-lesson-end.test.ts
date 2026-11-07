import { alignLessonEndToRoad, roadDriveEnd, roadEarlyKeepsDuration, roadLessonEnd, roadLessonStart, slidLessonPause } from "@/lib/autoscuole/road/lesson-end";

const at = (hm: string) => new Date(`2026-11-04T${hm}:00.000Z`);

type Row = { id: string; startsAt: Date; endsAt: Date };

/** DB finta: la guida, la sua pausa e cosa viene dopo nell'agenda dell'istruttore. */
function fakeDb(opts: { lesson: Row; pause?: Row | null; nextLesson?: Date | null; nextBlock?: Date | null }) {
  const writes: Array<{ what: string; data?: unknown }> = [];
  const db = {
    autoscuolaAppointment: {
      findUnique: jest.fn(async () => ({ ...opts.lesson, companyId: "c", instructorId: "i" })),
      findFirst: jest.fn(async () => (opts.nextLesson ? { startsAt: opts.nextLesson } : null)),
      update: jest.fn(async (args: { data: unknown }) => writes.push({ what: "lesson", data: args.data })),
    },
    autoscuolaInstructorBlock: {
      findFirst: jest.fn(async (args: { where: { reason?: string } }) => {
        if (args.where.reason === "lesson_buffer") return opts.pause ?? null;
        return opts.nextBlock ? { startsAt: opts.nextBlock } : null;
      }),
      update: jest.fn(async (args: { data: unknown }) => writes.push({ what: "pause", data: args.data })),
      delete: jest.fn(async () => writes.push({ what: "pause-deleted" })),
    },
  };
  return { db: db as never, writes };
}

describe("REG-723 roadLessonEnd: la fine segue l'orario reale", () => {
  it("si accorcia se la guida prenotata finisce prima (arrotondata ai 5 minuti)", () => {
    expect(roadLessonEnd(at("10:00"), at("11:00"), new Date("2026-11-04T10:41:10Z"), null)).toEqual(at("10:45"));
  });

  it("si allunga se sfora, senza impegni dopo", () => {
    expect(roadLessonEnd(at("17:43"), at("18:13"), new Date("2026-11-04T18:28:00.154Z"), null)).toEqual(at("18:30"));
  });

  it("si allunga al massimo fino al prossimo impegno", () => {
    expect(roadLessonEnd(at("10:00"), at("11:00"), at("11:20"), at("11:10"))).toEqual(at("11:10"));
  });

  it("un impegno che inizia alla fine prenotata: non si allunga", () => {
    expect(roadLessonEnd(at("10:00"), at("11:00"), at("11:20"), at("11:00"))).toEqual(at("11:00"));
  });

  it("dura almeno 5 minuti", () => {
    expect(roadLessonEnd(at("10:00"), at("11:00"), new Date("2026-11-04T10:00:30Z"), null)).toEqual(at("10:05"));
  });
});

describe("REG-723 slidLessonPause", () => {
  const pause = { startsAt: at("18:13"), endsAt: at("18:18") };

  it("slitta con la stessa durata", () => {
    expect(slidLessonPause(pause, at("18:30"), null)).toEqual({ startsAt: at("18:30"), endsAt: at("18:35") });
  });

  it("si accorcia se finirebbe sopra la guida dopo", () => {
    expect(slidLessonPause(pause, at("18:30"), at("18:32"))).toEqual({ startsAt: at("18:30"), endsAt: at("18:32") });
  });

  it("si toglie se non ci sta più", () => {
    expect(slidLessonPause(pause, at("18:30"), at("18:30"))).toBeNull();
  });
});

describe("REG-723 alignLessonEndToRoad", () => {
  it("caso del 4/11: 18:43–19:13 terminata alle 19:28 → fine 19:30 e pausa 19:30–19:35", async () => {
    // Orari UTC: 17:43–18:13 prenotata, chiusa alle 18:28.
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("17:43"), endsAt: at("18:13") },
      pause: { id: "p", startsAt: at("18:13"), endsAt: at("18:18") },
    });
    expect(await alignLessonEndToRoad(db, "a", new Date("2026-11-04T18:28:00.154Z"))).toBe(true);
    expect(writes).toEqual([
      { what: "lesson", data: { endsAt: at("18:30") } },
      { what: "pause", data: { startsAt: at("18:30"), endsAt: at("18:35") } },
    ]);
  });

  it("sforo con una guida dopo: si ferma al suo inizio e la pausa si toglie", async () => {
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("10:00"), endsAt: at("11:00") },
      pause: { id: "p", startsAt: at("11:00"), endsAt: at("11:15") },
      nextLesson: at("11:15"),
    });
    await alignLessonEndToRoad(db, "a", at("11:25"));
    expect(writes).toEqual([{ what: "lesson", data: { endsAt: at("11:15") } }, { what: "pause-deleted" }]);
  });

  it("guida prenotata finita prima: si accorcia e la pausa la segue", async () => {
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("10:00"), endsAt: at("11:00") },
      pause: { id: "p", startsAt: at("11:00"), endsAt: at("11:15") },
      nextBlock: at("12:00"),
    });
    await alignLessonEndToRoad(db, "a", at("10:48"));
    expect(writes).toEqual([
      { what: "lesson", data: { endsAt: at("10:50") } },
      { what: "pause", data: { startsAt: at("10:50"), endsAt: at("11:05") } },
    ]);
  });

  it("finita all'orario: niente da cambiare", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("10:00"), endsAt: at("11:00") } });
    expect(await alignLessonEndToRoad(db, "a", at("10:57"))).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe("REG-728 guida avviata in anticipo: inizio all'avvio, fine alla chiusura reale", () => {
  it("l'inizio diventa l'avvio arrotondato per difetto ai 5 minuti", () => {
    expect(roadLessonStart(at("09:00"), new Date("2026-11-04T08:47:30Z"))).toEqual(at("08:45"));
  });

  it("in ritardo (o senza avvio) l'inizio non cambia", () => {
    expect(roadLessonStart(at("09:00"), at("09:10"))).toEqual(at("09:00"));
    expect(roadLessonStart(at("09:00"), null)).toEqual(at("09:00"));
  });

  it("9:00–10:00 avviata alle 8:45 e finita alle 9:45 → 8:45–9:45, durata 60'", async () => {
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") },
      pause: { id: "p", startsAt: at("10:00"), endsAt: at("10:10") },
      nextLesson: at("11:00"),
    });
    expect(await alignLessonEndToRoad(db, "a", at("09:45"), at("08:45"))).toBe(true);
    expect(writes).toEqual([
      { what: "lesson", data: { startsAt: at("08:45"), endsAt: at("09:45") } },
      { what: "pause", data: { startsAt: at("09:45"), endsAt: at("09:55") } },
    ]);
  });

  it("avviata in anticipo e guidata fino alla fine prenotata: 8:45–10:00, 75'", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") } });
    await alignLessonEndToRoad(db, "a", at("10:00"), at("08:45"));
    expect(writes).toEqual([{ what: "lesson", data: { startsAt: at("08:45"), endsAt: at("10:00") } }]);
  });

  it("la fine NON scala con l'anticipo: chiusa alle 9:52 → 8:45–9:55", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") } });
    await alignLessonEndToRoad(db, "a", new Date("2026-11-04T09:52:10Z"), new Date("2026-11-04T08:47:00Z"));
    expect(writes).toEqual([{ what: "lesson", data: { startsAt: at("08:45"), endsAt: at("09:55") } }]);
  });

  it("in anticipo e oltre la fine prenotata: si ferma al prossimo impegno, non prima della fine prenotata", async () => {
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") },
      nextLesson: at("10:15"),
    });
    await alignLessonEndToRoad(db, "a", at("10:30"), at("08:45"));
    expect(writes).toEqual([{ what: "lesson", data: { startsAt: at("08:45"), endsAt: at("10:15") } }]);
  });

  it("avviata in ritardo e chiusa all'orario: inizio e fine prenotati restano", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") } });
    await alignLessonEndToRoad(db, "a", at("10:00"), at("09:10"));
    expect(writes).toEqual([]);
  });
});

describe("Ricca: «Mantieni la durata prenotata» per le guide avviate in anticipo", () => {
  it("l'impostazione è spenta di default (Orari reali)", () => {
    expect(roadEarlyKeepsDuration({})).toBe(false);
    expect(roadEarlyKeepsDuration({ roadEarlyKeepDuration: true })).toBe(true);
  });

  it("in guida: 9:00–10:00 avviata alle 8:47 → fine 9:45; spenta o in ritardo resta 10:00", () => {
    expect(roadDriveEnd(at("09:00"), at("10:00"), new Date("2026-11-04T08:47:30Z"), true)).toEqual(at("09:45"));
    expect(roadDriveEnd(at("09:00"), at("10:00"), at("08:45"), false)).toEqual(at("10:00"));
    expect(roadDriveEnd(at("09:00"), at("10:00"), at("09:05"), true)).toEqual(at("10:00"));
    expect(roadDriveEnd(at("09:00"), at("10:00"), null, true)).toEqual(at("10:00"));
  });

  it("avviata alle 8:45 e chiusa alle 9:30 → 8:45–9:45 (la durata resta 60'), pausa dopo", async () => {
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") },
      pause: { id: "p", startsAt: at("10:00"), endsAt: at("10:10") },
      nextLesson: at("11:00"),
    });
    expect(await alignLessonEndToRoad(db, "a", at("09:30"), at("08:45"), true)).toBe(true);
    expect(writes).toEqual([
      { what: "lesson", data: { startsAt: at("08:45"), endsAt: at("09:45") } },
      { what: "pause", data: { startsAt: at("09:45"), endsAt: at("09:55") } },
    ]);
  });

  it("chiusa alle 9:45 in punto → 8:45–9:45", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") } });
    await alignLessonEndToRoad(db, "a", at("09:45"), at("08:45"), true);
    expect(writes).toEqual([{ what: "lesson", data: { startsAt: at("08:45"), endsAt: at("09:45") } }]);
  });

  it("se si sfora la fine tenuta vale l'orario reale: chiusa alle 9:52 → 8:45–9:55", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") } });
    await alignLessonEndToRoad(db, "a", new Date("2026-11-04T09:52:10Z"), at("08:45"), true);
    expect(writes).toEqual([{ what: "lesson", data: { startsAt: at("08:45"), endsAt: at("09:55") } }]);
  });

  it("sfora oltre il prossimo impegno: si ferma lì", async () => {
    const { db, writes } = fakeDb({
      lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") },
      nextLesson: at("10:15"),
    });
    await alignLessonEndToRoad(db, "a", at("10:30"), at("08:45"), true);
    expect(writes).toEqual([{ what: "lesson", data: { startsAt: at("08:45"), endsAt: at("10:15") } }]);
  });

  it("avviata in ritardo: l'impostazione non c'entra (fine reale come sempre)", async () => {
    const { db, writes } = fakeDb({ lesson: { id: "a", startsAt: at("09:00"), endsAt: at("10:00") } });
    await alignLessonEndToRoad(db, "a", at("09:40"), at("09:10"), true);
    expect(writes).toEqual([{ what: "lesson", data: { endsAt: at("09:40") } }]);
  });
});
