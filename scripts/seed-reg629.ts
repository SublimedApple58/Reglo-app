/**
 * REG-629 — dati di prova realistici per gli ex allievi, SOLO su dev.
 *
 * Nell'autoscuola attiva del titolare di prova (titolare@reglo.it) crea cinque
 * allievi con guide vere (pagate, da pagare, una penale):
 *
 * - Giulia Ferrari, Marco Bianchi: allievi NORMALI. L'e2e li fa uscire con il
 *   flusso vero (cancellazione dall'app / rimozione dalla Directory).
 * - Luca Esposito, Sara Conti, Davide Greco: usciti PRIMA di REG-629, col
 *   vecchio flusso (nome sovrascritto, legame tolto, nessuna riga ex allievo).
 *   Li recupera `scripts/reg-629-recover-former-students.ts`. Solo il nome di
 *   Luca sopravvive (in una notifica all'ufficio), come nei casi di prod.
 *
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/seed-reg629.ts            # crea (prima ripulisce)
 *   ... scripts/seed-reg629.ts --cleanup        # toglie tutto
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cleanupOnly = process.argv.includes("--cleanup");
const EMAIL = (slug: string) => `reg629.${slug}@e2e.reglo.test`;
const SLUGS = ["giulia", "marco", "luca", "sara", "davide"] as const;

type Lesson = {
  day: string; // YYYY-MM-DD
  hour: number;
  status: "completed" | "cancelled";
  price: number;
  paid?: boolean;
  penalty?: number;
};

const STUDENTS: Record<
  (typeof SLUGS)[number],
  { name: string; legacy?: "self_delete" | "directory_removal" | "none"; lessons: Lesson[]; leftAt?: string }
> = {
  giulia: {
    name: "Giulia Ferrari",
    lessons: [
      { day: "2026-09-08", hour: 9, status: "completed", price: 45, paid: true },
      { day: "2026-09-15", hour: 9, status: "completed", price: 45, paid: true },
      { day: "2026-09-29", hour: 10, status: "completed", price: 45 },
      { day: "2026-10-06", hour: 10, status: "completed", price: 45 },
      { day: "2026-10-13", hour: 11, status: "cancelled", price: 45, penalty: 30 },
    ],
  },
  marco: {
    name: "Marco Bianchi",
    lessons: [
      { day: "2026-09-10", hour: 15, status: "completed", price: 45, paid: true },
      { day: "2026-09-17", hour: 15, status: "completed", price: 45, paid: true },
    ],
  },
  luca: {
    name: "Luca Esposito",
    legacy: "self_delete",
    leftAt: "2026-10-03T18:20:00Z",
    lessons: [
      { day: "2026-09-02", hour: 8, status: "completed", price: 45, paid: true },
      { day: "2026-09-09", hour: 8, status: "completed", price: 45 },
      { day: "2026-09-16", hour: 8, status: "completed", price: 45 },
      { day: "2026-09-23", hour: 8, status: "completed", price: 45 },
    ],
  },
  sara: {
    name: "Sara Conti",
    legacy: "directory_removal",
    leftAt: "2026-09-26T10:05:00Z",
    lessons: [
      { day: "2026-08-27", hour: 17, status: "completed", price: 0, paid: true },
      { day: "2026-09-03", hour: 17, status: "completed", price: 0 },
      { day: "2026-09-10", hour: 17, status: "completed", price: 0 },
    ],
  },
  davide: {
    name: "Davide Greco",
    legacy: "none",
    leftAt: "2026-07-14T09:00:00Z",
    lessons: [
      { day: "2026-06-30", hour: 12, status: "completed", price: 45, paid: true },
      { day: "2026-07-07", hour: 12, status: "completed", price: 45, paid: true },
    ],
  },
};

async function cleanup(companyId: string) {
  const users = await prisma.user.findMany({
    where: { email: { in: SLUGS.map(EMAIL) } },
    select: { id: true },
  });
  // Gli utenti già anonimizzati non hanno più l'email: li ritrovo dalle guide di prova.
  const tagged = await prisma.autoscuolaAppointment.findMany({
    where: { companyId, notes: "REG629_SEED", studentId: { not: null } },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  const ids = [...new Set([...users.map((u) => u.id), ...tagged.map((t) => t.studentId as string)])];
  if (!ids.length) return 0;
  await prisma.autoscuolaNotification.deleteMany({ where: { companyId, studentId: { in: ids } } });
  await prisma.autoscuolaAppointment.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.autoscuolaFormerStudent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.autoscuolaLicensePath.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.accountDeletionAudit.deleteMany({ where: { deletedUserId: { in: ids } } });
  await prisma.companyMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mobileAccessToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function main() {
  if (!/\.env\.dev$/.test(process.env.DOTENV_CONFIG_PATH ?? "")) {
    throw new Error("seed-reg629 gira solo su dev (DOTENV_CONFIG_PATH=.env.dev).");
  }
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "titolare@reglo.it" },
    select: { id: true, password: true, activeCompanyId: true },
  });
  const companyId = owner.activeCompanyId;
  if (!companyId) throw new Error("Il titolare di prova non ha un'autoscuola attiva.");

  const removed = await cleanup(companyId);
  console.log(`→ ripuliti ${removed} utenti di prova`);
  if (cleanupOnly) return;

  const instructor = await prisma.autoscuolaInstructor.findFirstOrThrow({
    where: { companyId, name: "Istruttore E2E" },
    select: { id: true },
  });
  const vehicle = await prisma.autoscuolaVehicle.findFirst({
    where: { companyId, name: "Fiat Panda (auto E2E)" },
    select: { id: true },
  });

  for (const slug of SLUGS) {
    const spec = STUDENTS[slug];
    const user = await prisma.user.create({
      data: {
        email: EMAIL(slug),
        name: spec.name,
        password: owner.password,
        phone: "+39 333 000 0000",
        role: "user",
        activeCompanyId: companyId,
      },
    });
    await prisma.companyMember.create({
      data: {
        companyId,
        userId: user.id,
        role: "member",
        autoscuolaRole: "STUDENT",
        studentPhase: "PRATICA",
        licenseCategory: "B",
        transmission: slug === "sara" ? "automatic" : "manual",
        createdAt: new Date(`${spec.lessons[0].day}T08:00:00Z`),
      },
    });
    await prisma.autoscuolaLicensePath.create({
      data: {
        companyId,
        studentId: user.id,
        licenseCategory: "B",
        transmission: slug === "sara" ? "automatic" : "manual",
        startedAt: new Date(`${spec.lessons[0].day}T08:00:00Z`),
      },
    });
    for (const l of spec.lessons) {
      const startsAt = new Date(`${l.day}T${String(l.hour - 2).padStart(2, "0")}:00:00Z`);
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
      await prisma.autoscuolaAppointment.create({
        data: {
          companyId,
          studentId: user.id,
          type: "guida",
          types: ["urbano"],
          status: l.status,
          startsAt,
          endsAt,
          instructorId: instructor.id,
          vehicleId: vehicle?.id ?? null,
          priceAmount: l.price,
          penaltyAmount: l.penalty ?? 0,
          manualPaymentStatus: l.paid ? "paid" : l.penalty || l.status === "completed" ? "unpaid" : null,
          lateCancellationAction: l.penalty ? "charged" : null,
          cancellationKind: l.status === "cancelled" ? "manual_cancel" : null,
          cancelledAt: l.status === "cancelled" ? new Date(startsAt.getTime() - 5 * 3600_000) : null,
          notes: "REG629_SEED",
          createdAt: new Date(startsAt.getTime() - 3 * 86_400_000),
        },
      });
    }
    if (slug === "luca") {
      // L'unica traccia del nome che il vecchio flusso lascia: la notifica all'ufficio.
      await prisma.autoscuolaNotification.create({
        data: {
          companyId,
          kind: "student_cancellation",
          studentId: user.id,
          studentName: spec.name,
          startsAt: new Date("2026-09-30T08:00:00Z"),
          readAt: new Date(),
          createdAt: new Date("2026-09-29T19:00:00Z"),
        },
      });
    }
    if (spec.legacy) {
      // Il vecchio `deleteAndAnonymizeUserAccount`, prima di REG-629.
      const leftAt = new Date(spec.leftAt!);
      await prisma.companyMember.deleteMany({ where: { userId: user.id } });
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: "Account eliminato",
          email: `deleted+${user.id}@deleted.reglo.local`,
          password: null,
          phone: null,
          activeCompanyId: null,
          role: "deleted",
          updatedAt: leftAt,
        },
      });
      if (spec.legacy !== "none") {
        await prisma.accountDeletionAudit.create({
          data: {
            deletedUserId: user.id,
            trigger: spec.legacy,
            actorUserId: spec.legacy === "directory_removal" ? owner.id : user.id,
            companyId: spec.legacy === "directory_removal" ? companyId : null,
            createdAt: leftAt,
          },
        });
      }
    }
    console.log(`  ${spec.name.padEnd(16)} ${spec.legacy ? `uscito (vecchio flusso: ${spec.legacy})` : "allievo attivo"}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
