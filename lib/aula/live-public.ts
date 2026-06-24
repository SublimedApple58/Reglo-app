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
  /** EXAM IN_PROGRESS: l'elenco completo delle domande da svolgere (no risposte). */
  questions: LiveQuestionView[] | null;
  /** EXAM IN_PROGRESS: avanzamento per il proiettore. */
  examProgress: { completed: number; answersReceived: number } | null;
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
        // EXAM
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
    examProgress: null,
    examResults: null,
    you,
  };
}

/**
 * Snapshot della modalità EXAM (tutte le domande insieme; correzione di massa).
 * - LOBBY: solo QR (questions null).
 * - IN_PROGRESS: lista domande senza risposte + avanzamento; lo studente vede
 *   anche le proprie risposte già date.
 * - ENDED: classifica per studente a schermo; lo studente vede il proprio
 *   punteggio + correzione domanda per domanda (con le risposte corrette).
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
  // Bloccato = risposte definitive + correttezza nota (correzione o fine).
  const locked = reviewing || ended;

  // Domande: durante lo svolgimento (senza risposta) e quando bloccato (con risposta).
  const questions =
    started || locked
      ? (
          await Promise.all(
            session.questionIds.map((qId) => loadQuestion(qId, locked)),
          )
        ).filter((q): q is LiveQuestionView => q !== null)
      : null;

  let examProgress: LiveSnapshot["examProgress"] = null;
  let examResults: LiveSnapshot["examResults"] = null;
  let you: LiveSnapshot["you"] = null;
  let question: LiveQuestionView | null = null;
  let reveal: LiveSnapshot["reveal"] = null;
  let currentIndex: number | null = null;

  if (started || locked) {
    const allAnswers = await getAllAnswers(code, session.questionIds);
    const correctById = new Map(
      (questions ?? []).map((q) => [q.id, q.correctAnswer]),
    );

    // Punteggio per partecipante (rivelato solo quando bloccato).
    const scoreFor = (pid: string) => {
      let score = 0;
      let answered = 0;
      for (const qId of session.questionIds) {
        const a = allAnswers[qId];
        if (a && Object.prototype.hasOwnProperty.call(a, pid)) {
          answered += 1;
          if (locked && a[pid] === correctById.get(qId)) score += 1;
        }
      }
      return { score, answered };
    };

    if (started) {
      let completed = 0;
      let answersReceived = 0;
      for (const p of participants) {
        const { answered } = scoreFor(p.participantId);
        answersReceived += answered;
        if (answered >= total && total > 0) completed += 1;
      }
      examProgress = { completed, answersReceived };
    }

    if (ended) {
      const rows = participants
        .map((p) => {
          const { score, answered } = scoreFor(p.participantId);
          return { name: p.name, score, answered };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      examResults = { total, rows };
    }

    // Correzione a schermo: domanda corrente + chi giusto/sbagliato/non-risposto.
    if (reviewing && session.currentQuestionId) {
      currentIndex = session.questionIds.indexOf(session.currentQuestionId);
      question = questions?.find((q) => q.id === session.currentQuestionId) ?? null;
      if (question) {
        const a = allAnswers[question.id] ?? {};
        const counts = { correct: 0, wrong: 0, noAnswer: 0 };
        const results: LiveResultRow[] = participants.map((p) => {
          const has = Object.prototype.hasOwnProperty.call(a, p.participantId);
          const answer = has ? a[p.participantId] : null;
          const correct = has ? answer === question!.correctAnswer : null;
          if (!has) counts.noAnswer += 1;
          else if (correct) counts.correct += 1;
          else counts.wrong += 1;
          return { name: p.name, answered: has, answer, correct };
        });
        reveal = { counts, results };
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
          if (locked) {
            const correct = a[participantId] === correctById.get(qId);
            perQuestion[qId] = correct;
            if (correct) score += 1;
          }
        }
      }
      you = locked ? { answers, perQuestion, score, total } : { answers };
    }
  }

  return {
    code: session.code,
    status: session.status,
    mode: "EXAM",
    totalQuestions: total,
    currentIndex:
      currentIndex !== null && currentIndex >= 0 ? currentIndex : null,
    participantCount: participants.length,
    question,
    reveal,
    questions,
    examProgress,
    examResults,
    you,
  };
}

export async function joinLive(input: {
  code: string;
  name: string;
  rejoinToken?: string;
}) {
  const session = await getSession(input.code);
  if (!session || session.status === "ENDED") throw new Error("SESSION_NOT_FOUND");
  return joinParticipant(input);
}

export async function submitLiveAnswer(input: {
  code: string;
  participantId: string;
  answer: boolean;
  /** EXAM: la domanda a cui si risponde (in LIVE è quella corrente). */
  questionId?: string;
}) {
  const session = await getSession(input.code);
  if (!session) throw new Error("SESSION_NOT_FOUND");

  let questionId: string;
  if (session.mode === "EXAM") {
    // Tutte le domande sono aperte durante lo svolgimento; la risposta può
    // essere cambiata finché il quiz non viene terminato.
    if (session.status !== "IN_PROGRESS") throw new Error("EXAM_NOT_OPEN");
    if (!input.questionId || !session.questionIds.includes(input.questionId)) {
      throw new Error("INVALID_QUESTION");
    }
    questionId = input.questionId;
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
}
