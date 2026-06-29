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
  | "IN_PROGRESS"
  | "REVIEWING"
  | "ENDED";

/**
 * Due modalità di quiz:
 * - LIVE: una domanda alla volta, a ritmo del docente, reveal per domanda (Kahoot).
 * - EXAM: tutte le domande insieme, lo studente risponde in autonomia; al
 *   "Termina quiz" si correggono in massa (classifica a schermo).
 */
export type AulaLiveMode = "LIVE" | "EXAM";

export type AulaLiveState = {
  code: string;
  lessonId: string;
  teacherId: string;
  mode: AulaLiveMode;
  status: AulaLiveStatus;
  questionIds: string[];
  currentQuestionId: string | null;
  createdAt: number;
  /** EXAM: istante di avvio del quiz (per distinguere chi entra a quiz avviato). */
  startedAt?: number;
};

export type AulaParticipant = {
  participantId: string;
  name: string;
  rejoinToken: string;
  /** Istante di ingresso (ms). */
  joinedAt?: number;
  /**
   * EXAM sincronizzato: indice della domanda su cui si trovavano tutti al
   * momento dell'ingresso (null = entrato in LOBBY, prima dell'avvio).
   */
  joinedAtIndex?: number | null;
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
  mode: AulaLiveMode;
  questionIds: string[];
  now: number;
}): Promise<AulaLiveState> {
  const redis = redisOrThrow();
  const state: AulaLiveState = {
    code: input.code,
    lessonId: input.lessonId,
    teacherId: input.teacherId,
    mode: input.mode,
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

/**
 * EXAM sincronizzato: avvia il quiz sulla PRIMA domanda. Tutti partono allineati
 * e avanzano insieme (barriera per-domanda), senza intervento del docente.
 */
export const startExam = (code: string, firstQuestionId: string, now: number) =>
  patchSession(code, {
    status: "IN_PROGRESS",
    currentQuestionId: firstQuestionId,
    startedAt: now,
  });

/**
 * EXAM sincronizzato: sposta la domanda corrente (la barriera è passata).
 * `null` = tutti hanno completato l'ultima domanda (svolgimento finito).
 */
export const setExamCurrentQuestion = (
  code: string,
  questionId: string | null,
) => patchSession(code, { currentQuestionId: questionId });

/** EXAM: correzione a schermo, una domanda alla volta (il docente la spiega). */
export const setReviewQuestion = (code: string, questionId: string) =>
  patchSession(code, { status: "REVIEWING", currentQuestionId: questionId });

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
  now?: number;
  joinedAtIndex?: number | null;
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
    joinedAt: input.now,
    joinedAtIndex: input.joinedAtIndex ?? null,
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

/** EXAM: tutte le risposte di tutte le domande, indicizzate per domanda. */
export async function getAllAnswers(
  code: string,
  questionIds: string[],
): Promise<Record<string, Record<string, boolean>>> {
  const entries = await Promise.all(
    questionIds.map(
      async (qId) => [qId, await getAnswers(code, qId)] as const,
    ),
  );
  return Object.fromEntries(entries);
}
