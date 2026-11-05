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
export async function alignLessonEndToRoad(db: Db, appointmentId: string, endedAt: Date): Promise<boolean> {
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

  const end = roadLessonEnd(a.startsAt, bookedEnd, endedAt, next);
  if (end.getTime() === bookedEnd.getTime() && a.endsAt) return false;
  await db.autoscuolaAppointment.update({ where: { id: a.id }, data: { endsAt: end } });

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
