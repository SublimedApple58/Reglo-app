/**
 * REG-797: finestra di malattia e ferie di un istruttore (instructor-sick-leave,
 * instructor-vacation). Le date arrivano come orologio italiano ("dal 3 al 5,
 * dalle 14 del primo giorno"); qui diventano istanti con l'offset di Roma di
 * QUELLA data, ora legale compresa. Prima l'offset era fisso a +2, quindi
 * d'inverno (+1) inizio e fine slittavano di un'ora.
 */

import { romeWallClockToInstant } from "@/lib/backoffice/agenda-saturation";

export type LeavePeriod = {
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm, solo per il primo giorno
  endDate: string; // YYYY-MM-DD
};

/** "YYYY-MM-DD" + "HH:mm" ora di Roma → istante UTC. */
export function romeDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(romeWallClockToInstant(y, m, d, h * 60 + min));
}

/**
 * Inizio e fine del periodo, più un blocco a giornata piena (00:00–23:59 di
 * Roma) per ogni giorno; il primo parte da `startTime` se c'è.
 */
export function buildLeaveWindow(period: LeavePeriod) {
  const start = romeDateTimeToUtc(period.startDate, period.startTime ?? "00:00");
  const end = romeDateTimeToUtc(period.endDate, "23:59");

  const [sy, sm, sd] = period.startDate.split("-").map(Number);
  const [ey, em, ed] = period.endDate.split("-").map(Number);
  const blocks: { startsAt: Date; endsAt: Date }[] = [];
  for (
    let d = new Date(Date.UTC(sy, sm - 1, sd));
    d.getTime() <= Date.UTC(ey, em - 1, ed);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dateStr = d.toISOString().slice(0, 10);
    const isFirstDay = dateStr === period.startDate;
    blocks.push({
      startsAt: romeDateTimeToUtc(dateStr, isFirstDay && period.startTime ? period.startTime : "00:00"),
      endsAt: romeDateTimeToUtc(dateStr, "23:59"),
    });
  }

  return { start, end, blocks };
}
