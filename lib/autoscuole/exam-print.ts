import { examOutcomeLabel } from "@/lib/autoscuole/exam-outcome";
import {
  formatStudentName,
  studentNameComparator,
  type StudentNameOrder,
} from "@/lib/autoscuole/student-name-order";

/**
 * Stampa "Solo esami" (REG-620): trasforma gli appuntamenti `esame` di un
 * periodo in una tabella per giorno, una riga per esame ordinata per orario.
 *
 * Un esame è una sessione = stesso orario + stesso istruttore accompagnatore,
 * con N allievi (una riga di appuntamento per allievo): è lo stesso
 * raggruppamento dell'agenda, così la stampa conta gli stessi esami che
 * l'utente vede. Gli esami senza orario (`endsAt` assente, in agenda "Esame"
 * senza ora) vanno in cima al giorno come "orario da definire".
 */

export type ExamPrintField =
  | "time"
  | "instructor"
  | "coInstructors"
  | "students"
  | "license"
  | "notes"
  | "outcome";

export const EXAM_PRINT_FIELDS: Array<{ key: ExamPrintField; label: string; hint: string }> = [
  { key: "time", label: "Orario", hint: "Inizio e fine dell'esame" },
  { key: "instructor", label: "Istruttore", hint: "Chi accompagna gli allievi" },
  { key: "coInstructors", label: "Istruttori collegati", hint: "Colleghi sullo stesso esame" },
  { key: "students", label: "Allievi", hint: "Nome di ogni allievo iscritto" },
  { key: "license", label: "Patente", hint: "Accanto a ogni allievo" },
  { key: "notes", label: "Note", hint: "Le note scritte sull'esame" },
  { key: "outcome", label: "Esito", hint: "Idoneo o respinto, se registrato" },
];

/** Default = quello che mostra già il blocco esame in agenda. */
export const DEFAULT_EXAM_PRINT_FIELDS: ExamPrintField[] = [
  "time",
  "instructor",
  "coInstructors",
  "students",
  "license",
];

export type ExamPrintAppointment = {
  id: string;
  type: string;
  status: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  notes?: string | null;
  examOutcome?: string | null;
  student: { id: string; firstName?: string | null; lastName?: string | null };
  instructor?: { id: string; name: string | null } | null;
  coInstructors?: Array<{ id: string; name: string | null }> | null;
};

export type ExamPrintStudent = { id: string; name: string; license: string | null; outcome: string | null };

export type ExamPrintRow = {
  key: string;
  /** "09:00 – 10:30", oppure null se l'orario è da definire. */
  timeLabel: string | null;
  instructor: string | null;
  coInstructors: string[];
  students: ExamPrintStudent[];
  notes: string | null;
};

export type ExamPrintDay = {
  /** YYYY-MM-DD (ora locale). */
  ymd: string;
  /** "Martedì 21 ottobre" */
  label: string;
  rows: ExamPrintRow[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Un esame creato senza iscritti ha uno pseudo-allievo `exam-empty…`. */
const isPlaceholder = (a: ExamPrintAppointment) => a.student.id.startsWith("exam-empty");

export function buildExamPrintDays(
  appointments: ExamPrintAppointment[],
  options: {
    licenseByStudentId: Map<string, string>;
    nameOrder: StudentNameOrder;
  },
): ExamPrintDay[] {
  const byName = studentNameComparator(options.nameOrder);
  const sessions = new Map<string, ExamPrintAppointment[]>();
  for (const a of appointments) {
    if (a.type !== "esame" || a.status === "cancelled") continue;
    const start = new Date(a.startsAt).toISOString();
    const end = a.endsAt ? new Date(a.endsAt).toISOString() : "";
    const key = `${start}|${end}|${a.instructor?.id ?? "none"}`;
    const list = sessions.get(key) ?? [];
    list.push(a);
    sessions.set(key, list);
  }

  const byDay = new Map<string, Array<ExamPrintRow & { sortMin: number }>>();
  for (const [key, list] of sessions) {
    const first = list[0];
    const start = new Date(first.startsAt);
    const end = first.endsAt ? new Date(first.endsAt) : null;
    const instructorId = first.instructor?.id ?? null;
    const coById = new Map<string, string>();
    for (const a of list) {
      for (const co of a.coInstructors ?? []) {
        if (co.id !== instructorId && co.name) coById.set(co.id, co.name);
      }
    }
    const students = list
      .filter((a) => !isPlaceholder(a))
      .sort((x, y) => byName(x.student, y.student))
      .map((a) => ({
        id: a.student.id,
        name: formatStudentName(a.student, options.nameOrder),
        license: options.licenseByStudentId.get(a.student.id) ?? null,
        outcome: examOutcomeLabel(a.examOutcome),
      }));
    const notes = list.map((a) => a.notes?.trim()).find((n) => !!n) ?? null;
    const row = {
      key,
      timeLabel: end ? `${hm(start)} – ${hm(end)}` : null,
      instructor: first.instructor?.name ?? null,
      coInstructors: Array.from(coById.values()),
      students,
      notes,
      // Senza orario → in cima al giorno.
      sortMin: end ? start.getHours() * 60 + start.getMinutes() : -1,
    };
    const day = ymdOf(start);
    const rows = byDay.get(day) ?? [];
    rows.push(row);
    byDay.set(day, rows);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => {
      const [y, m, d] = day.split("-").map(Number);
      return {
        ymd: day,
        label: capitalize(
          new Date(y, m - 1, d).toLocaleDateString("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
        ),
        rows: rows
          .sort((a, b) => a.sortMin - b.sortMin || (a.instructor ?? "").localeCompare(b.instructor ?? ""))
          .map(({ sortMin: _sortMin, ...row }) => row),
      };
    });
}
