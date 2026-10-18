"use client";

import React from "react";
import { GraduationCap, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { RangeCalendar, dateOfYmd } from "@/components/pages/Autoscuole/dialogs/RangeCalendar";
import {
  EXAM_PRINT_FIELDS,
  type ExamPrintDay,
  type ExamPrintField,
} from "@/lib/autoscuole/exam-print";

// ─────────────────────────────────────────────────────────────────────────────
// Stampa "Solo esami" (REG-620): passo di scelta (periodo + dettagli) e foglio
// A4 con la tabella degli esami per giorno. Vive dentro AgendaPrintDialog, che
// gestisce overlay, barra strumenti e regole @media print.
// ─────────────────────────────────────────────────────────────────────────────

const shortDay = (ds: string, withYear = false) =>
  dateOfYmd(ds).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  });

/** "dal 20 al 24 ottobre 2026" / "il 21 ottobre 2026" */
export function examRangeLabel(from: string, to: string) {
  if (from === to) return `il ${shortDay(from, true)}`;
  // Stesso mese → "dal 26 al 30 ottobre 2026", senza ripetere il mese.
  const fromLabel =
    from.slice(0, 7) === to.slice(0, 7)
      ? String(dateOfYmd(from).getDate())
      : shortDay(from, from.slice(0, 4) !== to.slice(0, 4));
  return `dal ${fromLabel} al ${shortDay(to, true)}`;
}

/** Le dipendenze tra i dettagli: patente ed esito si leggono accanto all'allievo. */
const needsStudents = (key: ExamPrintField) => key === "license" || key === "outcome";

export function ExamPrintSetup({
  rangeStart,
  rangeEnd,
  onRangeChange,
  fields,
  onFieldsChange,
}: {
  rangeStart: string | null;
  rangeEnd: string | null;
  onRangeChange: (start: string | null, end: string | null) => void;
  fields: ExamPrintField[];
  onFieldsChange: (next: ExamPrintField[]) => void;
}) {
  const has = (key: ExamPrintField) => fields.includes(key);
  const toggle = (key: ExamPrintField) => {
    if (has(key)) {
      // Senza allievi, patente ed esito non hanno dove stare.
      onFieldsChange(fields.filter((f) => f !== key && !(key === "students" && needsStudents(f))));
    } else {
      onFieldsChange([...fields, key]);
    }
  };

  const info = !rangeStart
    ? "Scegli il primo giorno"
    : !rangeEnd
      ? "Ora scegli l'ultimo giorno"
      : examRangeLabel(rangeStart, rangeEnd).replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col gap-7">
      <section data-testid="exam-print-period">
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <h3 className="text-[15px] font-semibold text-[#222222]">Periodo</h3>
          <span className="text-[13px] font-medium text-[#6a6a6a]">{info}</span>
        </div>
        <p className="mb-4 text-[13px] text-[#929292]">
          Clicca il primo e l&apos;ultimo giorno, oppure trascina. Non dipende dalla settimana
          che stai guardando in agenda.
        </p>
        <RangeCalendar
          mode="multiplo"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onChange={onRangeChange}
        />
      </section>

      <section data-testid="exam-print-fields" className="border-t border-[#f0f0f0] pt-6">
        <h3 className="mb-1 text-[15px] font-semibold text-[#222222]">Dettagli da stampare</h3>
        <p className="mb-4 text-[13px] text-[#929292]">
          Già spuntati quelli che vedi sul blocco esame in agenda.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {EXAM_PRINT_FIELDS.map((f) => {
            const checked = has(f.key);
            const disabled = needsStudents(f.key) && !has("students");
            return (
              <label
                key={f.key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[12px] border-[1.5px] px-3.5 py-3 transition-colors",
                  checked ? "border-[#222222] bg-white" : "border-[#ebebeb] bg-white hover:border-[#d6d6d6]",
                  disabled && "cursor-not-allowed opacity-45",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => toggle(f.key)}
                  className="size-[18px] rounded-[5px] border-[#c8c8c8] data-[state=checked]:border-[#111111] data-[state=checked]:bg-[#111111]"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold leading-tight text-[#222222]">
                    {f.label}
                  </span>
                  <span className="block truncate text-[12px] leading-snug text-[#929292]">
                    {disabled ? "Serve anche «Allievi»" : f.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function ExamPrintSheet({
  days,
  fields,
  rangeLabel,
  generatedAt,
}: {
  days: ExamPrintDay[];
  fields: ExamPrintField[];
  rangeLabel: string;
  generatedAt: string;
}) {
  const has = (key: ExamPrintField) => fields.includes(key);
  const examCount = days.reduce((n, d) => n + d.rows.length, 0);
  const studentCount = days.reduce(
    (n, d) => n + d.rows.reduce((m, r) => m + r.students.length, 0),
    0,
  );
  const showInstructorCol = has("instructor") || has("coInstructors");

  return (
    <>
      {/* Intestazione foglio */}
      <div className="mb-6 flex items-start justify-between gap-6 border-b border-[#e6e6e6] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[22px] font-bold leading-tight tracking-[-0.3px] text-[#111111]">
            <GraduationCap className="size-[22px]" strokeWidth={1.9} />
            Esami
          </div>
          <div className="mt-1 text-[14px] font-medium text-[#555]">
            {rangeLabel.replace(/^./, (c) => c.toUpperCase())}
          </div>
        </div>
        <div className="text-right text-[11.5px] leading-relaxed text-[#888]">
          <div className="font-semibold text-[#555]">
            {examCount} {examCount === 1 ? "esame" : "esami"} · {studentCount}{" "}
            {studentCount === 1 ? "allievo" : "allievi"}
          </div>
          <div>Generato il {generatedAt}</div>
        </div>
      </div>

      {examCount === 0 ? (
        <div className="flex h-[180px] items-center justify-center rounded-lg bg-[#fafafa] text-[13.5px] text-[#999]">
          Nessun esame nel periodo scelto.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.ymd} className="exam-print-day" data-exam-day={day.ymd}>
              <div className="mb-1.5 flex items-baseline justify-between border-b-2 border-[#111111] pb-1.5">
                <h2 className="text-[14.5px] font-bold text-[#111111]">{day.label}</h2>
                <span className="text-[11.5px] font-semibold text-[#888]">
                  {day.rows.length} {day.rows.length === 1 ? "esame" : "esami"}
                </span>
              </div>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#999]">
                    {has("time") && <th className="w-[124px] py-1.5 pr-3 font-semibold">Orario</th>}
                    {showInstructorCol && <th className="w-[170px] py-1.5 pr-3 font-semibold">Istruttore</th>}
                    <th className="py-1.5 pr-3 font-semibold">{has("students") ? "Allievi" : "Iscritti"}</th>
                    {has("notes") && <th className="w-[190px] py-1.5 font-semibold">Note</th>}
                  </tr>
                </thead>
                <tbody>
                  {day.rows.map((row) => (
                    <tr
                      key={row.key}
                      className="exam-print-row border-t border-[#ececec] align-top text-[12px] text-[#222]"
                    >
                      {has("time") && (
                        <td className="py-2.5 pr-3">
                          {row.timeLabel ? (
                            <span className="font-semibold tabular-nums">{row.timeLabel}</span>
                          ) : (
                            <span className="inline-block whitespace-nowrap rounded-[5px] border border-dashed border-[#b5b5b5] px-1.5 py-[1px] text-[10.5px] font-semibold text-[#6a6a6a]">
                              Orario da definire
                            </span>
                          )}
                        </td>
                      )}
                      {showInstructorCol && (
                        <td className="py-2.5 pr-3">
                          {has("instructor") && (
                            <div className="font-semibold">{row.instructor ?? "—"}</div>
                          )}
                          {has("coInstructors") && row.coInstructors.length > 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#6a6a6a]">
                              <Link2 className="size-3 shrink-0" strokeWidth={2.2} aria-hidden />
                              con {row.coInstructors.join(", ")}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 pr-3">
                        {row.students.length === 0 ? (
                          <span className="italic text-[#999]">Nessun allievo</span>
                        ) : has("students") ? (
                          <ul className="flex flex-col gap-[3px]">
                            {row.students.map((s) => (
                              <li key={s.id} className="flex items-center gap-1.5">
                                <span className="font-medium">{s.name}</span>
                                {has("license") && s.license && (
                                  <span className="rounded-[4px] bg-[#f1f1f1] px-1.5 py-[1px] text-[10px] font-semibold text-[#555]">
                                    {s.license}
                                  </span>
                                )}
                                {has("outcome") && s.outcome && (
                                  <span
                                    className={cn(
                                      "text-[10.5px] font-semibold",
                                      s.outcome === "Idoneo" ? "text-[#1a7f37]" : "text-[#b42318]",
                                    )}
                                  >
                                    {s.outcome}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="font-medium">
                            {row.students.length} {row.students.length === 1 ? "allievo" : "allievi"}
                          </span>
                        )}
                      </td>
                      {has("notes") && (
                        <td className="py-2.5 text-[11.5px] leading-snug text-[#555]">
                          {row.notes ?? <span className="text-[#c4c4c4]">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
