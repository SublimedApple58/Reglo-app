import {
  DEFAULT_LESSON_BUFFER_MINUTES,
  isLessonBufferEnabled,
  lacksRoomForLessonBuffer,
  normalizeLessonBufferMinutes,
  resolveLessonBufferMinutes,
  resolveLessonBufferWindow,
} from "@/lib/autoscuole/lesson-buffer";

const at = (hhmm: string) => new Date(`2026-09-21T${hhmm}:00.000Z`);

/**
 * Finto client Prisma: risponde con il primo impegno che cade nella finestra
 * chiesta, esattamente come fa il `findFirst` vero (`startsAt < end` e
 * `endsAt > start`).
 */
type Row = { startsAt: Date; endsAt: Date; reason?: string | null };
type Where = {
  startsAt: { lt: Date };
  endsAt: { gt: Date };
  OR?: Array<{ reason?: null | { not: string }; startsAt?: { not: Date } }>;
};

const matchesOr = (r: Row, or: Where["OR"]) =>
  !or ||
  or.some((c) =>
    c.reason === null
      ? r.reason == null
      : c.reason
        ? r.reason != null && r.reason !== c.reason.not
        : r.startsAt.getTime() !== c.startsAt!.not.getTime(),
  );

const fakeDb = (rows: { appointments?: Row[]; blocks?: Row[] }) => {
  const pick = (list: Row[], where: Where) =>
    list
      .filter(
        (r) =>
          r.startsAt < where.startsAt.lt && r.endsAt > where.endsAt.gt && matchesOr(r, where.OR),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;

  return {
    autoscuolaAppointment: {
      findFirst: async ({ where }: never) =>
        pick(rows.appointments ?? [], where as never),
    },
    autoscuolaInstructorBlock: {
      findFirst: async ({ where }: never) => pick(rows.blocks ?? [], where as never),
    },
  } as never;
};

describe("normalizeLessonBufferMinutes", () => {
  it("falls back to the default for non-numeric values", () => {
    expect(normalizeLessonBufferMinutes(undefined)).toBe(DEFAULT_LESSON_BUFFER_MINUTES);
    expect(normalizeLessonBufferMinutes("15")).toBe(DEFAULT_LESSON_BUFFER_MINUTES);
    expect(normalizeLessonBufferMinutes(Number.NaN)).toBe(DEFAULT_LESSON_BUFFER_MINUTES);
  });

  it("rounds to the 5-minute step and clamps to 5..60", () => {
    expect(normalizeLessonBufferMinutes(13)).toBe(15);
    expect(normalizeLessonBufferMinutes(12)).toBe(10);
    expect(normalizeLessonBufferMinutes(0)).toBe(5);
    expect(normalizeLessonBufferMinutes(-30)).toBe(5);
    expect(normalizeLessonBufferMinutes(999)).toBe(60);
  });
});

describe("resolveLessonBufferMinutes", () => {
  it("is 0 while the setting is off — the default for every existing school", () => {
    expect(isLessonBufferEnabled({})).toBe(false);
    expect(resolveLessonBufferMinutes({})).toBe(0);
    expect(resolveLessonBufferMinutes({ lessonBufferMinutes: 30 })).toBe(0);
    expect(resolveLessonBufferMinutes(null)).toBe(0);
  });

  it("returns the configured minutes once enabled", () => {
    expect(resolveLessonBufferMinutes({ lessonBufferEnabled: true })).toBe(15);
    expect(
      resolveLessonBufferMinutes({ lessonBufferEnabled: true, lessonBufferMinutes: 20 }),
    ).toBe(20);
  });
});

describe("resolveLessonBufferWindow", () => {
  const base = {
    companyId: "c1",
    instructorId: "i1",
    lessonEndsAt: at("11:00"),
    bufferMinutes: 15,
  };

  it("gives the full buffer when the instructor has nothing after the lesson", async () => {
    const window = await resolveLessonBufferWindow({ ...base, db: fakeDb({}) });
    expect(window).toEqual({ startsAt: at("11:00"), endsAt: at("11:15") });
  });

  it("truncates on the next lesson instead of overlapping it", async () => {
    const window = await resolveLessonBufferWindow({
      ...base,
      db: fakeDb({ appointments: [{ startsAt: at("11:10"), endsAt: at("12:10") }] }),
    });
    expect(window).toEqual({ startsAt: at("11:00"), endsAt: at("11:10") });
  });

  it("truncates on an existing block too", async () => {
    const window = await resolveLessonBufferWindow({
      ...base,
      db: fakeDb({ blocks: [{ startsAt: at("11:05"), endsAt: at("11:30") }] }),
    });
    expect(window).toEqual({ startsAt: at("11:00"), endsAt: at("11:05") });
  });

  it("returns null when the lesson exactly fills the gap", async () => {
    const window = await resolveLessonBufferWindow({
      ...base,
      db: fakeDb({ appointments: [{ startsAt: at("11:00"), endsAt: at("12:00") }] }),
    });
    expect(window).toBeNull();
  });

  it("ignores the leftover pause of a lesson cancelled in the same slot (REG-623)", async () => {
    // Guida 10–11 annullata: la sua pausa 11:00–11:15 resta. Il sostituto 10–11
    // la eredita, non ci inciampa.
    const window = await resolveLessonBufferWindow({
      ...base,
      db: fakeDb({ blocks: [{ startsAt: at("11:00"), endsAt: at("11:15"), reason: "lesson_buffer" }] }),
    });
    expect(window).toEqual({ startsAt: at("11:00"), endsAt: at("11:15") });
  });

  it("still stops on a manual block or a later pause at the end of the lesson", async () => {
    for (const reason of [null, "ferie"]) {
      const window = await resolveLessonBufferWindow({
        ...base,
        db: fakeDb({ blocks: [{ startsAt: at("11:00"), endsAt: at("12:00"), reason }] }),
      });
      expect(window).toBeNull();
    }
    const window = await resolveLessonBufferWindow({
      ...base,
      db: fakeDb({ blocks: [{ startsAt: at("11:05"), endsAt: at("11:20"), reason: "lesson_buffer" }] }),
    });
    expect(window).toEqual({ startsAt: at("11:00"), endsAt: at("11:05") });
  });

  it("returns null when the buffer is off", async () => {
    const window = await resolveLessonBufferWindow({
      ...base,
      bufferMinutes: 0,
      db: fakeDb({}),
    });
    expect(window).toBeNull();
  });
});

describe("lacksRoomForLessonBuffer", () => {
  const base = {
    companyId: "c1",
    instructorId: "i1",
    lessonEndsAt: at("11:00"),
    bufferMinutes: 15,
  };

  it("is false when the whole pause fits", async () => {
    await expect(lacksRoomForLessonBuffer({ ...base, db: fakeDb({}) })).resolves.toBe(false);
  });

  it("is true when the lesson exactly fills the gap — the staff gets asked", async () => {
    await expect(
      lacksRoomForLessonBuffer({
        ...base,
        db: fakeDb({ appointments: [{ startsAt: at("11:00"), endsAt: at("12:00") }] }),
      }),
    ).resolves.toBe(true);
  });

  it("is true when only part of the pause fits", async () => {
    await expect(
      lacksRoomForLessonBuffer({
        ...base,
        db: fakeDb({ appointments: [{ startsAt: at("11:05"), endsAt: at("12:00") }] }),
      }),
    ).resolves.toBe(true);
  });

  it("does not ask for the substitute of a cancelled lesson (REG-623)", async () => {
    await expect(
      lacksRoomForLessonBuffer({
        ...base,
        db: fakeDb({ blocks: [{ startsAt: at("11:00"), endsAt: at("11:15"), reason: "lesson_buffer" }] }),
      }),
    ).resolves.toBe(false);
    // …ma chiede ancora se subito dopo c'è una guida vera.
    await expect(
      lacksRoomForLessonBuffer({
        ...base,
        db: fakeDb({
          blocks: [{ startsAt: at("11:00"), endsAt: at("11:15"), reason: "lesson_buffer" }],
          appointments: [{ startsAt: at("11:00"), endsAt: at("12:00") }],
        }),
      }),
    ).resolves.toBe(true);
  });

  it("never asks when the setting is off or there is no instructor", async () => {
    await expect(
      lacksRoomForLessonBuffer({ ...base, bufferMinutes: 0, db: fakeDb({}) }),
    ).resolves.toBe(false);
    await expect(
      lacksRoomForLessonBuffer({ ...base, instructorId: null, db: fakeDb({}) }),
    ).resolves.toBe(false);
  });
});
