"use client";

import { useState } from "react";
import { ClipboardCheck, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type WeakChapter = {
  chapterNumber: number;
  description: string;
  correctRate: number;
};

type StudentOverview = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  totalExams: number;
  passRate: number;
  readinessScore: number;
  lastSessionAt: string | null;
  weakChapters: WeakChapter[];
};

function ReadinessBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-100 text-emerald-700"
      : score >= 40
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", color)}>
      {score}%
    </span>
  );
}

function StudentRow({ student }: { student: StudentOverview }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-gray-50/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">{student.studentName}</p>
            <p className="text-xs text-muted-foreground">{student.studentEmail}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-foreground text-center">
          {student.totalExams}
        </td>
        <td className="px-4 py-3 text-sm text-foreground text-center">
          {student.totalExams > 0 ? `${student.passRate}%` : "—"}
        </td>
        <td className="px-4 py-3 text-center">
          <ReadinessBadge score={student.readinessScore} />
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {student.weakChapters.length > 0
            ? student.weakChapters.map((ch) => `Cap. ${ch.chapterNumber}`).join(", ")
            : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {student.lastSessionAt
            ? new Date(student.lastSessionAt).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "Mai"}
        </td>
        <td className="px-4 py-3 text-center">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground inline" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
          )}
        </td>
      </tr>
      {expanded && student.weakChapters.length > 0 && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-gray-50/60">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Capitoli deboli
              </p>
              {student.weakChapters.map((ch) => (
                <div key={ch.chapterNumber} className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-48 shrink-0">
                    Cap. {ch.chapterNumber} — {ch.description}
                  </span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        ch.correctRate >= 70
                          ? "bg-emerald-500"
                          : ch.correctRate >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500",
                      )}
                      style={{ width: `${ch.correctRate}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground w-10 text-right">
                    {ch.correctRate}%
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function QuizStudentStatsPage({
  students,
  error,
}: {
  students: StudentOverview[];
  error?: string;
}) {
  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-8 pb-10">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 pb-10 lg:px-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50">
            <ClipboardCheck className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Quiz Patente</h1>
            <p className="text-sm text-muted-foreground">
              Progresso degli studenti sui quiz teoria
            </p>
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            Nessun dato quiz disponibile. Gli studenti non hanno ancora iniziato i quiz.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-[var(--shadow-card)] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-gray-50/80 text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Studente</th>
                <th className="px-4 py-3 font-medium text-center">Esami</th>
                <th className="px-4 py-3 font-medium text-center">% Superati</th>
                <th className="px-4 py-3 font-medium text-center">Prontezza</th>
                <th className="px-4 py-3 font-medium">Capitoli deboli</th>
                <th className="px-4 py-3 font-medium">Ultimo quiz</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <StudentRow key={student.studentId} student={student} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
