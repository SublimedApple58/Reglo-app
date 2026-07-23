"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  endAulaLiveSession,
  nextAulaExamReview,
  openNextAulaQuestion,
  revealAulaQuestion,
  startAulaExam,
  startAulaExamReview,
} from "@/lib/actions/aula.actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type RevealResult = { name: string; answered: boolean; correct: boolean | null };

type Snapshot = {
  code: string;
  status:
    | "LOBBY"
    | "QUESTION_OPEN"
    | "QUESTION_REVEALED"
    | "IN_PROGRESS"
    | "REVIEWING"
    | "ENDED";
  mode: "LIVE" | "EXAM";
  totalQuestions: number;
  currentIndex: number | null;
  participantCount: number;
  question: { text: string; imageUrl: string | null; correctAnswer: boolean | null } | null;
  reveal: {
    counts: { correct: number; wrong: number; noAnswer: number };
    results: RevealResult[];
  } | null;
  examProgress: { completed: number; answersReceived: number } | null;
  examResults: {
    total: number;
    rows: { name: string; score: number; answered: number }[];
  } | null;
};

const POLL_MS = 1500;

/** CTA accent (gialla) del docente — usata per i comandi di "reveal"/"correggi". */
const ACCENT_BTN =
  "bg-accent text-foreground border border-transparent hover:bg-accent/90";

/** Riga conteggi giusto / sbagliato / non risposto. */
function CountsRow({
  counts,
}: {
  counts: { correct: number; wrong: number; noAnswer: number };
}) {
  return (
    <div className="flex justify-center gap-6 text-lg">
      <span className="font-semibold text-positive">Giusto: {counts.correct}</span>
      <span className="font-semibold text-destructive">
        Sbagliato: {counts.wrong}
      </span>
      <span className="text-muted-foreground">Non risposto: {counts.noAnswer}</span>
    </div>
  );
}

/** Griglia dei nomi con esito colorato (giusto/sbagliato/non risposto). */
function ResultChips({ results }: { results: RevealResult[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {results.map((r, i) => (
        <li
          key={i}
          className={cn(
            "rounded-pill border px-3 py-1 text-sm",
            !r.answered
              ? "border-border text-muted-foreground"
              : r.correct
                ? "border-positive/40 bg-positive/5 text-positive"
                : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {r.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Reglo Aula — console docente (vista proiettore + comandi).
 * Due modalità:
 * - LIVE: in QUESTION_OPEN mostra solo QR + barra comandi; al reveal giusto/sbagliato.
 * - EXAM: in LOBBY mostra QR + "Avvia quiz"; in IN_PROGRESS QR + avanzamento +
 *   "Termina quiz"; a ENDED la classifica per studente (correzione di massa).
 * Modello Kahoot, stesso schermo proiettato.
 */
export function AulaLiveConsole({ code }: { code: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // La console gira sotto /{locale}/aula/live/{code}: riusa lo stesso locale
    // per il link studente /{locale}/aula-live/{code} (pagina pubblica).
    const locale = window.location.pathname.split("/")[1] || "it";
    // Il QR deve puntare all'URL pubblico raggiungibile dai telefoni, non a
    // window.location.origin (che in dev è localhost). In prod NEXT_PUBLIC_SERVER_URL
    // è il dominio reale; in dev impostalo su IP LAN o tunnel per testare da telefono.
    const origin = process.env.NEXT_PUBLIC_SERVER_URL || window.location.origin;
    setJoinUrl(`${origin}/${locale}/aula-live/${code}`);
  }, [code]);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/aula/live/${code}/state`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json.success) setSnap(json.data as Snapshot);
    }
  }, [code]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      await poll();
    });

  const isExam = snap?.mode === "EXAM";
  const showQrOnly =
    !snap ||
    snap.status === "LOBBY" ||
    snap.status === "QUESTION_OPEN" ||
    snap.status === "IN_PROGRESS";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 pb-28">
      {showQrOnly && (
        <div className="flex flex-col items-center gap-4">
          <p className="ds-subtitle">Inquadra il QR per partecipare</p>
          <div className="rounded-card-primary border border-border bg-card p-5 shadow-card">
            {joinUrl ? (
              <QRCodeSVG value={joinUrl} size={256} level="M" marginSize={2} />
            ) : (
              <Skeleton className="h-64 w-64 rounded-lg" />
            )}
          </div>
          <p className="max-w-full break-all font-mono text-sm text-muted-foreground">
            {joinUrl}
          </p>
          {snap && (
            <p className="text-muted-foreground">
              {snap.participantCount} partecipanti
              {snap.status === "QUESTION_OPEN" && " • risposta in corso"}
              {snap.status === "IN_PROGRESS" &&
                snap.examProgress &&
                ` • ${snap.examProgress.completed}/${snap.participantCount} hanno completato`}
            </p>
          )}
          {snap?.mode === "EXAM" && snap.status === "IN_PROGRESS" && (
            <p className="text-sm text-muted-foreground">
              Quiz completo in corso — {snap.totalQuestions} domande sul telefono
            </p>
          )}
        </div>
      )}

      {/* LIVE — reveal per domanda */}
      {snap?.status === "QUESTION_REVEALED" && snap.reveal && (
        <div className="w-full max-w-3xl space-y-4">
          <h2 className="ds-section-primary text-center">
            Risultati domanda {(snap.currentIndex ?? 0) + 1}/{snap.totalQuestions}
          </h2>
          <CountsRow counts={snap.reveal.counts} />
          <ResultChips results={snap.reveal.results} />
        </div>
      )}

      {/* EXAM — correzione a schermo, una domanda alla volta (il docente spiega) */}
      {isExam && snap?.status === "REVIEWING" && snap.question && (
        <div className="w-full max-w-3xl space-y-5">
          <p className="text-center ds-caption text-muted-foreground">
            Correzione — domanda {(snap.currentIndex ?? 0) + 1}/{snap.totalQuestions}
          </p>
          {snap.question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snap.question.imageUrl}
              alt=""
              className="mx-auto max-h-56 rounded-lg border border-border"
            />
          )}
          <p className="text-center text-2xl">{snap.question.text}</p>
          <p className="text-center text-xl font-semibold text-positive">
            Risposta corretta:{" "}
            {snap.question.correctAnswer === null
              ? "—"
              : snap.question.correctAnswer
                ? "Vero"
                : "Falso"}
          </p>
          {snap.reveal && (
            <>
              <CountsRow counts={snap.reveal.counts} />
              <ResultChips results={snap.reveal.results} />
            </>
          )}
        </div>
      )}

      {/* EXAM — classifica finale (correzione di massa) */}
      {isExam && snap?.status === "ENDED" && snap.examResults && (
        <div className="w-full max-w-2xl space-y-4">
          <h2 className="ds-title text-center">Risultati</h2>
          {snap.examResults.rows.length === 0 ? (
            <p className="text-center text-muted-foreground">Nessun partecipante.</p>
          ) : (
            <ol className="space-y-2">
              {snap.examResults.rows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-lg shadow-card"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 text-right tabular-nums text-muted-foreground">
                      {i + 1}.
                    </span>
                    {r.name}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {r.score}/{snap.examResults!.total}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* LIVE — fine senza reveal in corso */}
      {!isExam && snap?.status === "ENDED" && (
        <p className="ds-title">Quiz terminato</p>
      )}

      {/* Barra comandi docente */}
      {snap && snap.status !== "ENDED" && (
        <div className="fixed inset-x-0 bottom-0 flex justify-center gap-3 border-t border-border bg-card/95 p-4 shadow-drawer backdrop-blur">
          {/* EXAM */}
          {isExam && snap.status === "LOBBY" && (
            <Button disabled={pending} onClick={() => act(() => startAulaExam(code))}>
              Avvia quiz
            </Button>
          )}
          {isExam && snap.status === "IN_PROGRESS" && (
            <Button
              className={ACCENT_BTN}
              disabled={pending}
              onClick={() => act(() => startAulaExamReview(code))}
            >
              Termina &amp; correggi
            </Button>
          )}
          {isExam && snap.status === "REVIEWING" && (
            <Button
              disabled={pending}
              onClick={() => act(() => nextAulaExamReview(code))}
            >
              {(snap.currentIndex ?? 0) < snap.totalQuestions - 1
                ? "Prossima domanda"
                : "Mostra classifica"}
            </Button>
          )}

          {/* LIVE */}
          {!isExam && snap.status !== "QUESTION_OPEN" && (
            <Button
              disabled={pending}
              onClick={() => act(() => openNextAulaQuestion(code))}
            >
              {snap.status === "LOBBY" ? "Apri domanda" : "Prossima domanda"}
            </Button>
          )}
          {!isExam && snap.status === "QUESTION_OPEN" && (
            <Button
              className={ACCENT_BTN}
              disabled={pending}
              onClick={() => act(() => revealAulaQuestion(code))}
            >
              Stop &amp; mostra risposta
            </Button>
          )}

          <Button
            variant="outline"
            disabled={pending}
            onClick={() => act(() => endAulaLiveSession(code))}
          >
            Termina
          </Button>
        </div>
      )}
    </div>
  );
}
