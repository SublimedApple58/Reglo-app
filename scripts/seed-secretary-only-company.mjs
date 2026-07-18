#!/usr/bin/env node
// scripts/seed-secretary-only-company.mjs
// Crea (idempotente) una company DEMO in modalità "solo Segretaria" sul DB
// puntato dall'env caricato, con un utente titolare per il login web.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
//     node scripts/seed-secretary-only-company.mjs
//
// Password hashing: HMAC-SHA256(key=ENCRYPTION_KEY, msg=password) hex,
// identico a lib/encrypt.ts (Web Crypto HMAC sign).

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_NAME = "Autoscuola Segreteria Demo";
const OWNER_EMAIL = "segreteria@reglo.it";
const OWNER_NAME = "Segreteria Demo";
const OWNER_PASSWORD = "Reglo2026!";

function hashPassword(plain) {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY mancante nell'env caricato.");
  return crypto.createHmac("sha256", key).update(plain).digest("hex");
}

const SECRETARY_ONLY_LIMITS = {
  secretaryOnly: true,
  voiceFeatureEnabled: true,
  voiceAssistantEnabled: false,
  voiceLanguage: "it-IT",
  phasesEnabled: ["PRATICA"],
};

async function main() {
  // 1) Company
  let company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) {
    company = await prisma.company.create({ data: { name: COMPANY_NAME } });
    console.log(`✓ Company creata: ${company.name} (${company.id})`);
  } else {
    console.log(`• Company esistente: ${company.name} (${company.id})`);
  }

  // 2) Owner user
  let user = await prisma.user.findFirst({ where: { email: OWNER_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: OWNER_EMAIL,
        name: OWNER_NAME,
        password: hashPassword(OWNER_PASSWORD),
        role: "admin",
        activeCompanyId: company.id,
      },
    });
    console.log(`✓ Utente creato: ${user.email} (${user.id})`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashPassword(OWNER_PASSWORD),
        activeCompanyId: company.id,
        role: "admin",
      },
    });
    console.log(`• Utente esistente aggiornato: ${user.email} (${user.id})`);
  }

  // 3) Membership OWNER (admin)
  const existingMember = await prisma.companyMember.findFirst({
    where: { companyId: company.id, userId: user.id },
  });
  if (!existingMember) {
    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: "admin",
        autoscuolaRole: "OWNER",
      },
    });
    console.log("✓ Membership OWNER/admin creata");
  } else {
    await prisma.companyMember.update({
      where: {
        companyId_userId: { companyId: company.id, userId: user.id },
      },
      data: { role: "admin", autoscuolaRole: "OWNER" },
    });
    console.log("• Membership OWNER/admin aggiornata");
  }

  // 4) CompanyService AUTOSCUOLE ACTIVE + limits solo-segreteria
  const existingService = await prisma.companyService.findFirst({
    where: { companyId: company.id, serviceKey: "AUTOSCUOLE" },
  });
  if (!existingService) {
    await prisma.companyService.create({
      data: {
        companyId: company.id,
        serviceKey: "AUTOSCUOLE",
        status: "ACTIVE",
        limits: SECRETARY_ONLY_LIMITS,
      },
    });
    console.log("✓ CompanyService AUTOSCUOLE ACTIVE (solo Segretaria) creato");
  } else {
    await prisma.companyService.update({
      where: { id: existingService.id },
      data: {
        status: "ACTIVE",
        limits: { ...(existingService.limits ?? {}), ...SECRETARY_ONLY_LIMITS },
      },
    });
    console.log("• CompanyService AUTOSCUOLE aggiornato (solo Segretaria)");
  }

  console.log("\n─────────────────────────────────────────────");
  console.log("Company:", COMPANY_NAME, `(${company.id})`);
  console.log("Login web →  email:", OWNER_EMAIL, " password:", OWNER_PASSWORD);
  console.log("─────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
