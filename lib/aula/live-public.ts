import "server-only";

import { prisma } from "@/db/prisma";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import {
  getAnswers,
  getSession,
  joinParticipant,
  listParticipants,
  recordAnswer,
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
  totalQuestions: number;
  currentIndex: number | null;
  participantCount: number;
  question: LiveQuestionView | null;
  /** Solo in QUESTION_REVEALED: chi giusto/sbagliato/non-risposto. */
  reveal: {
    counts: { correct: number; wrong: number; noAnswer: number };
    results: LiveResultRow[];
  } | null;
  /** Solo se chiamato con participantId: esito personale. */
  you: { answered: boolean; answer: boolean | null; correct: boolean | null } | null;
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
    totalQuestions: session.questionIds.length,
    currentIndex: currentIndex !== null && currentIndex >= 0 ? currentIndex : null,
    participantCount: participants.length,
    question,
    reveal,
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
}) {
  const session = await getSession(input.code);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "QUESTION_OPEN" || !session.currentQuestionId) {
    throw new Error("QUESTION_NOT_OPEN");
  }
  await recordAnswer({
    code: input.code,
    questionId: session.currentQuestionId,
    participantId: input.participantId,
    answer: input.answer,
  });
}
