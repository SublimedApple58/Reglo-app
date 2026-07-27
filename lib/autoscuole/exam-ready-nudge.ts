import { prisma as defaultPrisma } from "@/db/prisma";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";

type PrismaClientLike = typeof defaultPrisma;

// Soglia: un allievo "pronto" da almeno 2 settimane senza esame in agenda.
const READY_THRESHOLD_DAYS = 14;
// Cadenza SETTIMANALE (lunedì mattina): niente stato di dedup, niente spam.
const NUDGE_HOUR_LOCAL = 9;
const NUDGE_WEEKDAY = 1; // 0 = domenica, 1 = lunedì

export const EXAM_READY_NUDGE_KIND = "exam_ready_nudge";

// Match esatto minuto (il cron gira ogni minuto → un solo tick a settimana
// soddisfa la condizione). Preferito a una finestra ±60s perché evita 2-3 push
// identici; se il tick venisse saltato, il recovery endpoint mostra comunque il
// nudge in-app alla riapertura → nessuna perdita reale.
const isNudgeMinute = (now: Date): boolean =>
  now.getDay() === NUDGE_WEEKDAY &&
  now.getHours() === NUDGE_HOUR_LOCAL &&
  now.getMinutes() === 0;

export type ExamReadyNudgeResult = {
  count: number;
  studentIds: string[];
  earliestReadyAt: Date | null;
};

/**
 * Per una singola autoscuola: allievi in PRATICA segnati "pronti" da oltre
 * READY_THRESHOLD_DAYS giorni che NON hanno un esame futuro (non annullato) in
 * agenda. Condivisa tra il cron (push) e l'endpoint di recovery (ricostruzione
 * in-app), così la logica di conteggio vive in un solo posto.
 */
export const getExamReadyNudgeForCompany = async ({
  prisma = defaultPrisma,
  companyId,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  now?: Date;
}): Promise<ExamReadyNudgeResult> => {
  const cutoff = new Date(now.getTime() - READY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const ready = await prisma.companyMember.findMany({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
      studentPhase: "PRATICA",
      examReady: true,
      examReadyAt: { lte: cutoff, not: null },
    },
    select: { userId: true, examReadyAt: true },
  });

  if (!ready.length) {
    return { count: 0, studentIds: [], earliestReadyAt: null };
  }

  const readyIds = ready.map((m) => m.userId);

  // Chi ha già un esame futuro (non annullato) è escluso dal nudge.
  const withExam = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      studentId: { in: readyIds },
      type: "esame",
      status: { not: "cancelled" },
      startsAt: { gte: now },
    },
    select: { studentId: true },
  });
  const booked = new Set(withExam.map((a) => a.studentId));

  const pending = ready.filter((m) => !booked.has(m.userId));
  if (!pending.length) {
    return { count: 0, studentIds: [], earliestReadyAt: null };
  }

  const earliestReadyAt = pending.reduce<Date | null>((min, m) => {
    if (!m.examReadyAt) return min;
    if (!min || m.examReadyAt.getTime() < min.getTime()) return m.examReadyAt;
    return min;
  }, null);

  return {
    count: pending.length,
    studentIds: pending.map((m) => m.userId),
    earliestReadyAt,
  };
};

/**
 * Cron (agganciato ad autoscuole-reminders, ogni minuto): una volta a settimana
 * (lunedì ~09:00 locale) manda ai TITOLARI un push riepilogativo degli allievi
 * pronti da oltre 2 settimane senza esame in agenda. Fire esatto (lunedì 09:00,
 * un solo tick a settimana) → niente doppioni; il recovery endpoint è la rete
 * di sicurezza in-app se il tick venisse saltato.
 */
export const processExamReadyNudge = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
} = {}) => {
  if (!isNudgeMinute(now)) return;

  const cutoff = new Date(now.getTime() - READY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  // Aziende con almeno un candidato (query leggera) → poi conteggio per azienda.
  const candidates = await prisma.companyMember.findMany({
    where: {
      autoscuolaRole: "STUDENT",
      studentPhase: "PRATICA",
      examReady: true,
      examReadyAt: { lte: cutoff, not: null },
    },
    select: { companyId: true },
    distinct: ["companyId"],
  });

  for (const { companyId } of candidates) {
    const { count } = await getExamReadyNudgeForCompany({ prisma, companyId, now });
    if (count === 0) continue;

    const owners = await prisma.companyMember.findMany({
      where: { companyId, autoscuolaRole: { in: ["OWNER", "INSTRUCTOR_OWNER"] } },
      select: { userId: true },
    });
    if (!owners.length) continue;

    const label = count === 1 ? "1 allievo pronto" : `${count} allievi pronti`;
    try {
      await sendAutoscuolaPushToUsers({
        prisma,
        companyId,
        userIds: owners.map((o) => o.userId),
        title: "Allievi pronti per l'esame",
        body: `${label} da oltre 2 settimane, esame non ancora in agenda. Valuta se prenotarlo.`,
        data: {
          kind: EXAM_READY_NUDGE_KIND,
          count,
          // companyId → id stabile lato mobile: dedup tra push e recovery.
          companyId,
        },
      });
    } catch (error) {
      console.error("[exam-ready-nudge] push failed", error);
    }
  }
};
