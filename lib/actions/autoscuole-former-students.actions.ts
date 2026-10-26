"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";
import { getAutoscuolaPaymentConfig } from "@/lib/autoscuole/payments";
import {
  isCompanyManualMode,
  isLessonUnpaid,
  NOT_CLEANED_UP_WHERE,
} from "@/lib/autoscuole/lesson-unpaid";
import {
  asFormerStudentReason,
  FORMER_STUDENT_NAME_MAX_LENGTH,
  type FormerStudentReason,
} from "@/lib/autoscuole/former-students";

// ─────────────────────────────────────────────────────────────────────────────
// REG-629: ex allievi. Li vede solo l'ufficio (titolare e segreteria): servono a
// recuperare quanto dovuto da chi ha lasciato l'autoscuola. Contatti e login non
// esistono più; restano nome, storico guide e saldo.
// ─────────────────────────────────────────────────────────────────────────────

export type FormerStudentRow = {
  userId: string;
  name: string | null;
  reason: FormerStudentReason;
  leftAt: string;
  joinedAt: string | null;
  licenseCategory: string | null;
  transmission: string | null;
  lessonsCount: number;
  lastLessonAt: string | null;
  unpaidCount: number;
  /** Euro ancora da incassare (prezzo guida o penale). 0 = prezzo non noto. */
  unpaidAmount: number;
};

export type FormerStudentLesson = {
  id: string;
  startsAt: string;
  endsAt: string;
  type: string;
  types: string[];
  status: string;
  instructorName: string | null;
  vehicleName: string | null;
  manualPaymentStatus: string | null;
  paymentRequired: boolean;
  creditApplied: boolean;
  lateCancellationAction: string | null;
  isGroup: boolean;
  amount: number;
  unpaid: boolean;
};

export type FormerStudentDetail = FormerStudentRow & {
  manualMode: boolean;
  completedCount: number;
  drivenMinutes: number;
  lessons: FormerStudentLesson[];
};

type OfficeContext = { companyId: string; userId: string };

async function requireOffice(): Promise<OfficeContext | null> {
  const { membership } = await requireServiceAccess("AUTOSCUOLE");
  if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) return null;
  return { companyId: membership.companyId, userId: membership.userId };
}

const LESSON_SELECT = {
  id: true,
  studentId: true,
  startsAt: true,
  endsAt: true,
  type: true,
  types: true,
  status: true,
  manualPaymentStatus: true,
  paymentRequired: true,
  creditApplied: true,
  lateCancellationAction: true,
  cancellationKind: true,
  priceAmount: true,
  penaltyAmount: true,
  groupLessonId: true,
} as const;

type LessonRecord = {
  status: string;
  manualPaymentStatus: string | null;
  creditApplied: boolean;
  lateCancellationAction: string | null;
  cancellationKind: string | null;
  priceAmount: unknown;
  penaltyAmount: unknown;
};

/** Quanto vale la guida da incassare: la penale se è un annullamento addebitato. */
const lessonAmount = (l: LessonRecord) => {
  const penalty = ["cancelled", "no_show"].includes(l.status) && l.lateCancellationAction === "charged";
  return Number(penalty ? l.penaltyAmount : l.priceAmount) || 0;
};

// Le guide tolte dallo storico dal titolare non contano, come nella scheda allievo.
const notCleanedUp = NOT_CLEANED_UP_WHERE;

function summarize(lessons: Array<LessonRecord & { startsAt: Date }>, manualMode: boolean) {
  let unpaidCount = 0;
  let unpaidAmount = 0;
  let lastLessonAt: Date | null = null;
  for (const l of lessons) {
    if (isLessonUnpaid(l, manualMode)) {
      unpaidCount += 1;
      unpaidAmount += lessonAmount(l);
    }
    if (!lastLessonAt || l.startsAt > lastLessonAt) lastLessonAt = l.startsAt;
  }
  return { unpaidCount, unpaidAmount: Math.round(unpaidAmount * 100) / 100, lastLessonAt };
}

/** Lista «Ex allievi» della pagina Allievi, i più recenti in cima. */
export async function getAutoscuolaFormerStudents() {
  try {
    const office = await requireOffice();
    if (!office) return { success: true as const, data: [] as FormerStudentRow[] };
    const { companyId } = office;

    const formers = await prisma.autoscuolaFormerStudent.findMany({
      where: { companyId },
      orderBy: { leftAt: "desc" },
      take: 1000,
    });
    if (!formers.length) return { success: true as const, data: [] as FormerStudentRow[] };

    const userIds = formers.map((f) => f.userId);
    const [rejoined, lessons, config] = await Promise.all([
      // Chi è rientrato (stesso account, di nuovo iscritto) è un allievo, non un ex.
      prisma.companyMember.findMany({
        where: { companyId, userId: { in: userIds } },
        select: { userId: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: { companyId, studentId: { in: userIds }, ...notCleanedUp },
        select: LESSON_SELECT,
        take: 20000,
      }),
      getAutoscuolaPaymentConfig({ companyId }),
    ]);
    const manualMode = isCompanyManualMode(config);
    const rejoinedSet = new Set(rejoined.map((m) => m.userId));
    const lessonsByStudent = new Map<string, typeof lessons>();
    for (const l of lessons) {
      if (!l.studentId) continue;
      const list = lessonsByStudent.get(l.studentId) ?? [];
      list.push(l);
      lessonsByStudent.set(l.studentId, list);
    }

    const data: FormerStudentRow[] = formers
      .filter((f) => !rejoinedSet.has(f.userId))
      .map((f) => {
        const own = lessonsByStudent.get(f.userId) ?? [];
        const { unpaidCount, unpaidAmount, lastLessonAt } = summarize(own, manualMode);
        return {
          userId: f.userId,
          name: f.name,
          reason: asFormerStudentReason(f.reason),
          leftAt: f.leftAt.toISOString(),
          joinedAt: f.joinedAt ? f.joinedAt.toISOString() : null,
          licenseCategory: f.licenseCategory,
          transmission: f.transmission,
          lessonsCount: own.length,
          lastLessonAt: lastLessonAt ? lastLessonAt.toISOString() : null,
          unpaidCount,
          unpaidAmount,
        };
      });
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Scheda ex allievo: anagrafica rimasta, storico guide e saldo. */
export async function getAutoscuolaFormerStudentDetail(userId: string) {
  try {
    const office = await requireOffice();
    if (!office) return { success: false as const, message: "La scheda ex allievo la vede solo l'ufficio." };
    const id = z.string().uuid().parse(userId);
    const { companyId } = office;

    const former = await prisma.autoscuolaFormerStudent.findUnique({
      where: { companyId_userId: { companyId, userId: id } },
    });
    if (!former) return { success: false as const, message: "Ex allievo non trovato." };

    const [lessons, config] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: { companyId, studentId: id, ...notCleanedUp },
        select: {
          ...LESSON_SELECT,
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
        },
        orderBy: { startsAt: "desc" },
        take: 2000,
      }),
      getAutoscuolaPaymentConfig({ companyId }),
    ]);
    const manualMode = isCompanyManualMode(config);
    const { unpaidCount, unpaidAmount, lastLessonAt } = summarize(lessons, manualMode);

    let completedCount = 0;
    let drivenMinutes = 0;
    for (const l of lessons) {
      if (["completed", "checked_in"].includes(l.status) && l.type !== "esame") {
        completedCount += 1;
        if (l.endsAt) drivenMinutes += Math.round((l.endsAt.getTime() - l.startsAt.getTime()) / 60000);
      }
    }

    const detail: FormerStudentDetail = {
      userId: former.userId,
      name: former.name,
      reason: asFormerStudentReason(former.reason),
      leftAt: former.leftAt.toISOString(),
      joinedAt: former.joinedAt ? former.joinedAt.toISOString() : null,
      licenseCategory: former.licenseCategory,
      transmission: former.transmission,
      lessonsCount: lessons.length,
      lastLessonAt: lastLessonAt ? lastLessonAt.toISOString() : null,
      unpaidCount,
      unpaidAmount,
      manualMode,
      completedCount,
      drivenMinutes,
      lessons: lessons.map((l) => ({
        id: l.id,
        startsAt: l.startsAt.toISOString(),
        endsAt: (l.endsAt ?? l.startsAt).toISOString(),
        type: l.type,
        types: l.types ?? [],
        status: l.status,
        instructorName: l.instructor?.name ?? null,
        vehicleName: l.vehicle?.name ?? null,
        manualPaymentStatus: l.manualPaymentStatus,
        paymentRequired: l.paymentRequired,
        creditApplied: l.creditApplied,
        lateCancellationAction: l.lateCancellationAction,
        isGroup: l.groupLessonId != null,
        amount: lessonAmount(l),
        unpaid: isLessonUnpaid(l, manualMode),
      })),
    };
    return { success: true as const, data: detail };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const assignNameSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(2, "Scrivi nome e cognome.").max(FORMER_STUDENT_NAME_MAX_LENGTH),
});

/**
 * «Assegna nome»: per gli ex allievi usciti prima di REG-629 il nome è andato
 * perso con l'anonimizzazione. L'ufficio lo riscrive a mano; resta solo su
 * questa riga, l'account rimane «Account eliminato».
 */
export async function assignFormerStudentName(input: z.infer<typeof assignNameSchema>) {
  try {
    const office = await requireOffice();
    if (!office) return { success: false as const, message: "Il nome lo assegna solo l'ufficio." };
    const payload = assignNameSchema.parse(input);
    const name = payload.name.replace(/\s+/g, " ");
    const updated = await prisma.autoscuolaFormerStudent.updateMany({
      where: { companyId: office.companyId, userId: payload.userId },
      data: { name, nameAssignedBy: office.userId },
    });
    if (!updated.count) return { success: false as const, message: "Ex allievo non trovato." };
    return { success: true as const, data: { name } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
