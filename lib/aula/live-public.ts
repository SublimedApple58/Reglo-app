import "server-only";

import { prisma } from "@/db/prisma";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import {
  getAllAnswers,
  getAnswers,
  getSession,
  joinParticipant,
  listParticipants,
  recordAnswer,
  setExamCurrentQuestion,
  type AulaLiveMode,
  type AulaLiveState,
  type AulaLiveStatus,
} from "@/lib/aula/live-state";

/**
 * Reglo Aula — logica pubblica del quiz live (lato studente + snapshot proiettore).
 * Nessuna auth: opera solo su Redis + lettura read-only di QuizQuestion.
 * Vedi docs/features/reglo-aula.md.
 */

export type LiveQuestionView = {
  id: string;
  text: string;
  imageUrl: string | null;
  /** Presente solo quando la domanda è in reveal. */
  correctAnswer: boolean | null;
};

export type LiveResultRow = {
  name: string;
  answered: boolean;
  answer: boolean | null;
  correct: boolean | null;
};

export type LiveSnapshot = {
  code: string;
  status: AulaLiveStatus;
  mode: AulaLiveMode;
  totalQuestions: number;
  currentIndex: number | null;
  participantCount: number;
  question: LiveQuestionView | null;
  /** Solo in QUESTION_REVEALED (LIVE): chi giusto/sbagliato/non-risposto. */
  reveal: {
    counts: { correct: number; wrong: number; noAnswer: number };
    results: LiveResultRow[];
  } | null;
  /** EXAM REVIEWING/ENDED: l'elenco completo delle domande (per la correzione). */
  questions: LiveQuestionView[] | null;
  /**
   * EXAM sincronizzato IN_PROGRESS: stato di allineamento per il proiettore.
   * `currentIndex === null` = tutti hanno completato (svolgimento finito).
   */
  examLive: {
    currentIndex: number | null;
    total: number;
    participantCount: number;
    /** Quanti hanno già risposto alla domanda corrente (sono al passo). */
    aligned: number;
    /** Quanti devono ancora rispondere alla domanda corrente. */
    pending: number;
    /** Quanti sono entrati a quiz già avviato. */
    joinedAfterStart: number;
    /** Elenco partecipanti con stato di allineamento. */
    roster: { name: string; answeredCurrent: boolean; joinedLate: boolean }[];
  } | null;
  /** EXAM ENDED: classifica per studente (correzione di massa a schermo). */
  examResults: {
    total: number;
    rows: { name: string; score: number; answered: number }[];
  } | null;
  /** Solo se chiamato con participantId: esito personale. */
  you:
    | {
        // LIVE
        answered?: boolean;
        answer?: boolean | null;
        correct?: boolean | null;
        // EXAM sincronizzato: ha risposto alla domanda corrente?
        answeredCurrent?: boolean;
        // EXAM (correzione/fine)
        answers?: Record<string, boolean>;
        perQuestion?: Record<string, boolean>;
        score?: number;
        total?: number;
      }
    | null;
};

async function loadQuestion(
  questionId: string,
  revealed: boolean,
): Promise<LiveQuestionView | null> {
  const q = await prisma.quizQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, questionText: true, imageKey: true, correctAnswer: true },
  });
  if (!q) return null;
  return {
    id: q.id,
    text: q.questionText,
    imageUrl: q.imageKey ? await getSignedAssetUrl(q.imageKey) : null,
    correctAnswer: revealed ? q.correctAnswer : null,
  };
}

export async function buildLiveSnapshot(
  code: string,
  participantId?: string,
): Promise<LiveSnapshot | null> {
  const session = await getSession(code);
  if (!session) return null;
  return session.mode === "EXAM"
    ? buildExamSnapshot(code, session, participantId)
    : buildLiveModeSnapshot(code, session, participantId);
}

/** Snapshot della modalità LIVE (una domanda alla volta, reveal per domanda). */
async function buildLiveModeSnapshot(
  code: string,
  session: AulaLiveState,
  participantId?: string,
): Promise<LiveSnapshot> {
  const participants = await listParticipants(code);
  const revealed = session.status === "QUESTION_REVEALED";
  const showQuestion =
    (session.status === "QUESTION_OPEN" || revealed) &&
    !!session.currentQuestionId;

  const question = showQuestion
    ? await loadQuestion(session.currentQuestionId as string, revealed)
    : null;

  const currentIndex = session.currentQuestionId
    ? session.questionIds.indexOf(session.currentQuestionId)
    : null;

  let reveal: LiveSnapshot["reveal"] = null;
  let you: LiveSnapshot["you"] = null;

  if (revealed && question) {
    const answers = await getAnswers(code, question.id);
    const counts = { correct: 0, wrong: 0, noAnswer: 0 };
    const results: LiveResultRow[] = participants.map((p) => {
      const has = Object.prototype.hasOwnProperty.call(
        answers,
        p.participantId,
      );
      const answer = has ? answers[p.participantId] : null;
      const correct = has ? answer === question.correctAnswer : null;
      if (!has) counts.noAnswer += 1;
      else if (correct) counts.correct += 1;
      else counts.wrong += 1;
      return { name: p.name, answered: has, answer, correct };
    });
    reveal = { counts, results };

    if (participantId) {
      const has = Object.prototype.hasOwnProperty.call(answers, participantId);
      const answer = has ? answers[participantId] : null;
      you = {
        answered: has,
        answer,
        correct: has ? answer === question.correctAnswer : null,
      };
    }
  }

  return {
    code: session.code,
    status: session.status,
    mode: "LIVE",
    totalQuestions: session.questionIds.length,
    currentIndex: currentIndex !== null && currentIndex >= 0 ? currentIndex : null,
    participantCount: participants.length,
    question,
    reveal,
    questions: null,
    examLive: null,
    examResults: null,
    you,
  };
}

/**
 * Snapshot della modalità EXAM ("Quiz completo") — sincronizzato.
 *
 * I ragazzi NON vanno ognuno per conto suo: il quiz avanza una domanda alla
 * volta e si sblocca la successiva solo quando TUTTI i partecipanti hanno
 * risposto alla corrente (barriera per-domanda, senza intervento del docente).
 * Chi entra a quiz avviato parte dalla domanda in cui si trovano tutti.
 *
 * - LOBBY: solo QR (nessuna domanda).
 * - IN_PROGRESS (currentQuestionId != null): mostra SOLO la domanda corrente
 *   sul telefono; il proiettore mostra QR + avanzamento/allineamento (no testo).
 * - IN_PROGRESS (currentQuestionId == null): tutti hanno completato → il docente
 *   sceglie se correggere a schermo o mostrare la classifica.
 * - REVIEWING: correzione a schermo, una domanda alla volta.
 * - ENDED: classifica per studente; lo studente vede il proprio punteggio +
 *   correzione domanda per domanda (con le risposte corrette).
 */
async function buildExamSnapshot(
  code: string,
  session: AulaLiveState,
  participantId?: string,
): Promise<LiveSnapshot> {
  const participants = await listParticipants(code);
  const total = session.questionIds.length;
  const started = session.status === "IN_PROGRESS";
  const reviewing = session.status === "REVIEWING";
  const ended = session.status === "ENDED";

  const base: LiveSnapshot = {
    code: session.code,
    status: session.status,
    mode: "EXAM",
    totalQuestions: total,
    currentIndex: null,
    participantCount: participants.length,
    question: null,
    reveal: null,
    questions: null,
    examLive: null,
    examResults: null,
    you: null,
  };

  // ── LOBBY: solo QR, nulla da mostrare ──
  if (!started && !reviewing && !ended) return base;

  // ── IN_PROGRESS: svolgimento sincronizzato (una domanda alla volta) ──
  if (started) {
    const joinedAfterStart = participants.filter(
      (p) => p.joinedAtIndex != null,
    ).length;

    // currentQuestionId == null → tutti hanno completato l'ultima domanda.
    if (!session.currentQuestionId) {
      base.examLive = {
        currentIndex: null,
        total,
        participantCount: participants.length,
        aligned: participants.length,
        pending: 0,
        joinedAfterStart,
        roster: participants.map((p) => ({
          name: p.name,
          answeredCurrent: true,
          joinedLate: p.joinedAtIndex != null,
        })),
      };
      if (participantId) base.you = { answeredCurrent: true };
      return base;
    }

    const currentIndex = session.questionIds.indexOf(session.currentQuestionId);
    base.currentIndex = currentIndex >= 0 ? currentIndex : null;
    // Domanda corrente SENZA risposta corretta (no spoiler sul proiettore).
    base.question = await loadQuestion(session.currentQuestionId, false);

    const answers = await getAnswers(code, session.currentQuestionId);
    const hasAnswered = (pid: string) =>
      Object.prototype.hasOwnProperty.call(answers, pid);
    const aligned = participants.filter((p) =>
      hasAnswered(p.participantId),
    ).length;

    base.examLive = {
      currentIndex: base.currentIndex,
      total,
      participantCount: participants.length,
      aligned,
      pending: participants.length - aligned,
      joinedAfterStart,
      roster: participants.map((p) => ({
        name: p.name,
        answeredCurrent: hasAnswered(p.participantId),
        joinedLate: p.joinedAtIndex != null,
      })),
    };

    if (participantId) {
      base.you = { answeredCurrent: hasAnswered(participantId) };
    }
    return base;
  }

  // ── REVIEWING / ENDED: correzione di massa (tutte le domande con risposte) ──
  const questions = (
    await Promise.all(session.questionIds.map((qId) => loadQuestion(qId, true)))
  ).filter((q): q is LiveQuestionView => q !== null);
  base.questions = questions;

  const allAnswers = await getAllAnswers(code, session.questionIds);
  const correctById = new Map(questions.map((q) => [q.id, q.correctAnswer]));

  const scoreFor = (pid: string) => {
    let score = 0;
    let answered = 0;
    for (const qId of session.questionIds) {
      const a = allAnswers[qId];
      if (a && Object.prototype.hasOwnProperty.call(a, pid)) {
        answered += 1;
        if (a[pid] === correctById.get(qId)) score += 1;
      }
    }
    return { score, answered };
  };

  if (ended) {
    const rows = participants
      .map((p) => {
        const { score, answered } = scoreFor(p.participantId);
        return { name: p.name, score, answered };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    base.examResults = { total, rows };
  }

  // Correzione a schermo: domanda corrente + chi giusto/sbagliato/non-risposto.
  if (reviewing && session.currentQuestionId) {
    base.currentIndex = session.questionIds.indexOf(session.currentQuestionId);
    const question =
      questions.find((q) => q.id === session.currentQuestionId) ?? null;
    base.question = question;
    if (question) {
      const a = allAnswers[question.id] ?? {};
      const counts = { correct: 0, wrong: 0, noAnswer: 0 };
      const results: LiveResultRow[] = participants.map((p) => {
        const has = Object.prototype.hasOwnProperty.call(a, p.participantId);
        const answer = has ? a[p.participantId] : null;
        const correct = has ? answer === question.correctAnswer : null;
        if (!has) counts.noAnswer += 1;
        else if (correct) counts.correct += 1;
        else counts.wrong += 1;
        return { name: p.name, answered: has, answer, correct };
      });
      base.reveal = { counts, results };
    }
  }

  if (participantId) {
    const answers: Record<string, boolean> = {};
    const perQuestion: Record<string, boolean> = {};
    let score = 0;
    for (const qId of session.questionIds) {
      const a = allAnswers[qId];
      if (a && Object.prototype.hasOwnProperty.call(a, participantId)) {
        answers[qId] = a[participantId];
        const correct = a[participantId] === correctById.get(qId);
        perQuestion[qId] = correct;
        if (correct) score += 1;
      }
    }
    base.you = { answers, perQuestion, score, total };
  }

  return base;
}

export async function joinLive(input: {
  code: string;
  name: string;
  rejoinToken?: string;
}) {
  const session = await getSession(input.code);
  if (!session || session.status === "ENDED")
    throw new Error("SESSION_NOT_FOUND");

  // EXAM sincronizzato: chi entra a quiz avviato parte dalla domanda corrente.
  let joinedAtIndex: number | null = null;
  if (session.mode === "EXAM" && session.status === "IN_PROGRESS") {
    const idx = session.currentQuestionId
      ? session.questionIds.indexOf(session.currentQuestionId)
      : session.questionIds.length;
    joinedAtIndex = idx >= 0 ? idx : session.questionIds.length;
  }

  return joinParticipant({ ...input, now: Date.now(), joinedAtIndex });
}

export async function submitLiveAnswer(input: {
  code: string;
  participantId: string;
  answer: boolean;
  /** EXAM/LIVE: la domanda a cui si risponde. Deve essere quella corrente. */
  questionId?: string;
}) {
  const session = await getSession(input.code);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  let questionId: string;
  if (session.mode === "EXAM") {
    // Sincronizzato: si risponde SOLO alla domanda corrente; quando tutti hanno
    // risposto la barriera avanza da sola (maybeAdvanceExam).
    if (session.status !== "IN_PROGRESS") throw new Error("EXAM_NOT_OPEN");
    if (!session.currentQuestionId) throw new Error("EXAM_COMPLETED");
    if (input.questionId && input.questionId !== session.currentQuestionId) {
      // Il client è indietro di una domanda: ignora la risposta stantia.
      throw new Error("QUESTION_NOT_CURRENT");
    }
    questionId = session.currentQuestionId;
  } else {
    if (session.status !== "QUESTION_OPEN" || !session.currentQuestionId) {
      throw new Error("QUESTION_NOT_OPEN");
    }
    questionId = session.currentQuestionId;
  }

  await recordAnswer({
    code: input.code,
    questionId,
    participantId: input.participantId,
    answer: input.answer,
  });

  // EXAM: appena registrata la risposta, verifica se tutti sono allineati e in
  // tal caso sblocca la domanda successiva (senza intervento del docente).
  if (session.mode === "EXAM") {
    await maybeAdvanceExam(input.code);
  }
}

/**
 * EXAM sincronizzato: avanza alla domanda successiva SOLO se tutti i
 * partecipanti hanno risposto alla corrente. Idempotente (avanza di +1).
 * Quando l'ultima domanda è completata, `currentQuestionId` diventa `null`
 * (svolgimento finito → il docente corregge / mostra la classifica).
 */
export async function maybeAdvanceExam(code: string): Promise<void> {
  const session = await getSession(code);
  if (!session || session.mode !== "EXAM" || session.status !== "IN_PROGRESS") {
    return;
  }
  if (!session.currentQuestionId) return;

  const participants = await listParticipants(code);
  if (participants.length === 0) return;

  const answers = await getAnswers(code, session.currentQuestionId);
  const allAnswered = participants.every((p) =>
    Object.prototype.hasOwnProperty.call(answers, p.participantId),
  );
  if (!allAnswered) return;

  const currentIndex = session.questionIds.indexOf(session.currentQuestionId);
  const nextId = session.questionIds[currentIndex + 1] ?? null;
  await setExamCurrentQuestion(code, nextId);
}

/**
 * EXAM sincronizzato: forza l'avanzamento alla domanda successiva anche se non
 * tutti hanno risposto (per sbloccare ritardatari/assenti dal proiettore).
 */
export async function forceAdvanceExam(code: string): Promise<void> {
  const session = await getSession(code);
  if (!session || session.mode !== "EXAM" || session.status !== "IN_PROGRESS") {
    return;
  }
  if (!session.currentQuestionId) return;
  const currentIndex = session.questionIds.indexOf(session.currentQuestionId);
  const nextId = session.questionIds[currentIndex + 1] ?? null;
  await setExamCurrentQuestion(code, nextId);
}
