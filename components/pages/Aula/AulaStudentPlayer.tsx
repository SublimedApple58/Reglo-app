"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

/** Bottone Vero/Falso grande — filled sui token semantici positive/destructive. */
function ChoiceButton({
  tone,
  selected,
  onClick,
  children,
  className,
}: {
  tone: "positive" | "destructive";
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const filled =
    tone === "positive"
      ? "bg-positive text-white"
      : "bg-destructive text-white";
  const soft =
    tone === "positive"
      ? "border border-positive/30 bg-positive/5 text-positive"
      : "border border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <button
      onClick={onClick}
      className={cn(
        "reglo-focus-ring reglo-interactive flex-1 rounded-lg py-3 text-base font-semibold active:scale-[0.97]",
        selected === undefined || selected ? filled : soft,
        className,
      )}
    >
      {children}
    </button>
  );
}

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6">
        <div className="w-full max-w-xs space-y-5 text-center">
          <div className="space-y-1">
            <h1 className="ds-title">Entra nel quiz</h1>
            <p className="text-sm text-muted-foreground">
              Inserisci un nome per partecipare.
            </p>
          </div>
          <Input
            className="text-center"
            placeholder="Il tuo nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) doJoin(name.trim());
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            size="lg"
            className="w-full"
            disabled={joining || name.trim().length === 0}
            onClick={() => doJoin(name.trim())}
          >
            Entra
          </Button>
        </div>
      </div>
    );
  }

  // ── EXAM ──
  if (snap?.mode === "EXAM") {
    if (snap.status === "LOBBY" || !snap.questions) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <p className="text-lg text-muted-foreground">In attesa del docente…</p>
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
          <div className="rounded-card-primary border border-border bg-card py-8 text-center shadow-card">
            <p className="text-sm font-medium text-muted-foreground">
              Il tuo punteggio
            </p>
            <p className="mt-1 text-5xl font-bold text-primary">
              {score}/{total}
            </p>
          </div>
          <ol className="space-y-3">
            {snap.questions.map((q, i) => {
              const given = examAnswers[q.id];
              const correct = snap.you?.perQuestion?.[q.id];
              return (
                <li
                  key={q.id}
                  className="rounded-lg border border-border bg-card p-4 shadow-card"
                >
                  <p className="mb-1 ds-caption text-muted-foreground">
                    Domanda {i + 1}
                  </p>
                  <p className="mb-2.5 text-[15px]">{q.text}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge
                      variant={
                        given === undefined
                          ? "secondary"
                          : correct
                            ? "success"
                            : "destructive"
                      }
                    >
                      {given === undefined
                        ? "Non risposto"
                        : `Tua: ${given ? "Vero" : "Falso"}`}
                    </Badge>
                    {q.correctAnswer != null && (
                      <span className="text-muted-foreground">
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
        <div className="sticky top-0 -mx-6 border-b border-border bg-card/95 px-6 py-3 text-center text-sm font-medium text-muted-foreground backdrop-blur">
          {answeredCount}/{snap.questions.length} risposte • attendi il docente per la correzione
        </div>
        <ol className="space-y-4">
          {snap.questions.map((q, i) => {
            const given = examAnswers[q.id];
            return (
              <li
                key={q.id}
                className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card"
              >
                <p className="ds-caption text-muted-foreground">Domanda {i + 1}</p>
                {q.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.imageUrl}
                    alt=""
                    className="max-h-40 rounded-md border border-border"
                  />
                )}
                <p className="text-[15px]">{q.text}</p>
                <div className="flex gap-3">
                  <ChoiceButton
                    tone="positive"
                    selected={given === true}
                    onClick={() => answerExam(q.id, true)}
                  >
                    Vero
                  </ChoiceButton>
                  <ChoiceButton
                    tone="destructive"
                    selected={given === false}
                    onClick={() => answerExam(q.id, false)}
                  >
                    Falso
                  </ChoiceButton>
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
        <p className="text-lg text-muted-foreground">In attesa del docente…</p>
      )}

      {snap?.status === "QUESTION_OPEN" && snap.question && (
        <div className="flex w-full max-w-md flex-col items-center gap-5">
          <Badge variant="secondary">
            Domanda {(snap.currentIndex ?? 0) + 1}/{snap.totalQuestions}
          </Badge>
          {snap.question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snap.question.imageUrl}
              alt=""
              className="max-h-48 rounded-lg border border-border"
            />
          )}
          <p className="text-center text-lg font-medium">{snap.question.text}</p>
          {alreadyAnswered ? (
            <p className="text-muted-foreground">Risposta inviata ✓</p>
          ) : (
            <div className="flex w-full gap-4">
              <ChoiceButton
                tone="positive"
                onClick={() => answer(true)}
                className="py-4 text-lg"
              >
                Vero
              </ChoiceButton>
              <ChoiceButton
                tone="destructive"
                onClick={() => answer(false)}
                className="py-4 text-lg"
              >
                Falso
              </ChoiceButton>
            </div>
          )}
        </div>
      )}

      {snap?.status === "QUESTION_REVEALED" && (
        <div className="text-center">
          {snap.you?.answered ? (
            <p
              className={cn(
                "text-4xl font-bold",
                snap.you.correct ? "text-positive" : "text-destructive",
              )}
            >
              {snap.you.correct ? "Giusto!" : "Sbagliato"}
            </p>
          ) : (
            <p className="text-2xl text-muted-foreground">Non hai risposto</p>
          )}
        </div>
      )}

      {snap?.status === "ENDED" && (
        <p className="ds-title">Quiz terminato. Grazie!</p>
      )}
    </div>
  );
}
