/**
 * REG-802 — allievi di prova per l'onboarding (primo accesso normale, cellulare,
 * disponibilità), SOLO su dev. Nell'autoscuola attiva del titolare di prova:
 *
 * - `reg802.pratica@e2e.reglo.test` — Sara Conti, creata dall'autoscuola con
 *   email e password, mai entrata in app (`profileCompletedAt` null), senza
 *   cellulare né disponibilità, in fase PRATICA con percorso B aperto →
 *   onboarding completo, disponibilità BLOCCANTE.
 * - `reg802.teoria@e2e.reglo.test` — Luca Ferri, profilo completo e con
 *   cellulare, in TEORIA, senza disponibilità → solo lo step Disponibilità,
 *   RIMANDABILE.
 *
 * Password = quella del titolare di prova.
 *
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/seed-reg802.ts            # crea (prima ripulisce)
 *   ... scripts/seed-reg802.ts --cleanup        # toglie tutto
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cleanupOnly = process.argv.includes("--cleanup");
const PRATICA = "reg802.pratica@e2e.reglo.test";
const TEORIA = "reg802.teoria@e2e.reglo.test";

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: [PRATICA, TEORIA] } }, select: { id: true } });
  for (const user of users) {
    await prisma.autoscuolaWeeklyAvailability.deleteMany({ where: { ownerType: "student", ownerId: user.id } });
    await prisma.companyMember.updateMany({ where: { userId: user.id }, data: { activeLicensePathId: null } });
    await prisma.autoscuolaLicensePath.deleteMany({ where: { studentId: user.id } });
    await prisma.companyMember.deleteMany({ where: { userId: user.id } });
    await prisma.mobileAccessToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  return users.length;
}

async function main() {
  if (!/\.env\.dev$/.test(process.env.DOTENV_CONFIG_PATH ?? "")) {
    throw new Error("seed-reg802 gira solo su dev (DOTENV_CONFIG_PATH=.env.dev).");
  }
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "titolare@reglo.it" },
    select: { password: true, activeCompanyId: true },
  });
  const companyId = owner.activeCompanyId;
  if (!companyId) throw new Error("Il titolare di prova non ha un'autoscuola attiva.");

  console.log(`→ ripuliti ${await cleanup()} utenti di prova`);
  if (cleanupOnly) return;

  const sara = await prisma.user.create({
    data: {
      email: PRATICA,
      name: "sara conti",
      password: owner.password,
      role: "user",
      activeCompanyId: companyId,
    },
  });
  await prisma.companyMember.create({
    data: {
      companyId,
      userId: sara.id,
      role: "member",
      autoscuolaRole: "STUDENT",
      studentPhase: "PRATICA",
      licenseCategory: "B",
      transmission: "manual",
    },
  });
  const path = await prisma.autoscuolaLicensePath.create({
    data: { companyId, studentId: sara.id, licenseCategory: "B", transmission: "manual", status: "active" },
  });
  await prisma.companyMember.update({
    where: { companyId_userId: { companyId, userId: sara.id } },
    data: { activeLicensePathId: path.id },
  });

  const luca = await prisma.user.create({
    data: {
      email: TEORIA,
      name: "Luca Ferri",
      password: owner.password,
      phone: "+393330000802",
      role: "user",
      activeCompanyId: companyId,
      profileCompletedAt: new Date(),
    },
  });
  await prisma.companyMember.create({
    data: {
      companyId,
      userId: luca.id,
      role: "member",
      autoscuolaRole: "STUDENT",
      studentPhase: "TEORIA",
      licenseCategory: "B",
      transmission: "manual",
    },
  });
  console.log(`→ creati ${PRATICA} (PRATICA) e ${TEORIA} (TEORIA) in ${companyId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
