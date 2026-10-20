import {
  cancellationNoticeLabel,
  findCancelledLessonBlocks,
  isCancelledBlockCandidate,
  withOfficeNotes,
  type CancelledBlockAppointment,
} from "@/lib/autoscuole/cancelled-lesson-blocks";

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).toISOString();

const appt = (
  id: string,
  start: [number, number?],
  end: [number, number?],
  extra: Partial<CancelledBlockAppointment> = {},
): CancelledBlockAppointment => ({
  id,
  type: "guida",
  status: "scheduled",
  startsAt: at(...start),
  endsAt: at(...end),
  instructorId: "i-ferri",
  student: { id: `s-${id}` },
  ...extra,
});

const cancelled = (id: string, start: [number, number?], end: [number, number?], extra: Partial<CancelledBlockAppointment> = {}) =>
  appt(id, start, end, {
    status: "cancelled",
    cancellationKind: "manual_cancel",
    cancellationReason: "manual_cancel",
    cancelledAt: new Date(2026, 9, 19, 18).toISOString(),
    ...extra,
  });

describe("blocchi guide annullate (REG-623)", () => {
  it("una guida annullata con lo slot libero diventa un blocco", () => {
    const blocks = findCancelledLessonBlocks([cancelled("a", [10], [11]), appt("b", [9], [10])]);
    expect(blocks.map((b) => b.ids)).toEqual([["a"]]);
  });

  it("sparisce da sola appena un'altra guida dello stesso istruttore occupa l'orario", () => {
    const list = [cancelled("a", [10], [11])];
    expect(findCancelledLessonBlocks(list)).toHaveLength(1);
    // Sostituto anche solo parziale (10:30–11:30) o più corto (10:00–10:30).
    expect(findCancelledLessonBlocks([...list, appt("b", [10, 30], [11, 30])])).toHaveLength(0);
    expect(findCancelledLessonBlocks([...list, appt("c", [10], [10, 30])])).toHaveLength(0);
    // Anche un esame o una guida di gruppo dell'istruttore lo occupano.
    expect(findCancelledLessonBlocks([...list, appt("d", [10], [11], { type: "esame" })])).toHaveLength(0);
    // …e un istruttore aggiuntivo conta come l'istruttore.
    expect(
      findCancelledLessonBlocks([
        ...list,
        appt("e", [10], [11], { instructorId: "i-galli", coInstructors: [{ id: "i-ferri" }] }),
      ]),
    ).toHaveLength(0);
  });

  it("non è sostituita da guide di altri istruttori, annullate o rimosse dallo storico", () => {
    const blocks = findCancelledLessonBlocks([
      cancelled("a", [10], [11]),
      appt("b", [10], [11], { instructorId: "i-galli" }),
      cancelled("c", [11], [12], { instructorId: "i-galli" }),
      appt("d", [10], [11], { status: "completed", cancellationKind: "record_cleanup" }),
      appt("e", [11], [12]),
    ]);
    expect(blocks.map((b) => b.ids)).toEqual([["a"], ["c"]]);
  });

  it("solo annullamenti dell'allievo o della segreteria, niente d'ufficio, esami o gruppi", () => {
    const base = cancelled("a", [10], [11]);
    expect(isCancelledBlockCandidate(base)).toBe(true);
    expect(isCancelledBlockCandidate({ ...base, cancellationKind: "operational_cancel", cancellationReason: "school_fault" })).toBe(true);
    expect(isCancelledBlockCandidate({ ...base, cancellationKind: "operational_cancel", cancellationReason: "instructor_sick" })).toBe(false);
    expect(isCancelledBlockCandidate({ ...base, cancellationKind: "permanent_cancel" })).toBe(false);
    expect(isCancelledBlockCandidate({ ...base, cancellationKind: "record_cleanup" })).toBe(false);
    expect(isCancelledBlockCandidate({ ...base, type: "esame" })).toBe(false);
    expect(isCancelledBlockCandidate({ ...base, type: "group_lesson", groupLessonId: "g" })).toBe(false);
    expect(isCancelledBlockCandidate({ ...base, agendaDismissedAt: at(12) })).toBe(false);
  });

  it("le annullate sovrapposte sullo stesso istruttore fanno un blocco solo, con la più recente", () => {
    const blocks = findCancelledLessonBlocks([
      cancelled("old", [10], [11], { cancelledAt: new Date(2026, 9, 18).toISOString() }),
      cancelled("new", [10], [11], { cancelledAt: new Date(2026, 9, 20).toISOString() }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].appointment.id).toBe("new");
    expect(blocks[0].ids.sort()).toEqual(["new", "old"]);
  });

  it("racconta il preavviso", () => {
    expect(cancellationNoticeLabel(at(10), at(9, 20))).toBe("40 minuti prima");
    expect(cancellationNoticeLabel(at(10), at(7))).toBe("3 ore prima");
    expect(cancellationNoticeLabel(at(10), new Date(2026, 9, 15, 10).toISOString())).toBe("6 giorni prima");
    expect(cancellationNoticeLabel(at(10), at(10, 5))).toBe("Dopo l'inizio della guida");
  });

  it("la nota del blocco arriva solo all'ufficio (REG-624)", () => {
    const data = {
      appointments: [{ id: "a", agendaNote: "proposta a Rossi e Bianchi" }, { id: "b", agendaNote: null }],
      meta: { count: 2 },
    };
    const office = withOfficeNotes(data, true);
    expect(office.appointments).toEqual(data.appointments);
    expect(office.meta).toEqual({ count: 2, officeNotes: true });
    const app = withOfficeNotes(data, false);
    expect(app.appointments).toEqual([{ id: "a" }, { id: "b" }]);
    expect(app.meta).toEqual({ count: 2, officeNotes: false });
    // I dati di partenza (la cache) non si toccano.
    expect(data.appointments[0].agendaNote).toBe("proposta a Rossi e Bianchi");
  });
});
