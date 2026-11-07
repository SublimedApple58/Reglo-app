import type { PrismaClient } from "@prisma/client";

import { LESSON_BUFFER_BLOCK_REASON } from "@/lib/autoscuole/agenda-occupancy";

/**
 * REG-723 — a fine guida Road l'agenda segue l'orario reale (decisione di
 * Tiziano, opzione B), per TUTTE le guide Road, libere e prenotate:
 *
 * - la fine diventa quella reale, arrotondata per eccesso ai 5 minuti e almeno
 *   5 minuti dopo l'inizio: si ACCORCIA se la guida finisce prima, si ALLUNGA
 *   se sfora, ma al massimo fino all'inizio del prossimo impegno
 *   dell'istruttore (guida o blocco);
 * - la pausa dopo la guida (REG-484) slitta con lei, stessa durata; se finisse
 *   sopra l'impegno dopo si accorcia, e se non resta spazio si toglie;
 * - l'orario reale resta sulla sessione (`RoadSession.endedAt`); prezzo e
 *   crediti non cambiano (si tocca solo l'orario).
 *
 * Caso del 4/11 (prod): guida 18:43–19:13 terminata alle 19:28 → 18:43–19:30,
 * pausa 19:30–19:35 (prima restava 19:13–19:18, mentre si guidava ancora).
 */

const STEP_MS = 5 * 60 * 1000;

/**
 * Segnalazione Ricca (06/11, REG-728): guida 9:00–10:00 avviata in Road alle
 * 8:45 → l'inizio diventa l'avvio in Road arrotondato per difetto ai 5 minuti
 * (8:47 → 8:45), solo se è PRIMA dell'inizio prenotato: in ritardo l'inizio
 * non si tocca. La fine NON scala con l'anticipo: è l'orario reale di
 * chiusura (`roadLessonEnd`), quindi chiusa alle 9:50 → 8:45–9:50 (65'), ed è
 * questa durata che conta per le ore obbligatorie (REG-726).
 */
export function roadLessonStart(startsAt: Date, startedAt: Date | null): Date {
  if (!startedAt) return startsAt;
  const started = Math.floor(startedAt.getTime() / STEP_MS) * STEP_MS;
  return started < startsAt.getTime() ? new Date(started) : startsAt;
}

/**
 * Impostazione «Guide avviate in anticipo» (Ricca, 07/11): `limits.roadEarlyKeepDuration`.
 * - false / assente (DEFAULT) = «Orari reali»: come REG-728, la fine è la
 *   chiusura reale;
 * - true = «Mantieni la durata prenotata»: partita alle 8:45 una guida da 60'
 *   → finisce alle 9:45 (anche se chiusa prima); se si sfora vale la regola di
 *   sempre (orario reale, fino al prossimo impegno).
 * Solo per le guide avviate PRIMA dell'inizio prenotato.
 */
export const roadEarlyKeepsDuration = (limits: Record<string, unknown>) => limits.roadEarlyKeepDuration === true;

/**
 * Fine della guida mentre si guida (app: residuo, «Fine 9:45», avvisi). Con
 * «Mantieni la durata» e avvio in anticipo = inizio anticipato + durata
 * prenotata; altrimenti la fine prenotata (REG-728).
 */
export function roadDriveEnd(startsAt: Date, bookedEnd: Date, startedAt: Date | null, keepDuration: boolean): Date {
  if (!keepDuration) return bookedEnd;
  const start = roadLessonStart(startsAt, startedAt);
  const early = startsAt.getTime() - start.getTime();
  return early > 0 ? new Date(bookedEnd.getTime() - early) : bookedEnd;
}

/**
 * La nuova fine della guida. `next` = inizio del prossimo impegno
 * dell'istruttore (null = nessuno): ferma solo l'allungamento, mai oltre la
 * fine prenotata all'indietro.
 */
export function roadLessonEnd(startsAt: Date, bookedEnd: Date, endedAt: Date, next: Date | null): Date {
  const real = Math.max(Math.ceil(endedAt.getTime() / STEP_MS) * STEP_MS, startsAt.getTime() + STEP_MS);
  const booked = bookedEnd.getTime();
  if (real <= booked || !next) return new Date(real);
  return new Date(Math.max(booked, Math.min(real, next.getTime())));
}

/** La pausa che slitta a `start` con la stessa durata, tagliata a `next`; null = non ci sta più. */
export function slidLessonPause(
  pause: { startsAt: Date; endsAt: Date },
  start: Date,
  next: Date | null,
): { startsAt: Date; endsAt: Date } | null {
  const length = pause.endsAt.getTime() - pause.startsAt.getTime();
  let end = start.getTime() + length;
  if (next && next.getTime() < end) end = next.getTime();
  if (end <= start.getTime()) return null;
  return { startsAt: start, endsAt: new Date(end) };
}

type Db = Pick<PrismaClient, "autoscuolaAppointment" | "autoscuolaInstructorBlock">;

/**
 * Allinea guida e pausa all'orario reale. Torna `true` se l'agenda è cambiata
 * (da invalidare).
 */
export async function alignLessonEndToRoad(
  db: Db,
  appointmentId: string,
  endedAt: Date,
  startedAt: Date | null = null,
  keepDuration = false,
): Promise<boolean> {
  const a = await db.autoscuolaAppointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, companyId: true, instructorId: true, startsAt: true, endsAt: true },
  });
  if (!a) return false;
  const bookedEnd = a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60 * 1000);

  // La pausa di QUESTA guida: nata sulla fine prenotata.
  const pause = a.instructorId
    ? await db.autoscuolaInstructorBlock.findFirst({
        where: { companyId: a.companyId, instructorId: a.instructorId, reason: LESSON_BUFFER_BLOCK_REASON, startsAt: bookedEnd },
        select: { id: true, startsAt: true, endsAt: true },
      })
    : null;

  // Il prossimo impegno dell'istruttore dopo l'inizio di questa guida (la sua
  // pausa esclusa): guide non annullate e blocchi.
  let next: Date | null = null;
  if (a.instructorId) {
    const [lesson, block] = await Promise.all([
      db.autoscuolaAppointment.findFirst({
        where: {
          companyId: a.companyId,
          instructorId: a.instructorId,
          id: { not: a.id },
          status: { notIn: ["cancelled"] },
          startsAt: { gt: a.startsAt },
        },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true },
      }),
      db.autoscuolaInstructorBlock.findFirst({
        where: {
          companyId: a.companyId,
          instructorId: a.instructorId,
          startsAt: { gt: a.startsAt },
          ...(pause ? { id: { not: pause.id } } : {}),
        },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true },
      }),
    ]);
    for (const n of [lesson?.startsAt, block?.startsAt]) {
      if (n && (!next || n < next)) next = n;
    }
  }

  // Partita in anticipo: l'inizio va all'avvio reale. La fine segue l'orario
  // reale di chiusura (REG-728: non scala con l'anticipo); con «Mantieni la
  // durata prenotata» vale almeno inizio + durata prenotata, e se si sfora
  // l'orario reale fino al prossimo impegno.
  const start = roadLessonStart(a.startsAt, startedAt);
  const early = a.startsAt.getTime() - start.getTime();
  const kept = keepDuration && early > 0 ? roadDriveEnd(a.startsAt, bookedEnd, startedAt, true) : null;
  const end = kept
    ? new Date(Math.max(kept.getTime(), roadLessonEnd(start, kept, endedAt, next).getTime()))
    : roadLessonEnd(start, bookedEnd, endedAt, next);
  if (!early && end.getTime() === bookedEnd.getTime() && a.endsAt) return false;
  await db.autoscuolaAppointment.update({
    where: { id: a.id },
    data: early ? { startsAt: start, endsAt: end } : { endsAt: end },
  });

  if (pause) {
    const slid = slidLessonPause(pause, end, next);
    if (slid) {
      await db.autoscuolaInstructorBlock.update({ where: { id: pause.id }, data: slid });
    } else {
      await db.autoscuolaInstructorBlock.delete({ where: { id: pause.id } });
    }
  }
  return true;
}
