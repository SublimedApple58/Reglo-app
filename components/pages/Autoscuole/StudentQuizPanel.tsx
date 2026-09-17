"use client";

import * as React from "react";
import { BookOpen, GraduationCap, Lock, Target, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { quizChapterIconSrc } from "@/lib/autoscuole/quiz-chapter-icons";
import { Pill, sectionLabelClass } from "./student-detail-ui";

/**
 * Tab "Quiz" del dettaglio allievo (REG-445 + REG-446).
 *
 * Mostra al titolare la stessa situazione quiz che l'allievo vede in app mobile
 * (prontezza, % simulazioni superate, argomenti deboli) più due blocchi pensati
 * per chi insegna: progressi argomento per argomento e domande più sbagliate.
 *
 * Tre stati di placeholder, in ordine di precedenza:
 *  1. l'autoscuola non ha la fase TEORIA attiva  → la reportistica non esiste
 *  2. l'allievo non ha una licenza quiz assegnata → non può ancora esercitarsi
 *  3. licenza assegnata ma nessuna attività       → non ha ancora iniziato
 */

// Il tipo vive qui e non nell'action: `autoscuole-quiz.actions.ts` è un file
// "use server", dove `export type` non è ammesso.
export type StudentQuizDetail = {
  hasQuizAccess: boolean;
  quizSeatGrantedAt: string | null;
  studentPhase: "AWAITING" | "TEORIA" | "PRATICA" | "PATENTATO";
  totalSessions: number;
  examsTaken: number;
  examsPassed: number;
  examsFailed: number;
  examPassRate: number;
  readinessScore: number;
  coverage: {
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    attemptedPct: number;
    accuracyPct: number;
  };
  lastActivityAt: string | null;
  chaptersProgress: Array<{
    id: string;
    chapterNumber: number;
    description: string;
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    correctRate: number | null;
  }>;
  weakChapters: Array<{
    chapterNumber: number;
    description: string;
    correctRate: number;
  }>;
  mostWrongQuestions: Array<{
    id: string;
    questionText: string;
    correctAnswer: boolean;
    chapterNumber: number;
    chapterDescription: string;
    timesAnswered: number;
    timesWrong: number;
    lastAnsweredAt: string;
  }>;
  recentSessions: Array<{
    id: string;
    mode: "EXAM" | "PRACTICE" | "CHAPTER" | "REVIEW";
    status: string;
    passed: boolean | null;
    correctCount: number;
    wrongCount: number;
    totalQuestions: number;
    completedAt: string | null;
    startedAt: string;
  }>;
};

const SESSION_MODE_LABELS: Record<StudentQuizDetail["recentSessions"][number]["mode"], string> = {
  EXAM: "Simulazione",
  PRACTICE: "Esercitazione",
  CHAPTER: "Capitolo",
  REVIEW: "Ripasso",
};

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

/** Accuratezza per argomento: verde ≥ 80, ambra ≥ 60, rosso sotto (70 = soglia
 *  "argomento debole", quindi sotto i 70 si vede già rosso o ambra). */
const rateTone = (rate: number) =>
  rate >= 80 ? "#1a7f50" : rate >= 60 ? "#b45309" : "#c13515";

/** Prontezza esame: stesse soglie della pill (≥70 pronto, ≥40 in preparazione),
 *  così barra ed etichetta non si contraddicono. */
const readinessTone = (score: number) =>
  score >= 70 ? "#1a7f50" : score >= 40 ? "#b45309" : "#c13515";

function ProgressBar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ebebeb]">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }}
      />
    </div>
  );
}

/**
 * Icona dell'argomento: stessa Fluent 3D usata dall'app mobile per lo stesso
 * capitolo. Fuori dai 25 capitoli ministeriali (capitoli demo) si ricade sul
 * numero in un cerchio, come fa `TopicListScreen` su mobile.
 */
function ChapterIcon({
  chapterNumber,
  size,
}: {
  chapterNumber: number;
  size: number;
}) {
  const src = quizChapterIconSrc(chapterNumber);
  if (!src) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-[#f2f2f2] font-bold text-[#6a6a6a]"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {chapterNumber}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[12px] bg-[#f7f7f7] p-3.5">
      <div className="mb-2 flex size-7 items-center justify-center rounded-full bg-white">
        {icon}
      </div>
      <p className="text-[12px] font-medium text-[#929292]">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[11px] font-medium text-[#929292]">{hint}</p>}
    </div>
  );
}

function PlaceholderCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-[12px] border border-[#ebebeb] bg-[#fafafa] px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 max-w-[320px] text-[13px] font-medium leading-relaxed text-[#929292]">
        {description}
      </p>
    </div>
  );
}

export function StudentQuizPanel({
  loading,
  detail,
  theoryPhaseEnabled,
}: {
  loading: boolean;
  detail: StudentQuizDetail | null;
  /** `'TEORIA' ∈ limits.phasesEnabled` dell'autoscuola. `null` = contesto
   *  licenze non ancora caricato: si mostra lo skeleton, non il placeholder,
   *  altrimenti un'autoscuola CON la teoria attiva vedrebbe un lampo di
   *  "fase teoria non attiva". */
  theoryPhaseEnabled: boolean | null;
}) {
  if (loading || theoryPhaseEnabled === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  // 1. Autoscuola senza fase teoria: il quiz non fa parte del suo percorso.
  if (theoryPhaseEnabled === false) {
    return (
      <PlaceholderCard
        icon={<Lock className="size-5 text-[#929292]" strokeWidth={1.7} />}
        title="Fase teoria non attiva"
        description="La tua autoscuola non ha la fase teoria nel percorso allievo, quindi non c'è una situazione quiz da mostrare. Attivala dal tuo referente Reglo per seguire gli allievi anche nello studio della teoria."
      />
    );
  }

  if (!detail) {
    return (
      <p className="text-sm text-muted-foreground">
        Impossibile caricare la situazione quiz.
      </p>
    );
  }

  // 2. Nessuna licenza quiz assegnata a questo allievo.
  if (!detail.hasQuizAccess) {
    return (
      <PlaceholderCard
        icon={<Lock className="size-5 text-[#929292]" strokeWidth={1.7} />}
        title="Licenza quiz non assegnata"
        description="Questo allievo non ha ancora una licenza quiz, quindi non può esercitarsi dall'app. Assegnagliela dal riepilogo per sbloccare i quiz e vedere qui i suoi progressi."
      />
    );
  }

  // 3. Licenza assegnata ma allievo mai partito.
  if (detail.totalSessions === 0 && detail.coverage.attemptedCount === 0) {
    return (
      <PlaceholderCard
        icon={<BookOpen className="size-5 text-[#929292]" strokeWidth={1.7} />}
        title="Nessun quiz svolto"
        description="L'allievo ha la licenza quiz attiva ma non ha ancora svolto nessuna sessione dall'app. Appena inizia a esercitarsi troverai qui i suoi progressi."
      />
    );
  }

  const attemptedChapters = detail.chaptersProgress
    .filter((chapter) => chapter.attemptedCount > 0)
    .sort((a, b) => (a.correctRate ?? 0) - (b.correctRate ?? 0));

  return (
    <div className="-mt-2">
      {/* Prontezza esame */}
      <section className="border-b border-[#f2f2f2] py-7">
        <p className={cn(sectionLabelClass, "mb-3")}>Prontezza esame</p>
        <div className="rounded-[12px] bg-[#f7f7f7] p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-bold leading-none text-foreground">
                {detail.readinessScore}%
              </p>
              <p className="mt-1.5 text-[12px] font-medium text-[#929292]">
                Ultima attività {formatDate(detail.lastActivityAt)}
              </p>
            </div>
            {detail.readinessScore >= 70 ? (
              <Pill tone="green">Pronto</Pill>
            ) : detail.readinessScore >= 40 ? (
              <Pill tone="amber">In preparazione</Pill>
            ) : (
              <Pill tone="red">Indietro</Pill>
            )}
          </div>
          <ProgressBar
            value={detail.readinessScore}
            tone={readinessTone(detail.readinessScore)}
          />
        </div>
      </section>

      {/* Simulazioni d'esame (REG-446) + copertura */}
      <section className="border-b border-[#f2f2f2] py-7">
        <p className={cn(sectionLabelClass, "mb-3")}>Simulazioni d&apos;esame</p>
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            icon={<GraduationCap className="size-4 text-[#1a7f50]" strokeWidth={1.8} />}
            label="Simulazioni superate"
            value={`${detail.examPassRate}%`}
            hint={
              detail.examsTaken > 0
                ? `${detail.examsPassed} su ${detail.examsTaken} svolte`
                : "Nessuna simulazione svolta"
            }
          />
          <StatTile
            icon={<Target className="size-4 text-[#428bff]" strokeWidth={1.8} />}
            label="Risposte corrette"
            value={`${detail.coverage.accuracyPct}%`}
            hint={`${detail.coverage.correctCount} su ${detail.coverage.attemptedCount} domande viste`}
          />
          <StatTile
            icon={<BookOpen className="size-4 text-[#6a6a6a]" strokeWidth={1.8} />}
            label="Banca domande vista"
            value={`${detail.coverage.attemptedPct}%`}
            hint={`${detail.coverage.attemptedCount} su ${detail.coverage.totalQuestions}`}
          />
          <StatTile
            icon={<TrendingUp className="size-4 text-[#6a6a6a]" strokeWidth={1.8} />}
            label="Sessioni totali"
            value={`${detail.totalSessions}`}
            hint={
              detail.examsFailed > 0
                ? `${detail.examsFailed} simulazion${detail.examsFailed === 1 ? "e" : "i"} non superat${detail.examsFailed === 1 ? "a" : "e"}`
                : undefined
            }
          />
        </div>
      </section>

      {/* Argomenti deboli */}
      {detail.weakChapters.length > 0 && (
        <section className="border-b border-[#f2f2f2] py-7">
          <p className={cn(sectionLabelClass, "mb-3")}>Argomenti da rivedere</p>
          <div className="flex flex-wrap gap-2">
            {detail.weakChapters.map((chapter) => (
              <span
                key={chapter.chapterNumber}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#fad4cc] bg-[#fff4f2] py-1 pl-1.5 pr-3 text-xs font-medium text-[#c13515]"
              >
                <ChapterIcon chapterNumber={chapter.chapterNumber} size={20} />
                {chapter.description}
                <span className="font-semibold">{chapter.correctRate}%</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Situazione per argomento */}
      <section className="border-b border-[#f2f2f2] py-7">
        <p className={cn(sectionLabelClass, "mb-3")}>Situazione per argomento</p>
        {attemptedChapters.length === 0 ? (
          <p className="text-[13px] font-medium text-[#929292]">
            Nessun argomento ancora affrontato.
          </p>
        ) : (
          <div className="space-y-3.5">
            {attemptedChapters.map((chapter) => {
              const rate = chapter.correctRate ?? 0;
              return (
                <div key={chapter.id} className="flex items-center gap-3">
                  <ChapterIcon chapterNumber={chapter.chapterNumber} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {chapter.description}
                      </p>
                      <span
                        className="shrink-0 text-[12px] font-semibold"
                        style={{ color: rateTone(rate) }}
                      >
                        {rate}%
                      </span>
                    </div>
                    <ProgressBar value={rate} tone={rateTone(rate)} />
                    <p className="mt-1 text-[11px] font-medium text-[#929292]">
                      {chapter.correctCount}/{chapter.attemptedCount} corrette ·{" "}
                      {chapter.attemptedCount}/{chapter.totalQuestions} domande viste
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Domande più sbagliate */}
      {detail.mostWrongQuestions.length > 0 && (
        <section className="border-b border-[#f2f2f2] py-7">
          <p className={cn(sectionLabelClass, "mb-3")}>Domande più sbagliate</p>
          <div className="space-y-2.5">
            {detail.mostWrongQuestions.map((question) => (
              <div key={question.id} className="rounded-[12px] bg-[#f7f7f7] p-3.5">
                <p className="text-[13px] font-medium leading-relaxed text-foreground">
                  {question.questionText}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Pill tone="red">
                    {question.timesWrong} error{question.timesWrong === 1 ? "e" : "i"}
                  </Pill>
                  <Pill tone={question.correctAnswer ? "green" : "gray"}>
                    Risposta: {question.correctAnswer ? "Vero" : "Falso"}
                  </Pill>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#929292]">
                    <ChapterIcon chapterNumber={question.chapterNumber} size={16} />
                    {question.chapterDescription}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sessioni recenti */}
      {detail.recentSessions.length > 0 && (
        <section className="py-7">
          <p className={cn(sectionLabelClass, "mb-3")}>Sessioni recenti</p>
          <div className="space-y-2">
            {detail.recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 border-b border-[#f2f2f2] pb-2 last:border-0 last:pb-0"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      session.passed === true
                        ? "#1a7f50"
                        : session.passed === false
                          ? "#c13515"
                          : "#c8c8c8",
                  }}
                />
                <p className="text-[13px] font-medium text-foreground">
                  {SESSION_MODE_LABELS[session.mode]}
                </p>
                <div className="flex-1" />
                <span className="text-[12px] font-semibold text-foreground">
                  {session.correctCount}/{session.totalQuestions}
                </span>
                <span className="w-[86px] shrink-0 text-right text-[11px] font-medium text-[#929292]">
                  {formatDate(session.completedAt ?? session.startedAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
