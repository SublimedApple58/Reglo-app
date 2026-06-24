"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  endAulaLiveSession,
  openNextAulaQuestion,
  revealAulaQuestion,
} from "@/lib/actions/aula.actions";

type Snapshot = {
  code: string;
  status: "LOBBY" | "QUESTION_OPEN" | "QUESTION_REVEALED" | "ENDED";
  totalQuestions: number;
  currentIndex: number | null;
  participantCount: number;
  reveal: {
    counts: { correct: number; wrong: number; noAnswer: number };
    results: { name: string; answered: boolean; correct: boolean | null }[];
  } | null;
};

const POLL_MS = 1500;

/**
 * Reglo Aula — console docente (vista proiettore + comandi).
 * In QUESTION_OPEN il proiettore mostra solo il QR + barra comandi minima;
 * al reveal compaiono giusto/sbagliato. Modello Kahoot, stesso schermo proiettato.
 * Skeleton: QR via libreria + presentazione slide arrivano dopo.
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

  const showQrOnly = !snap || snap.status === "LOBBY" || snap.status === "QUESTION_OPEN";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {showQrOnly && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-xl">Inquadra il QR per partecipare</p>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            {joinUrl ? (
              <QRCodeSVG
                value={joinUrl}
                size={256}
                level="M"
                marginSize={2}
              />
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
        </div>
      )}

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

      {snap?.status === "ENDED" && (
        <p className="text-2xl font-semibold">Quiz terminato</p>
      )}

      {/* Barra comandi docente */}
      {snap && snap.status !== "ENDED" && (
        <div className="fixed inset-x-0 bottom-0 flex justify-center gap-3 border-t bg-white/90 p-4">
          {snap.status !== "QUESTION_OPEN" && (
            <button
              className="rounded-md bg-pink-500 px-4 py-2 text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => act(() => openNextAulaQuestion(code))}
            >
              {snap.status === "LOBBY" ? "Apri domanda" : "Prossima domanda"}
            </button>
          )}
          {snap.status === "QUESTION_OPEN" && (
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
