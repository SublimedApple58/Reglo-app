import {
  countStudentWeeklyLessons,
  countsTowardWeeklyLimit,
  weekBoundsUtc,
  weeklyLimitCountsGroupLessons,
} from "@/lib/autoscuole/weekly-lessons";

/** REG-781: conteggio settimanale unico (solo guide di guida). */
describe("weekBoundsUtc", () => {
  it("parte dal lunedì 00:00 UTC e dura 7 giorni", () => {
    const { weekStart, weekEnd } = weekBoundsUtc(new Date("2026-11-26T15:30:00Z")); // giovedì
    expect(weekStart.toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-11-30T00:00:00.000Z");
  });

  it("la domenica appartiene alla settimana iniziata il lunedì prima", () => {
    const { weekStart } = weekBoundsUtc(new Date("2026-11-29T20:00:00Z"));
    expect(weekStart.toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
});

describe("weeklyLimitCountsGroupLessons (impostazione, default sì)", () => {
  it.each([
    [undefined, true],
    [{}, true],
    [{ weeklyLimitCountsGroupLessons: true }, true],
    [{ weeklyLimitCountsGroupLessons: false }, false],
    [{ weeklyLimitCountsGroupLessons: "no" }, true],
  ])("%j → %s", (limits, expected) => {
    expect(weeklyLimitCountsGroupLessons(limits as Record<string, unknown> | undefined)).toBe(expected);
  });
});

describe("countsTowardWeeklyLimit", () => {
  const group = { type: "group_lesson", groupLessonId: "g1" };
  it.each([
    [{ type: "guida" }, true],
    [{ type: "autostrada" }, true],
    [{ type: "esame" }, false],
    [{ type: " Esame " }, false],
    [group, true],
    [{ type: null }, true],
  ])("con le guide di gruppo che contano: %j → %s", (appointment, expected) => {
    expect(countsTowardWeeklyLimit(appointment)).toBe(expected);
  });

  it("con l'impostazione spenta il posto di gruppo non conta, l'esame mai", () => {
    expect(countsTowardWeeklyLimit(group, { includeGroupLessons: false })).toBe(false);
    expect(countsTowardWeeklyLimit({ type: "guida" }, { includeGroupLessons: false })).toBe(true);
    expect(countsTowardWeeklyLimit({ type: "esame" }, { includeGroupLessons: true })).toBe(false);
  });
});

describe("countStudentWeeklyLessons", () => {
  const makeClient = (rows: Array<{ startsAt: Date; endsAt: Date | null }>) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    return { client: { autoscuolaAppointment: { findMany } } as never, findMany };
  };

  it("esclude esami e annullate, conta i posti di gruppo (default) e somma i minuti", async () => {
    const { client, findMany } = makeClient([
      { startsAt: new Date("2026-11-24T08:00:00Z"), endsAt: new Date("2026-11-24T09:00:00Z") },
      { startsAt: new Date("2026-11-25T08:00:00Z"), endsAt: new Date("2026-11-25T10:00:00Z") },
      { startsAt: new Date("2026-11-26T08:00:00Z"), endsAt: null },
    ]);

    const result = await countStudentWeeklyLessons({
      companyId: "c1",
      studentId: "s1",
      at: new Date("2026-11-26T12:00:00Z"),
      client,
    });

    expect(result).toEqual({ lessons: 3, minutes: 60 + 120 + 60 });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      companyId: "c1",
      studentId: "s1",
      status: { notIn: ["cancelled"] },
      NOT: { type: { equals: "esame", mode: "insensitive" } },
      startsAt: {
        gte: new Date("2026-11-23T00:00:00.000Z"),
        lt: new Date("2026-11-30T00:00:00.000Z"),
      },
    });
    expect(where.id).toBeUndefined();
    expect(where).not.toHaveProperty("groupLessonId");
  });

  it("con «Le guide di gruppo contano» spenta esclude i posti di gruppo", async () => {
    const { client, findMany } = makeClient([]);
    await countStudentWeeklyLessons({
      companyId: "c1",
      studentId: "s1",
      at: new Date("2026-11-26T12:00:00Z"),
      includeGroupLessons: false,
      client,
    });
    expect(findMany.mock.calls[0][0].where.groupLessonId).toBeNull();
  });

  it("esclude la guida che si sta spostando o scambiando", async () => {
    const { client, findMany } = makeClient([]);
    await countStudentWeeklyLessons({
      companyId: "c1",
      studentId: "s1",
      at: new Date("2026-11-26T12:00:00Z"),
      excludeAppointmentId: "a1",
      client,
    });
    expect(findMany.mock.calls[0][0].where.id).toEqual({ not: "a1" });
  });
});
