"use client";

import { useCallback, useEffect, useState } from "react";

type Snapshot = {
  status: "LOBBY" | "QUESTION_OPEN" | "QUESTION_REVEALED" | "ENDED";
  totalQuestions: number;
  currentIndex: number | null;
  question: { id: string; text: string; imageUrl: string | null } | null;
  you: { answered: boolean; correct: boolean | null } | null;
};

const POLL_MS = 1500;
const STORAGE_KEY = (code: string) => `aula:rejoin:${code}`;

/**
 * Reglo Aula — player studente (anonimo, da QR).
 * Inserisci nome → rispondi V/F → attesa reveal → giusto/sbagliato.
 * Il rejoinToken è salvato in localStorage per il rientro robusto.
 * Skeleton: stile da rifinire con design-system.
 */
export function AulaStudentPlayer({ code }: { code: string }) {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [answered, setAnswered] = useState<string | null>(null); // questionId risposta

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

  async function answer(value: boolean) {
    if (!participantId || !snap?.question) return;
    setAnswered(snap.question.id);
    await fetch(`/api/aula/live/${code}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, answer: value }),
    });
  }

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
