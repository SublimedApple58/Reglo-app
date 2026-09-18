/**
 * Pausa tra una guida e l'altra (REG-484).
 *
 * Quando viene prenotata una guida, il sistema crea automaticamente subito DOPO
 * di essa un blocco-slot sull'ISTRUTTORE, di durata pari al buffer impostato
 * dall'autoscuola. La guida successiva di quell'istruttore potrà quindi essere
 * presa solo dopo quel tempo: il blocco è un normale
 * `AutoscuolaInstructorBlock`, quindi tutti i controlli di disponibilità e di
 * conflitto che già esistono lo vedono senza dover essere toccati.
 *
 * Setting **per autoscuola** (non per istruttore, non per allievo), nel JSON
 * `CompanyService.limits`:
 *
 * - `lessonBufferEnabled`  (boolean, default false)
 * - `lessonBufferMinutes`  (int 5..60 a passi di 5, default 15)
 */

import { prisma } from "@/db/prisma";
import type { Prisma } from "@prisma/client";

export const DEFAULT_LESSON_BUFFER_ENABLED = false;
export const DEFAULT_LESSON_BUFFER_MINUTES = 15;
export const LESSON_BUFFER_MIN_MINUTES = 5;
export const LESSON_BUFFER_MAX_MINUTES = 60;
export const LESSON_BUFFER_STEP_MINUTES = 5;

/** `reason` dei blocchi creati automaticamente dopo una guida. */
export const LESSON_BUFFER_BLOCK_REASON = "lesson_buffer";

/**
 * Porta un valore arbitrario (JSON non tipizzato) dentro i vincoli della UI:
 * intero, multiplo di 5, fra 5 e 60. Valori non numerici → default.
 */
export function normalizeLessonBufferMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LESSON_BUFFER_MINUTES;
  }
  const stepped =
    Math.round(value / LESSON_BUFFER_STEP_MINUTES) * LESSON_BUFFER_STEP_MINUTES;
  return Math.min(
    LESSON_BUFFER_MAX_MINUTES,
    Math.max(LESSON_BUFFER_MIN_MINUTES, stepped),
  );
}

export function isLessonBufferEnabled(
  limits: Record<string, unknown> | null | undefined,
): boolean {
  return typeof limits?.lessonBufferEnabled === "boolean"
    ? (limits.lessonBufferEnabled as boolean)
    : DEFAULT_LESSON_BUFFER_ENABLED;
}

/**
 * Minuti di pausa effettivi per l'autoscuola: **0 quando il setting è spento**,
 * così ogni chiamante può usare il valore senza ulteriori `if`.
 */
export function resolveLessonBufferMinutes(
  limits: Record<string, unknown> | null | undefined,
): number {
  if (!isLessonBufferEnabled(limits)) return 0;
  return normalizeLessonBufferMinutes(limits?.lessonBufferMinutes);
}

/**
 * Finestra effettivamente disponibile per la pausa che segue una guida.
 *
 * Parte dalla fine della guida e dura `bufferMinutes`, ma si **ferma** al primo
 * impegno successivo dell'istruttore (un'altra guida o un altro blocco): così
 * la pausa non finisce mai sopra qualcosa di già prenotato. Ritorna `null`
 * quando non resta nemmeno un minuto — è il caso della guida che riempie
 * esattamente un buco fra due guide.
 */
export async function resolveLessonBufferWindow(params: {
  companyId: string;
  instructorId: string;
  /** Fine della guida: la pausa parte da qui. */
  lessonEndsAt: Date;
  bufferMinutes: number;
  db?: Prisma.TransactionClient;
}): Promise<{ startsAt: Date; endsAt: Date } | null> {
  const { companyId, instructorId, lessonEndsAt, bufferMinutes } = params;
  if (bufferMinutes <= 0) return null;

  const client = params.db ?? prisma;
  const wanted = new Date(lessonEndsAt.getTime() + bufferMinutes * 60_000);

  const [nextAppointment, nextBlock] = await Promise.all([
    client.autoscuolaAppointment.findFirst({
      where: {
        companyId,
        instructorId,
        status: { notIn: ["cancelled"] },
        startsAt: { lt: wanted },
        endsAt: { gt: lessonEndsAt },
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
    client.autoscuolaInstructorBlock.findFirst({
      where: {
        companyId,
        instructorId,
        startsAt: { lt: wanted },
        endsAt: { gt: lessonEndsAt },
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
  ]);

  let end = wanted;
  for (const next of [nextAppointment, nextBlock]) {
    if (next && next.startsAt < end) end = next.startsAt;
  }
  if (end <= lessonEndsAt) return null;
  return { startsAt: lessonEndsAt, endsAt: end };
}

/**
 * `true` quando dopo la guida non c'è spazio per la pausa INTERA — cioè la
 * guida riempie (esattamente o quasi) il buco fra due impegni. È la condizione
 * che fa comparire allo staff l'avviso "Non avrai tempo per una pausa".
 */
export async function lacksRoomForLessonBuffer(params: {
  companyId: string;
  instructorId: string | null | undefined;
  lessonEndsAt: Date | null | undefined;
  bufferMinutes: number;
  db?: Prisma.TransactionClient;
}): Promise<boolean> {
  const { companyId, instructorId, lessonEndsAt, bufferMinutes } = params;
  if (!instructorId || !lessonEndsAt || bufferMinutes <= 0) return false;
  const window = await resolveLessonBufferWindow({
    companyId,
    instructorId,
    lessonEndsAt,
    bufferMinutes,
    db: params.db,
  });
  if (!window) return true;
  const availableMs = window.endsAt.getTime() - window.startsAt.getTime();
  return availableMs < bufferMinutes * 60_000;
}

/**
 * Crea il blocco-pausa che segue una guida appena prenotata.
 *
 * No-op quando il setting è spento, la guida non ha istruttore, o dopo la guida
 * non resta spazio (guida che riempie esattamente un buco). Se lo spazio è
 * parziale il blocco nasce **troncato** fino all'impegno successivo.
 *
 * Volutamente tollerante agli errori: la pausa è un contorno della
 * prenotazione, non deve mai far fallire la prenotazione stessa.
 */
export async function createLessonBufferBlock(params: {
  companyId: string;
  instructorId: string | null | undefined;
  /** Fine della guida appena prenotata: la pausa parte da qui. */
  endsAt: Date | null | undefined;
  bufferMinutes: number;
  /** Client transazionale, quando la guida nasce dentro una transazione. */
  db?: Prisma.TransactionClient;
}): Promise<void> {
  const { companyId, instructorId, endsAt, bufferMinutes } = params;
  if (!instructorId || !endsAt || bufferMinutes <= 0) return;

  const client = params.db ?? prisma;
  try {
    const window = await resolveLessonBufferWindow({
      companyId,
      instructorId,
      lessonEndsAt: endsAt,
      bufferMinutes,
      db: params.db,
    });
    if (!window) return;

    await client.autoscuolaInstructorBlock.create({
      data: {
        companyId,
        instructorId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        reason: LESSON_BUFFER_BLOCK_REASON,
      },
    });
  } catch {
    // Nessun rilancio: una pausa mancata non deve annullare una prenotazione
    // andata a buon fine.
  }
}
