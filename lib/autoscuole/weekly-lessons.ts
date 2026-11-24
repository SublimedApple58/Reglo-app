import { prisma as defaultPrisma } from "@/db/prisma";

/**
 * REG-781 — il conteggio settimanale delle guide di un allievo, in un posto
 * solo. Prima era copiato in sei punti (prenotazione da app, opzioni di
 * prenotazione, creazione dall'ufficio/istruttore, guide in serie, spostamento,
 * scambio) e contava ogni appuntamento non annullato, esami e posti di gruppo
 * compresi.
 *
 * Gli esami (`type = "esame"`) non contano mai. I posti nelle guide di gruppo
 * (`groupLessonId`) contano come una guida, a meno che l'autoscuola spenga
 * «Le guide di gruppo contano» (`weeklyLimitCountsGroupLessons`, default sì).
 * Le assenze contano (la guida era prenotata). Restituisce sia il numero sia i
 * minuti, così il limite «a ore» (REG-779, punto 3) userà la stessa funzione.
 *
 * La settimana va da lunedì 00:00 a lunedì 00:00 in UTC, come prima.
 */

/** Durata assunta per le guide senza fine registrata. */
export const DEFAULT_LESSON_MINUTES = 60;

const EXAM_TYPE = "esame";

/** Lunedì 00:00 UTC della settimana di `date`, e il lunedì dopo. */
export function weekBoundsUtc(date: Date): { weekStart: Date; weekEnd: Date } {
  const weekStart = new Date(date);
  const day = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() + (day === 0 ? -6 : 1 - day));
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return { weekStart, weekEnd };
}

/** Impostazione dell'autoscuola (`CompanyService.limits`): assente = sì. */
export function weeklyLimitCountsGroupLessons(limits: Record<string, unknown> | null | undefined): boolean {
  return limits?.weeklyLimitCountsGroupLessons !== false;
}

/** Vero se l'appuntamento (o quello che si sta creando) conta nel limite settimanale. */
export function countsTowardWeeklyLimit(
  appointment: { type?: string | null; groupLessonId?: string | null },
  { includeGroupLessons = true }: { includeGroupLessons?: boolean } = {},
): boolean {
  if ((appointment.type ?? "").trim().toLowerCase() === EXAM_TYPE) return false;
  return includeGroupLessons || !appointment.groupLessonId;
}

type WeeklyLessonsClient = {
  autoscuolaAppointment: {
    findMany: typeof defaultPrisma.autoscuolaAppointment.findMany;
  };
};

/**
 * Guide di guida dell'allievo nella settimana di `at`.
 * `excludeAppointmentId`: la guida che si sta spostando o scambiando.
 */
export async function countStudentWeeklyLessons({
  companyId,
  studentId,
  at,
  excludeAppointmentId,
  includeGroupLessons = true,
  client = defaultPrisma,
}: {
  companyId: string;
  studentId: string;
  at: Date;
  excludeAppointmentId?: string;
  /** Da `weeklyLimitCountsGroupLessons(limits)`. */
  includeGroupLessons?: boolean;
  client?: WeeklyLessonsClient;
}): Promise<{ lessons: number; minutes: number }> {
  const { weekStart, weekEnd } = weekBoundsUtc(at);
  const rows = await client.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId,
      status: { notIn: ["cancelled"] },
      startsAt: { gte: weekStart, lt: weekEnd },
      ...(includeGroupLessons ? {} : { groupLessonId: null }),
      NOT: { type: { equals: EXAM_TYPE, mode: "insensitive" } },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  let minutes = 0;
  for (const row of rows) {
    const span = row.endsAt ? Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000) : 0;
    minutes += span > 0 ? span : DEFAULT_LESSON_MINUTES;
  }
  return { lessons: rows.length, minutes };
}
