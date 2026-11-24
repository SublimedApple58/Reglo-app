"use server";

/**
 * REG-783 — passaggio dei crediti guida da guide a minuti e viceversa.
 *
 * Il titolare sceglie quanto vale una guida (e, verso le guide, cosa fare dei
 * minuti che avanzano), vede l'anteprima saldo per saldo e conferma. Il
 * passaggio è una transazione unica:
 * - blocca la riga delle impostazioni e i saldi dell'autoscuola;
 * - se nel frattempo i saldi sono cambiati, non converte e rimanda l'anteprima
 *   nuova da riconfermare (caso 19);
 * - se un altro titolare ha già cambiato unità, si ferma (caso 21);
 * - converte ogni saldo con due movimenti `unit_conversion` (−prima nell'unità
 *   vecchia, +dopo nella nuova), aggiorna `limits.lessonCreditUnit` e scrive
 *   `AutoscuolaCreditUnitSwitch`.
 * Le guide già pagate in agenda restano pagate: il rimborso segue le regole di
 * `lesson-credit-unit.ts`.
 */
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { AUTOSCUOLE_CACHE_SEGMENTS, invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";
import {
  CREDIT_MINUTES_PER_LESSON_MAX,
  CREDIT_MINUTES_PER_LESSON_MIN,
  convertCreditBalance,
  formatCredits,
  formatRemainder,
  parseLessonCreditUnit,
  type CreditRemainderPolicy,
  type LessonCreditUnit,
} from "@/lib/autoscuole/lesson-credit-unit";
import { isOwner } from "@/lib/autoscuole/roles";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

const switchInputSchema = z.object({
  toUnit: z.enum(["lessons", "minutes"]),
  minutesPerLesson: z.number().int().min(CREDIT_MINUTES_PER_LESSON_MIN).max(CREDIT_MINUTES_PER_LESSON_MAX),
  remainderPolicy: z.enum(["floor", "ceil", "round"]).default("round"),
});

const confirmInputSchema = switchInputSchema.extend({
  /** Impronta dei saldi vista nell'anteprima: se cambia, si riconferma. */
  fingerprint: z.string().min(1),
});

export type CreditUnitSwitchRow = {
  studentId: string;
  name: string;
  before: number;
  after: number;
  beforeLabel: string;
  afterLabel: string;
  remainderLabel: string | null;
};

export type CreditUnitSwitchPreview = {
  fromUnit: LessonCreditUnit;
  toUnit: LessonCreditUnit;
  minutesPerLesson: number;
  remainderPolicy: CreditRemainderPolicy;
  rows: CreditUnitSwitchRow[];
  /** Guide future già pagate a credito: restano pagate. */
  paidFutureLessons: number;
  fingerprint: string;
};

type Tx = Prisma.TransactionClient;

const canSwitch = (membership: { role: string; autoscuolaRole: string | null }) =>
  membership.role === "admin" || isOwner(membership.autoscuolaRole);

async function buildPreview(
  db: Tx | typeof prisma,
  companyId: string,
  input: z.infer<typeof switchInputSchema>,
): Promise<CreditUnitSwitchPreview> {
  const service = await db.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  const fromUnit = parseLessonCreditUnit((service?.limits as Record<string, unknown> | null)?.lessonCreditUnit);
  const [balances, paidFutureLessons] = await Promise.all([
    db.autoscuolaStudentLessonCreditBalance.findMany({
      where: { companyId, availableCredits: { not: 0 } },
      select: {
        id: true,
        studentId: true,
        availableCredits: true,
        student: { select: { name: true } },
      },
      orderBy: { availableCredits: "desc" },
    }),
    db.autoscuolaAppointment.count({
      where: {
        companyId,
        creditApplied: true,
        creditRefundedAt: null,
        startsAt: { gt: new Date() },
        status: { notIn: ["cancelled"] },
      },
    }),
  ]);

  const rows = balances.map((balance) => {
    const converted = convertCreditBalance({
      amount: balance.availableCredits,
      fromUnit,
      toUnit: input.toUnit,
      minutesPerLesson: input.minutesPerLesson,
      remainderPolicy: input.remainderPolicy,
    });
    const name = balance.student.name?.trim() || "Allievo";
    return {
      studentId: balance.studentId,
      name,
      before: balance.availableCredits,
      after: converted.amount,
      beforeLabel: formatCredits(fromUnit, balance.availableCredits),
      afterLabel: formatCredits(input.toUnit, converted.amount),
      remainderLabel: formatRemainder(converted.remainderMinutes),
    };
  });

  const fingerprint = createHash("sha1")
    .update(
      [fromUnit, ...balances.map((b) => `${b.id}:${b.availableCredits}`).sort()].join("|"),
    )
    .digest("hex");

  return {
    fromUnit,
    toUnit: input.toUnit,
    minutesPerLesson: input.minutesPerLesson,
    remainderPolicy: input.remainderPolicy,
    rows,
    paidFutureLessons,
    fingerprint,
  };
}

export async function previewLessonCreditUnitSwitch(input: z.input<typeof switchInputSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canSwitch(membership)) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = switchInputSchema.parse(input);
    const preview = await buildPreview(prisma, membership.companyId, payload);
    if (preview.fromUnit === payload.toUnit) {
      return { success: false as const, message: alreadyMessage(payload.toUnit) };
    }
    return { success: true as const, data: preview };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const alreadyMessage = (unit: LessonCreditUnit) =>
  unit === "minutes" ? "I crediti sono già a tempo." : "I crediti sono già a guide.";

export async function switchLessonCreditUnit(input: z.input<typeof confirmInputSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canSwitch(membership)) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = confirmInputSchema.parse(input);
    const companyId = membership.companyId;

    const outcome = await prisma.$transaction(
      async (tx) => {
        // Blocca impostazioni e saldi: ricariche, prenotazioni e annullamenti
        // arrivati adesso aspettano la fine del passaggio.
        await tx.$queryRaw`SELECT id FROM "CompanyService" WHERE "companyId" = ${companyId}::uuid AND "serviceKey" = 'AUTOSCUOLE' FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "AutoscuolaStudentLessonCreditBalance" WHERE "companyId" = ${companyId}::uuid FOR UPDATE`;

        const preview = await buildPreview(tx, companyId, payload);
        if (preview.fromUnit === payload.toUnit) {
          return { kind: "already" as const };
        }
        if (preview.fingerprint !== payload.fingerprint) {
          return { kind: "changed" as const, preview };
        }

        const balances = await tx.autoscuolaStudentLessonCreditBalance.findMany({
          where: { companyId, availableCredits: { not: 0 } },
          select: { id: true, studentId: true, availableCredits: true },
        });
        for (const balance of balances) {
          const converted = convertCreditBalance({
            amount: balance.availableCredits,
            fromUnit: preview.fromUnit,
            toUnit: payload.toUnit,
            minutesPerLesson: payload.minutesPerLesson,
            remainderPolicy: payload.remainderPolicy,
          });
          await tx.autoscuolaStudentLessonCreditBalance.update({
            where: { id: balance.id },
            data: { availableCredits: converted.amount, unit: payload.toUnit },
          });
          await tx.autoscuolaStudentLessonCreditLedger.createMany({
            data: [
              {
                companyId,
                studentId: balance.studentId,
                balanceId: balance.id,
                delta: -balance.availableCredits,
                unit: preview.fromUnit,
                reason: "unit_conversion",
                actorUserId: membership.userId,
              },
              ...(converted.amount !== 0
                ? [
                    {
                      companyId,
                      studentId: balance.studentId,
                      balanceId: balance.id,
                      delta: converted.amount,
                      unit: payload.toUnit,
                      reason: "unit_conversion",
                      actorUserId: membership.userId,
                    },
                  ]
                : []),
            ],
          });
        }
        // Anche i saldi a zero passano all'unità nuova.
        await tx.autoscuolaStudentLessonCreditBalance.updateMany({
          where: { companyId, unit: { not: payload.toUnit } },
          data: { unit: payload.toUnit },
        });

        const service = await tx.companyService.findFirst({
          where: { companyId, serviceKey: "AUTOSCUOLE" },
          select: { id: true, limits: true },
        });
        if (!service) throw new Error("Servizio autoscuola non trovato.");
        await tx.companyService.update({
          where: { id: service.id },
          data: {
            limits: {
              ...((service.limits ?? {}) as Record<string, unknown>),
              lessonCreditUnit: payload.toUnit,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.autoscuolaCreditUnitSwitch.create({
          data: {
            companyId,
            fromUnit: preview.fromUnit,
            toUnit: payload.toUnit,
            minutesPerLesson: payload.minutesPerLesson,
            remainderPolicy: payload.toUnit === "lessons" ? payload.remainderPolicy : null,
            studentsCount: balances.length,
            actorUserId: membership.userId,
          },
        });
        return { kind: "done" as const, studentsCount: balances.length };
      },
      { timeout: 30_000 },
    );

    if (outcome.kind === "already") {
      return { success: false as const, message: alreadyMessage(payload.toUnit) };
    }
    if (outcome.kind === "changed") {
      return {
        success: false as const,
        code: "PREVIEW_CHANGED" as const,
        message: "Nel frattempo qualche saldo è cambiato: controlla di nuovo e conferma.",
        data: outcome.preview,
      };
    }

    await invalidateAutoscuoleCache({
      companyId,
      segments: [
        AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
        AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS,
        AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS,
      ],
    });

    return {
      success: true as const,
      data: { unit: payload.toUnit, studentsCount: outcome.studentsCount },
      message: payload.toUnit === "minutes" ? "Crediti passati alle ore." : "Crediti passati alle guide.",
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
