"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Question = {
  id: string;
  text: string;
  imageUrl: string | null;
  correctAnswer?: boolean | null;
};

type Snapshot = {
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
  question: { id: string; text: string; imageUrl: string | null } | null;
  questions: Question[] | null;
  you:
    | {
        // LIVE
        answered?: boolean;
        correct?: boolean | null;
        // EXAM
        answers?: Record<string, boolean>;
        perQuestion?: Record<string, boolean>;
        score?: number;
        total?: number;
      }
    | null;
};

const POLL_MS = 1500;
const STORAGE_KEY = (code: string) => `aula:rejoin:${code}`;

/**
 * Reglo Aula — player studente (anonimo, da QR).
 * - LIVE: rispondi V/F alla domanda corrente → attesa reveal → giusto/sbagliato.
 * - EXAM: rispondi a tutte le domande in autonomia → a fine quiz vedi il tuo
 *   punteggio e la correzione domanda per domanda.
 * Il rejoinToken è salvato in localStorage per il rientro robusto.
 */
export function AulaStudentPlayer({ code }: { code: string }) {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [answered, setAnswered] = useState<string | null>(null); // LIVE: questionId risposta
  // EXAM: risposte ottimistiche locali (fuse con quelle dal server).
  const [localAnswers, setLocalAnswers] = useState<Record<string, boolean>>({});

  // Rientro automatico se ho un token salvato.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY(code));
    if (!saved) return;
    const { rejoinToken, name: savedName } = JSON.parse(saved);
    void doJoin(savedName, rejoinToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function doJoin(joinName: string, rejoinToken?: string) {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/aula/live/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: joinName, rejoinToken }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(
          json.message === "NAME_TAKEN"
            ? "Nome già in uso, scegline un altro."
            : "Impossibile entrare.",
        );
        return;
      }
      setParticipantId(json.data.participantId);
      localStorage.setItem(
        STORAGE_KEY(code),
        JSON.stringify({
          rejoinToken: json.data.rejoinToken,
          name: json.data.name,
        }),
      );
    } finally {
      setJoining(false);
    }
  }

  const poll = useCallback(async () => {
    if (!participantId) return;
    const res = await fetch(
      `/api/aula/live/${code}/state?participantId=${participantId}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = await res.json();
      if (json.success) setSnap(json.data as Snapshot);
    }
  }, [code, participantId]);

  useEffect(() => {
    if (!participantId) return;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [participantId, poll]);

  // LIVE: risposta alla domanda corrente.
  async function answer(value: boolean) {
    if (!participantId || !snap?.question) return;
    setAnswered(snap.question.id);
    await fetch(`/api/aula/live/${code}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, answer: value }),
    });
  }

  // EXAM: risposta a una domanda specifica (modificabile fino al termine).
  async function answerExam(questionId: string, value: boolean) {
    if (!participantId) return;
    setLocalAnswers((prev) => ({ ...prev, [questionId]: value }));
    await fetch(`/api/aula/live/${code}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, answer: value, questionId }),
    });
  }

  // Vista combinata delle risposte EXAM (server + ottimistiche locali).
  const examAnswers = useMemo(
    () => ({ ...(snap?.you?.answers ?? {}), ...localAnswers }),
    [snap?.you?.answers, localAnswers],
  );

  // ── Schermata nome ──
  if (!participantId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">Entra nel quiz</h1>
        <input
          className="w-64 rounded-md border px-3 py-2"
          placeholder="Il tuo nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="text-red-600">{error}</p>}
        <button
          className="rounded-md bg-pink-500 px-6 py-2 text-white disabled:opacity-50"
          disabled={joining || name.trim().length === 0}
          onClick={() => doJoin(name.trim())}
        >
          Entra
        </button>
      </div>
    );
  }

  // ── EXAM ──
  if (snap?.mode === "EXAM") {
    if (snap.status === "LOBBY" || !snap.questions) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <p className="text-lg text-neutral-600">In attesa del docente…</p>
        </div>
      );
    }

    // REVIEWING: l'esame è bloccato e il docente corregge a schermo → lo
    // studente vede già il proprio risultato (come a fine quiz).
    if (snap.status === "ENDED" || snap.status === "REVIEWING") {
      const score = snap.you?.score ?? 0;
      const total = snap.you?.total ?? snap.totalQuestions;
      return (
        <div className="mx-auto max-w-md space-y-6 p-6">
          <div className="text-center">
            <p className="text-sm text-neutral-500">Il tuo punteggio</p>
            <p className="text-5xl font-bold text-pink-600">
              {score}/{total}
            </p>
          </div>
          <ol className="space-y-3">
            {snap.questions.map((q, i) => {
              const given = examAnswers[q.id];
              const correct = snap.you?.perQuestion?.[q.id];
              return (
                <li key={q.id} className="rounded-lg border p-3">
                  <p className="mb-1 text-sm text-neutral-500">Domanda {i + 1}</p>
                  <p className="mb-2">{q.text}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={
                        "rounded px-2 py-0.5 " +
                        (given === undefined
                          ? "bg-neutral-100 text-neutral-500"
                          : correct
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700")
                      }
                    >
                      {given === undefined
                        ? "Non risposto"
                        : `Tua: ${given ? "Vero" : "Falso"}`}
                    </span>
                    {q.correctAnswer != null && (
                      <span className="text-neutral-500">
                        Corretta: {q.correctAnswer ? "Vero" : "Falso"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      );
    }

    // IN_PROGRESS — svolgimento di tutte le domande.
    const answeredCount = snap.questions.filter(
      (q) => examAnswers[q.id] !== undefined,
    ).length;
    return (
      <div className="mx-auto max-w-md space-y-5 p-6">
        <div className="sticky top-0 -mx-6 border-b bg-white/90 px-6 py-3 text-center text-sm text-neutral-600 backdrop-blur">
          {answeredCount}/{snap.questions.length} risposte • attendi il docente per la correzione
        </div>
        <ol className="space-y-4">
          {snap.questions.map((q, i) => {
            const given = examAnswers[q.id];
            return (
              <li key={q.id} className="space-y-3 rounded-lg border p-4">
                <p className="text-sm text-neutral-500">Domanda {i + 1}</p>
                {q.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.imageUrl} alt="" className="max-h-40" />
                )}
                <p>{q.text}</p>
                <div className="flex gap-3">
                  <button
                    className={
                      "flex-1 rounded-md px-4 py-2 text-white " +
                      (given === true ? "bg-green-600" : "bg-green-500/70")
                    }
                    onClick={() => answerExam(q.id, true)}
                  >
                    Vero
                  </button>
                  <button
                    className={
                      "flex-1 rounded-md px-4 py-2 text-white " +
                      (given === false ? "bg-red-600" : "bg-red-500/70")
                    }
                    onClick={() => answerExam(q.id, false)}
                  >
                    Falso
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // ── LIVE ──
  const alreadyAnswered = answered === snap?.question?.id;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      {(!snap || snap.status === "LOBBY") && (
        <p className="text-lg text-neutral-600">In attesa del docente…</p>
      )}

      {snap?.status === "QUESTION_OPEN" && snap.question && (
        <div className="flex w-full max-w-md flex-col items-center gap-5">
          <p className="text-sm text-neutral-500">
            Domanda {(snap.currentIndex ?? 0) + 1}/{snap.totalQuestions}
          </p>
          {snap.question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snap.question.imageUrl} alt="" className="max-h-48" />
          )}
          <p className="text-center text-lg">{snap.question.text}</p>
          {alreadyAnswered ? (
            <p className="text-neutral-500">Risposta inviata ✓</p>
          ) : (
            <div className="flex gap-4">
              <button
                className="rounded-md bg-green-500 px-8 py-3 text-white"
                onClick={() => answer(true)}
              >
                Vero
              </button>
              <button
                className="rounded-md bg-red-500 px-8 py-3 text-white"
                onClick={() => answer(false)}
              >
                Falso
              </button>
            </div>
          )}
        </div>
      )}

      {snap?.status === "QUESTION_REVEALED" && (
        <div className="text-center">
          {snap.you?.answered ? (
            <p
              className={
                "text-3xl font-bold " +
                (snap.you.correct ? "text-green-600" : "text-red-600")
              }
            >
              {snap.you.correct ? "Giusto!" : "Sbagliato"}
            </p>
          ) : (
            <p className="text-2xl text-neutral-500">Non hai risposto</p>
          )}
        </div>
      )}

      {snap?.status === "ENDED" && (
        <p className="text-2xl font-semibold">Quiz terminato. Grazie!</p>
      )}
    </div>
  );
}
