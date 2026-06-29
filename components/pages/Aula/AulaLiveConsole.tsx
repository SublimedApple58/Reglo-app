"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  endAulaLiveSession,
  forceNextAulaExamQuestion,
  nextAulaExamReview,
  openNextAulaQuestion,
  revealAulaQuestion,
  startAulaExam,
  startAulaExamReview,
} from "@/lib/actions/aula.actions";

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
    results: { name: string; answered: boolean; correct: boolean | null }[];
  } | null;
  examLive: {
    currentIndex: number | null;
    total: number;
    participantCount: number;
    aligned: number;
    pending: number;
    joinedAfterStart: number;
    roster: { name: string; answeredCurrent: boolean; joinedLate: boolean }[];
  } | null;
  examResults: {
    total: number;
    rows: { name: string; score: number; answered: number }[];
  } | null;
};

const POLL_MS = 1500;

/**
 * Reglo Aula — console docente (vista proiettore + comandi).
 * Due modalità:
 * - LIVE: in QUESTION_OPEN mostra solo QR + barra comandi; al reveal giusto/sbagliato.
 * - EXAM ("Quiz completo") sincronizzato: in LOBBY QR + "Avvia quiz"; durante lo
 *   svolgimento QR + avanzamento (domanda X/Y, quanti allineati, quanti entrati a
 *   quiz avviato, chi è al passo). La domanda successiva si sblocca da sola quando
 *   tutti hanno risposto; il docente può forzare l'avanzamento per i ritardatari.
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
  const examAnswering =
    isExam &&
    snap?.status === "IN_PROGRESS" &&
    !!snap.examLive &&
    snap.examLive.currentIndex !== null;
  const examDone =
    isExam &&
    snap?.status === "IN_PROGRESS" &&
    !!snap.examLive &&
    snap.examLive.currentIndex === null;
  // QR a tutto schermo: LOBBY (entrambe) e LIVE QUESTION_OPEN.
  const showQrOnly =
    !snap ||
    snap.status === "LOBBY" ||
    (!isExam && snap.status === "QUESTION_OPEN");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {showQrOnly && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-xl">Inquadra il QR per partecipare</p>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            {joinUrl ? (
              <QRCodeSVG value={joinUrl} size={256} level="M" marginSize={2} />
            ) : (
              <div className="h-64 w-64 animate-pulse rounded-lg bg-neutral-100" />
            )}
          </div>
          <p className="font-mono text-lg">{joinUrl}</p>
          {snap && (
            <p className="text-neutral-500">
              {snap.participantCount} partecipanti
              {snap.status === "QUESTION_OPEN" && " • risposta in corso"}
            </p>
          )}
          {isExam && snap?.status === "LOBBY" && (
            <p className="text-sm text-neutral-400">
              Quiz completo — {snap.totalQuestions} domande, avanzamento
              sincronizzato
            </p>
          )}
        </div>
      )}

      {/* EXAM sincronizzato — svolgimento in corso (avanzamento + allineamento) */}
      {examAnswering && snap.examLive && (
        <div className="flex w-full max-w-4xl flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-neutral-500">Quiz completo in corso</p>
            <h2 className="text-3xl font-semibold">
              Domanda {(snap.examLive.currentIndex ?? 0) + 1}/{snap.examLive.total}
            </h2>
          </div>

          <div className="grid w-full grid-cols-3 gap-4 text-center">
            <div className="rounded-xl border bg-white px-4 py-4">
              <p className="text-3xl font-bold text-green-600">
                {snap.examLive.aligned}/{snap.examLive.participantCount}
              </p>
              <p className="text-sm text-neutral-500">Al passo</p>
            </div>
            <div className="rounded-xl border bg-white px-4 py-4">
              <p className="text-3xl font-bold text-yellow-500">
                {snap.examLive.pending}
              </p>
              <p className="text-sm text-neutral-500">Stanno rispondendo</p>
            </div>
            <div className="rounded-xl border bg-white px-4 py-4">
              <p className="text-3xl font-bold text-neutral-700">
                {snap.examLive.joinedAfterStart}
              </p>
              <p className="text-sm text-neutral-500">Entrati a quiz avviato</p>
            </div>
          </div>

          {/* La barra di avanzamento si riempie man mano che tutti si allineano */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-pink-500 transition-all"
              style={{
                width: `${
                  snap.examLive.participantCount > 0
                    ? Math.round(
                        (snap.examLive.aligned /
                          snap.examLive.participantCount) *
                          100,
                      )
                    : 0
                }%`,
              }}
            />
          </div>

          {snap.examLive.roster.length > 0 && (
            <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {snap.examLive.roster.map((r, i) => (
                <li
                  key={i}
                  className={
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm " +
                    (r.answeredCurrent
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-yellow-300 bg-yellow-50 text-yellow-700")
                  }
                >
                  <span className="truncate">{r.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.joinedLate && (
                      <span
                        title="Entrato a quiz avviato"
                        className="rounded bg-neutral-200 px-1 text-[10px] text-neutral-600"
                      >
                        late
                      </span>
                    )}
                    {r.answeredCurrent ? "✓" : "…"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-neutral-400">
            La prossima domanda si sblocca da sola quando tutti hanno risposto.
          </p>
        </div>
      )}

      {/* EXAM sincronizzato — tutti hanno completato */}
      {examDone && snap.examLive && (
        <div className="flex w-full max-w-2xl flex-col items-center gap-6">
          <h2 className="text-center text-3xl font-semibold">
            Tutti hanno completato il quiz 🎉
          </h2>
          <p className="text-neutral-500">
            {snap.examLive.participantCount} partecipanti
            {snap.examLive.joinedAfterStart > 0 &&
              ` • ${snap.examLive.joinedAfterStart} entrati a quiz avviato`}
          </p>
        </div>
      )}

      {/* LIVE — reveal per domanda */}
      {snap?.status === "QUESTION_REVEALED" && snap.reveal && (
        <div className="w-full max-w-3xl space-y-4">
          <h2 className="text-center text-2xl font-semibold">
            Risultati domanda {(snap.currentIndex ?? 0) + 1}/{snap.totalQuestions}
          </h2>
          <div className="flex justify-center gap-6 text-lg">
            <span className="text-green-600">Giusto: {snap.reveal.counts.correct}</span>
            <span className="text-red-600">Sbagliato: {snap.reveal.counts.wrong}</span>
            <span className="text-neutral-500">Non risposto: {snap.reveal.counts.noAnswer}</span>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {snap.reveal.results.map((r, i) => (
              <li
                key={i}
                className={
                  "rounded-md border px-3 py-1 text-sm " +
                  (!r.answered
                    ? "text-neutral-400"
                    : r.correct
                      ? "border-green-300 text-green-700"
                      : "border-red-300 text-red-700")
                }
              >
                {r.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* EXAM — correzione a schermo, una domanda alla volta (il docente spiega) */}
      {isExam && snap?.status === "REVIEWING" && snap.question && (
        <div className="w-full max-w-3xl space-y-5">
          <p className="text-center text-sm text-neutral-500">
            Correzione — domanda {(snap.currentIndex ?? 0) + 1}/{snap.totalQuestions}
          </p>
          {snap.question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snap.question.imageUrl} alt="" className="mx-auto max-h-56 rounded-lg" />
          )}
          <p className="text-center text-2xl">{snap.question.text}</p>
          <p className="text-center text-xl font-semibold text-green-600">
            Risposta corretta:{" "}
            {snap.question.correctAnswer === null
              ? "—"
              : snap.question.correctAnswer
                ? "Vero"
                : "Falso"}
          </p>
          {snap.reveal && (
            <>
              <div className="flex justify-center gap-6 text-lg">
                <span className="text-green-600">Giusto: {snap.reveal.counts.correct}</span>
                <span className="text-red-600">Sbagliato: {snap.reveal.counts.wrong}</span>
                <span className="text-neutral-500">Non risposto: {snap.reveal.counts.noAnswer}</span>
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {snap.reveal.results.map((r, i) => (
                  <li
                    key={i}
                    className={
                      "rounded-md border px-3 py-1 text-sm " +
                      (!r.answered
                        ? "text-neutral-400"
                        : r.correct
                          ? "border-green-300 text-green-700"
                          : "border-red-300 text-red-700")
                    }
                  >
                    {r.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* EXAM — classifica finale (correzione di massa) */}
      {isExam && snap?.status === "ENDED" && snap.examResults && (
        <div className="w-full max-w-2xl space-y-4">
          <h2 className="text-center text-3xl font-semibold">Risultati</h2>
          {snap.examResults.rows.length === 0 ? (
            <p className="text-center text-neutral-500">Nessun partecipante.</p>
          ) : (
            <ol className="space-y-2">
              {snap.examResults.rows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 text-lg"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 text-right text-neutral-400">{i + 1}.</span>
                    {r.name}
                  </span>
                  <span className="font-semibold">
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
        <p className="text-2xl font-semibold">Quiz terminato</p>
      )}

      {/* Barra comandi docente */}
      {snap && snap.status !== "ENDED" && (
        <div className="fixed inset-x-0 bottom-0 flex justify-center gap-3 border-t bg-white/90 p-4">
          {/* EXAM */}
          {isExam && snap.status === "LOBBY" && (
            <button
              className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => act(() => startAulaExam(code))}
            >
              Avvia quiz
            </button>
          )}
          {examAnswering && (
            <button
              className="rounded-md border px-4 py-2 disabled:opacity-50"
              disabled={pending}
              onClick={() => act(() => forceNextAulaExamQuestion(code))}
              title="Sblocca la domanda successiva senza attendere i ritardatari"
            >
              Forza prossima domanda
            </button>
          )}
          {examDone && (
            <>
              <button
                className="rounded-md bg-yellow-400 px-4 py-2 disabled:opacity-50"
                disabled={pending}
                onClick={() => act(() => startAulaExamReview(code))}
              >
                Correggi insieme
              </button>
              <button
                className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
                disabled={pending}
                onClick={() => act(() => endAulaLiveSession(code))}
              >
                Mostra classifica
              </button>
            </>
          )}
          {isExam && snap.status === "REVIEWING" && (
            <button
              className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => act(() => nextAulaExamReview(code))}
            >
              {(snap.currentIndex ?? 0) < snap.totalQuestions - 1
                ? "Prossima domanda"
                : "Mostra classifica"}
            </button>
          )}

          {/* LIVE */}
          {!isExam && snap.status !== "QUESTION_OPEN" && (
            <button
              className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => act(() => openNextAulaQuestion(code))}
            >
              {snap.status === "LOBBY" ? "Apri domanda" : "Prossima domanda"}
            </button>
          )}
          {!isExam && snap.status === "QUESTION_OPEN" && (
            <button
              className="rounded-md bg-yellow-400 px-4 py-2 disabled:opacity-50"
              disabled={pending}
              onClick={() => act(() => revealAulaQuestion(code))}
            >
              Stop &amp; mostra risposta
            </button>
          )}

          <button
            className="rounded-md border px-4 py-2 disabled:opacity-50"
            disabled={pending}
            onClick={() => act(() => endAulaLiveSession(code))}
          >
            Termina
          </button>
        </div>
      )}
    </div>
  );
}
