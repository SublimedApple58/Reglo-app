import { prisma as defaultPrisma } from "@/db/prisma";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";

type PrismaClientLike = typeof defaultPrisma;

const TRIGGER_HOUR_LOCAL = 10; // 10:00 local time for countdowns
const NUDGE_HOUR_LOCAL = 18; // 18:00 local time for inactivity nudges
const FIRE_WINDOW_MINUTES = 1; // job runs every minute → ±60s is safe
const COUNTDOWN_OFFSETS = [7, 3, 1] as const;
const INACTIVITY_DAYS = 5;

const startOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

const isWithinFireWindow = (now: Date, hour: number): boolean => {
  const windowMs = FIRE_WINDOW_MINUTES * 60 * 1000;
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  return Math.abs(now.getTime() - target.getTime()) <= windowMs;
};

const formatExamDate = (d: Date): string =>
  d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Sends theory exam countdown reminders (T-7, T-3, T-1) and quiz inactivity
 * nudges to students in TEORIA phase. Designed to be invoked from the
 * autoscuole-reminders cron (every 1 minute). Idempotency relies on the
 * tight ±60s firing window around the configured hour.
 */
export const processAutoscuolaTheoryReminders = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
} = {}) => {
  const inCountdownWindow = isWithinFireWindow(now, TRIGGER_HOUR_LOCAL);
  const inNudgeWindow = isWithinFireWindow(now, NUDGE_HOUR_LOCAL);
  if (!inCountdownWindow && !inNudgeWindow) return;

  const teoriaMembers = await prisma.companyMember.findMany({
    where: {
      autoscuolaRole: "STUDENT",
      studentPhase: "TEORIA",
    },
    select: {
      companyId: true,
      userId: true,
    },
  });

  if (!teoriaMembers.length) return;

  const studentIds = teoriaMembers.map((m) => m.userId);

  if (inCountdownWindow) {
    const today = startOfDay(now);
    for (const offsetDays of COUNTDOWN_OFFSETS) {
      const target = new Date(today);
      target.setDate(target.getDate() + offsetDays);
      const targetEnd = new Date(target);
      targetEnd.setDate(targetEnd.getDate() + 1);

      const cases = await prisma.autoscuolaCase.findMany({
        where: {
          studentId: { in: studentIds },
          theoryExamAt: { gte: target, lt: targetEnd },
        },
        select: {
          companyId: true,
          studentId: true,
          theoryExamAt: true,
        },
      });

      for (const item of cases) {
        const stillTeoria = teoriaMembers.find(
          (m) => m.userId === item.studentId && m.companyId === item.companyId,
        );
        if (!stillTeoria) continue;
        const examLabel = item.theoryExamAt
          ? formatExamDate(item.theoryExamAt)
          : "il giorno indicato";
        const title =
          offsetDays === 1
            ? "Esame teoria domani"
            : `Esame teoria fra ${offsetDays} giorni`;
        const body =
          offsetDays === 1
            ? `Domani è il tuo esame (${examLabel}). Fai un ultimo ripasso degli errori.`
            : `Mancano ${offsetDays} giorni all'esame teoria (${examLabel}). Continua a esercitarti.`;
        try {
          await sendAutoscuolaPushToUsers({
            companyId: item.companyId,
            userIds: [item.studentId],
            title,
            body,
            data: {
              kind: "theory_exam_countdown",
              offsetDays,
              theoryExamAt: item.theoryExamAt?.toISOString() ?? null,
            },
          });
        } catch (error) {
          console.error("[theory-reminders] countdown push failed", error);
        }
      }
    }
  }

  if (inNudgeWindow) {
    const cutoff = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    const recentSessions = await prisma.quizSession.findMany({
      where: {
        studentId: { in: studentIds },
        startedAt: { gte: cutoff },
      },
      select: { studentId: true },
    });
    const activeStudents = new Set(recentSessions.map((s) => s.studentId));

    for (const member of teoriaMembers) {
      if (activeStudents.has(member.userId)) continue;
      try {
        await sendAutoscuolaPushToUsers({
          companyId: member.companyId,
          userIds: [member.userId],
          title: "È ora di riprendere lo studio",
          body: `Non fai un quiz da almeno ${INACTIVITY_DAYS} giorni. Bastano 10 minuti al giorno.`,
          data: {
            kind: "theory_quiz_inactivity",
            inactiveDays: INACTIVITY_DAYS,
          },
        });
      } catch (error) {
        console.error("[theory-reminders] nudge push failed", error);
      }
    }
  }
};
