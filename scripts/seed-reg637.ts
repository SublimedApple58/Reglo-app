/**
 * REG-637 — dati di prova per lo storico pagamento delle guide, SOLO su dev.
 *
 * Nell'autoscuola attiva del titolare di prova (titolare@reglo.it) crea
 * un'allieva, Chiara Moretti, con tre guide completate:
 *
 * - 6 ott: da pagare, nessuno storico. L'e2e la segna pagata e poi da pagare.
 * - 13 ott: segnata pagata PRIMA di REG-637 (nessuna riga di storico): deve
 *   restare com'era, solo l'etichetta.
 * - 20 ott: coperta da credito dal titolare (riga nel ledger crediti): lo
 *   storico c'è già, senza nessuna migrazione dei dati.
 *
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/seed-reg637.ts            # crea (prima ripulisce)
 *   ... scripts/seed-reg637.ts --demo           # + due gesti sul 6 ott (catture)
 *   ... scripts/seed-reg637.ts --cleanup        # toglie tutto
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cleanupOnly = process.argv.includes("--cleanup");
/** Per le catture a schermo: la guida del 6 ott ha già due gesti di storico. */
const demo = process.argv.includes("--demo");
const EMAIL = "reg637.chiara@e2e.reglo.test";
const TAG = "REG637_SEED";

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) return 0;
  // Storico eventi e ledger cadono in cascata con guide e saldo.
  await prisma.autoscuolaAppointment.deleteMany({ where: { studentId: user.id } });
  await prisma.autoscuolaStudentLessonCreditLedger.deleteMany({ where: { studentId: user.id } });
  await prisma.autoscuolaStudentLessonCreditBalance.deleteMany({ where: { studentId: user.id } });
  await prisma.autoscuolaLicensePath.deleteMany({ where: { studentId: user.id } });
  await prisma.companyMember.deleteMany({ where: { userId: user.id } });
  await prisma.mobileAccessToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  return 1;
}

async function main() {
  if (!/\.env\.dev$/.test(process.env.DOTENV_CONFIG_PATH ?? "")) {
    throw new Error("seed-reg637 gira solo su dev (DOTENV_CONFIG_PATH=.env.dev).");
  }
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "titolare@reglo.it" },
    select: { id: true, password: true, activeCompanyId: true },
  });
  const companyId = owner.activeCompanyId;
  if (!companyId) throw new Error("Il titolare di prova non ha un'autoscuola attiva.");

  const removed = await cleanup();
  console.log(`→ ripuliti ${removed} utenti di prova`);
  if (cleanupOnly) return;

  // Gli account e2e stanno in due autoscuole: qui va bene un istruttore
  // qualsiasi di quella attiva del titolare (è solo il nome sulla guida).
  const instructor = await prisma.autoscuolaInstructor.findFirstOrThrow({
    where: { companyId, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const vehicle = await prisma.autoscuolaVehicle.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Chiara Moretti",
      password: owner.password,
      phone: "+39 333 000 0637",
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
    },
  });
  await prisma.autoscuolaLicensePath.create({
    data: {
      companyId,
      studentId: user.id,
      licenseCategory: "B",
      transmission: "manual",
      startedAt: new Date("2026-09-20T08:00:00Z"),
    },
  });

  const lesson = (day: string, data: Record<string, unknown>) => {
    const startsAt = new Date(`${day}T14:00:00Z`);
    return prisma.autoscuolaAppointment.create({
      data: {
        companyId,
        studentId: user.id,
        type: "guida",
        types: ["urbano"],
        status: "completed",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        instructorId: instructor.id,
        vehicleId: vehicle?.id ?? null,
        priceAmount: 45,
        notes: TAG,
        ...data,
      },
      select: { id: true },
    });
  };

  const oct6 = await lesson("2026-10-06", { manualPaymentStatus: demo ? "paid" : "unpaid" });
  if (demo) {
    await prisma.autoscuolaAppointmentPaymentEvent.createMany({
      data: [
        { companyId, appointmentId: oct6.id, fromStatus: "unpaid", toStatus: "paid", actorUserId: owner.id, createdAt: new Date("2026-10-06T16:05:00Z") },
        { companyId, appointmentId: oct6.id, fromStatus: "paid", toStatus: "unpaid", actorUserId: owner.id, createdAt: new Date("2026-10-08T09:12:00Z") },
        { companyId, appointmentId: oct6.id, fromStatus: "unpaid", toStatus: "paid", actorUserId: owner.id, createdAt: new Date("2026-10-09T17:30:00Z") },
      ],
    });
  }
  await lesson("2026-10-13", { manualPaymentStatus: "paid" });
  const covered = await lesson("2026-10-20", { creditApplied: true, manualPaymentStatus: null });

  const balance = await prisma.autoscuolaStudentLessonCreditBalance.create({
    data: { companyId, studentId: user.id, availableCredits: 0 },
  });
  await prisma.autoscuolaStudentLessonCreditLedger.create({
    data: {
      companyId,
      studentId: user.id,
      balanceId: balance.id,
      appointmentId: covered.id,
      delta: -1,
      reason: "booking_consume",
      actorUserId: owner.id,
      createdAt: new Date("2026-10-20T17:42:00Z"),
    },
  });

  console.log(`→ creata Chiara Moretti (${user.id}) con 3 guide`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
