import "server-only";

import { randomUUID } from "crypto";
import { getRedis } from "@/lib/cache/redis";

/**
 * Reglo Aula — stato del quiz live su Redis (Upstash).
 *
 * Tutto effimero, 0 storico (scelta MVP): nessuna tabella Postgres per il live.
 * Le chiavi scadono via TTL a fine lezione. Vedi docs/features/reglo-aula.md.
 *
 *   aula:live:{code}            → AulaLiveState (JSON)
 *   aula:live:{code}:p          → hash participantId → { name, rejoinToken }
 *   aula:live:{code}:a:{qId}    → hash participantId → "1" | "0"
 */

export type AulaLiveStatus =
  | "LOBBY"
  | "QUESTION_OPEN"
  | "QUESTION_REVEALED"
  | "ENDED";

export type AulaLiveState = {
  code: string;
  lessonId: string;
  teacherId: string;
  status: AulaLiveStatus;
  questionIds: string[];
  currentQuestionId: string | null;
  createdAt: number;
};

export type AulaParticipant = {
  participantId: string;
  name: string;
  rejoinToken: string;
};

const TTL_SECONDS = 6 * 60 * 60; // 6h: copre l'intera lezione

const stateKey = (code: string) => `aula:live:${code}`;
const participantsKey = (code: string) => `aula:live:${code}:p`;
const answersKey = (code: string, questionId: string) =>
  `aula:live:${code}:a:${questionId}`;

function redisOrThrow() {
  const redis = getRedis();
  if (!redis) throw new Error("REDIS_UNAVAILABLE");
  return redis;
}

/** Codice join breve, leggibile (no caratteri ambigui). */
export function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomUUID().replace(/-/g, "");
  for (let i = 0; i < 6; i++) {
    code += alphabet[parseInt(bytes[i], 16) % alphabet.length];
  }
  return code;
}

export async function createSession(input: {
  code: string;
  lessonId: string;
  teacherId: string;
  questionIds: string[];
  now: number;
}): Promise<AulaLiveState> {
  const redis = redisOrThrow();
  const state: AulaLiveState = {
    code: input.code,
    lessonId: input.lessonId,
    teacherId: input.teacherId,
    status: "LOBBY",
    questionIds: input.questionIds,
    currentQuestionId: null,
    createdAt: input.now,
  };
  await redis.set(stateKey(input.code), state, { ex: TTL_SECONDS });
  return state;
}

export async function getSession(code: string): Promise<AulaLiveState | null> {
  const redis = redisOrThrow();
  return (await redis.get<AulaLiveState>(stateKey(code))) ?? null;
}

async function patchSession(
  code: string,
  patch: Partial<AulaLiveState>,
): Promise<AulaLiveState> {
  const redis = redisOrThrow();
  const current = await getSession(code);
  if (!current) throw new Error("SESSION_NOT_FOUND");
  const next = { ...current, ...patch };
  await redis.set(stateKey(code), next, { ex: TTL_SECONDS });
  return next;
}

export const setStatus = (code: string, status: AulaLiveStatus) =>
  patchSession(code, { status });

export const openQuestion = (code: string, questionId: string) =>
  patchSession(code, { status: "QUESTION_OPEN", currentQuestionId: questionId });

export const revealQuestion = (code: string) =>
  patchSession(code, { status: "QUESTION_REVEALED" });

export const endSession = (code: string) =>
  patchSession(code, { status: "ENDED", currentQuestionId: null });

// ── Partecipanti ────────────────────────────────────────────────────────────

export async function listParticipants(
  code: string,
): Promise<AulaParticipant[]> {
  const redis = redisOrThrow();
  const map =
    (await redis.hgetall<Record<string, AulaParticipant>>(
      participantsKey(code),
    )) ?? {};
  return Object.values(map);
}

/**
 * Join di un partecipante. Nome univoco per sessione: se già preso (da un altro
 * device) viene rifiutato. Rientro: passando un `rejoinToken` valido si riprende
 * lo stesso `participantId` anche con nome uguale.
 */
export async function joinParticipant(input: {
  code: string;
  name: string;
  rejoinToken?: string;
}): Promise<AulaParticipant> {
  const redis = redisOrThrow();
  const participants = await listParticipants(input.code);

  if (input.rejoinToken) {
    const existing = participants.find(
      (p) => p.rejoinToken === input.rejoinToken,
    );
    if (existing) return existing;
  }

  const nameTaken = participants.some(
    (p) => p.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
  );
  if (nameTaken) throw new Error("NAME_TAKEN");

  const participant: AulaParticipant = {
    participantId: randomUUID(),
    name: input.name.trim(),
    rejoinToken: randomUUID(),
  };
  await redis.hset(participantsKey(input.code), {
    [participant.participantId]: participant,
  });
  await redis.expire(participantsKey(input.code), TTL_SECONDS);
  return participant;
}

// ── Risposte ──────────────────────────────────────────────────────────────

/** Registra (idempotente) la risposta di un partecipante alla domanda corrente. */
export async function recordAnswer(input: {
  code: string;
  questionId: string;
  participantId: string;
  answer: boolean;
}): Promise<void> {
  const redis = redisOrThrow();
  const key = answersKey(input.code, input.questionId);
  await redis.hset(key, { [input.participantId]: input.answer ? "1" : "0" });
  await redis.expire(key, TTL_SECONDS);
}

export async function getAnswers(
  code: string,
  questionId: string,
): Promise<Record<string, boolean>> {
  const redis = redisOrThrow();
  const map =
    (await redis.hgetall<Record<string, string>>(
      answersKey(code, questionId),
    )) ?? {};
  const out: Record<string, boolean> = {};
  for (const [participantId, val] of Object.entries(map)) {
    out[participantId] = val === "1" || val === "true";
  }
  return out;
}
