import { buildExamPrintDays, type ExamPrintAppointment } from "@/lib/autoscuole/exam-print";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const exam = (
  id: string,
  student: [string, string, string],
  startsAt: string,
  endsAt: string | null,
  instructor: { id: string; name: string } | null,
  extra: Partial<ExamPrintAppointment> = {},
): ExamPrintAppointment => ({
  id,
  type: "esame",
  status: "scheduled",
  startsAt,
  endsAt,
  student: { id: student[0], firstName: student[1], lastName: student[2] },
  instructor,
  ...extra,
});

const ROSSI = { id: "i-rossi", name: "Marco Rossi" };
const BIANCHI = { id: "i-bianchi", name: "Elena Bianchi" };

describe("buildExamPrintDays (REG-620)", () => {
  const licenseByStudentId = new Map([
    ["s-luca", "B"],
    ["s-sara", "A2"],
  ]);

  it("raggruppa per orario + istruttore, come l'agenda", () => {
    const days = buildExamPrintDays(
      [
        exam("1", ["s-luca", "Luca", "Gallo"], at(21, 9), at(21, 10), ROSSI),
        exam("2", ["s-sara", "Sara", "Neri"], at(21, 9), at(21, 10), ROSSI),
        exam("3", ["s-ugo", "Ugo", "Riva"], at(21, 9), at(21, 10), BIANCHI),
      ],
      { licenseByStudentId, nameOrder: "nome_cognome" },
    );
    expect(days).toHaveLength(1);
    expect(days[0].rows).toHaveLength(2);
    const rossi = days[0].rows.find((r) => r.instructor === "Marco Rossi")!;
    expect(rossi.students.map((s) => [s.name, s.license])).toEqual([
      ["Luca Gallo", "B"],
      ["Sara Neri", "A2"],
    ]);
  });

  it("divide per giorno, ordina per orario e mette in cima gli esami senza orario", () => {
    const days = buildExamPrintDays(
      [
        exam("a", ["s-1", "Anna", "Fo"], at(22, 14), at(22, 15), ROSSI),
        exam("b", ["s-2", "Bea", "Lo"], at(21, 11), at(21, 12), ROSSI),
        exam("c", ["s-3", "Ciro", "Po"], at(21, 8, 30), at(21, 9, 30), BIANCHI),
        exam("d", ["s-4", "Dario", "Re"], at(21, 0), null, BIANCHI),
      ],
      { licenseByStudentId, nameOrder: "nome_cognome" },
    );
    expect(days.map((d) => d.ymd)).toEqual(["2026-10-21", "2026-10-22"]);
    expect(days[0].label).toBe("Mercoledì 21 ottobre");
    expect(days[0].rows.map((r) => r.timeLabel)).toEqual([null, "08:30 – 09:30", "11:00 – 12:00"]);
  });

  it("ignora annullati, non-esami e segnaposto; tiene note, esito e colleghi", () => {
    const days = buildExamPrintDays(
      [
        exam("1", ["s-luca", "Luca", "Gallo"], at(21, 9), at(21, 10), ROSSI, {
          notes: "  Ritrovo in motorizzazione alle 8:40 ",
          examOutcome: "idoneo",
          coInstructors: [BIANCHI],
        }),
        exam("2", ["exam-empty:2", "Esame", ""], at(21, 9), at(21, 10), ROSSI),
        exam("3", ["s-x", "X", "Y"], at(21, 11), at(21, 12), ROSSI, { status: "cancelled" }),
        { ...exam("4", ["s-z", "Z", "W"], at(21, 13), at(21, 14), ROSSI), type: "guida" },
      ],
      { licenseByStudentId, nameOrder: "cognome_nome" },
    );
    expect(days[0].rows).toHaveLength(1);
    const row = days[0].rows[0];
    expect(row.students).toEqual([{ id: "s-luca", name: "Gallo Luca", license: "B", outcome: "Idoneo" }]);
    expect(row.notes).toBe("Ritrovo in motorizzazione alle 8:40");
    expect(row.coInstructors).toEqual(["Elena Bianchi"]);
  });
});
