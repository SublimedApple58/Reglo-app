#!/usr/bin/env node
// scripts/seed-consorzio-company.mjs
// Crea (idempotente) una company DEMO in modalità CONSORZIO sul DB puntato
// dall'env caricato: titolare per il login web, 2 istruttori, 5 mezzi pesanti,
// 3 autoscuole consorziate, codici contabili, allievi taggati per scuola e
// tariffe orarie. Vedi docs/features/consorzio.md.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
//     node scripts/seed-consorzio-company.mjs

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_NAME = "Consorzio Liguria Demo";
const OWNER_EMAIL = "consorzio@reglo.it";
const OWNER_NAME = "Consorzio Liguria";
const OWNER_PASSWORD = "Reglo2026!";

function hashPassword(plain) {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY mancante nell'env caricato.");
  return crypto.createHmac("sha256", key).update(plain).digest("hex");
}

const CONSORZIO_LIMITS = {
  accountKind: "consorzio",
  vehiclesEnabled: true,
  phasesEnabled: ["PRATICA"],
  consorzioPricing: {
    hourlyByCategory: { C: 70, CE: 85, D: 80, DE: 90, C1: 62, D1: 72, CQC: 55, ADR: 65 },
    lateCancellationCutoffHours: 48,
    lateCancellationPenaltyPct: 100,
  },
};

// L'agenda mostra solo istruttori con USER collegato + membership INSTRUCTOR
// (vedi listAutoscuolaInstructorsReadOnly): servono account veri.
const INSTRUCTORS = [
  { name: "Angelo Mastro", email: "angelo.mastro@consorzio.demo" },
  { name: "Sergio Ravera", email: "sergio.ravera@consorzio.demo" },
];

const VEHICLES = [
  { name: "Iveco Stralis", licenseCategory: "C", transmission: "manual" },
  { name: "Scania R450 + semirimorchio", licenseCategory: "CE", transmission: "manual" },
  { name: "Mercedes Atego", licenseCategory: "C1", transmission: "manual" },
  { name: "Autobus Setra S415", licenseCategory: "D", transmission: "manual" },
  { name: "Iveco Eurocargo", licenseCategory: "C", transmission: "manual" },
];

const SCHOOLS = [
  {
    name: "Autoscuola Robatto Demo",
    city: "Genova Marassi",
    ownerName: "Giovanni Robatto",
    address: "Via Roma 12, Genova Marassi",
    vatNumber: "01234567890",
    phone: "010 200 4000",
    email: "info@robatto.demo",
  },
  {
    name: "Autoscuola Gruppo Andrea Demo",
    city: "Genova Sampierdarena",
    ownerName: "Andrea Ferrando",
    address: "Via Cantore 8, Genova",
    vatNumber: "01234567891",
    phone: "010 200 4001",
    email: "info@gruppoandrea.demo",
  },
  {
    name: "Autoscuola Montreal Demo",
    city: "Rapallo",
    ownerName: "Luca Parodi",
    address: "Corso Italia 3, Rapallo",
    vatNumber: "01234567892",
    phone: "0185 200 400",
    email: "info@montreal.demo",
  },
];

const ACCOUNTING_CODES = [
  { code: "CDC-GUIDE", description: "Centro di costo guide" },
  { code: "FSE-2026", description: "Finanziamento FSE 2026" },
  { code: "AZ-LOGIST", description: "Convenzione aziendale logistica" },
  { code: "CQC-RINN", description: "Rinnovo CQC" },
  { code: "PRIV", description: "Privati" },
];

// email → { name, licenseCategory, school (index), codes }
const STUDENTS = [
  { email: "marco.piccardo@consorzio.demo", name: "Marco Piccardo", licenseCategory: "CE", school: 0, codes: ["CDC-GUIDE", "FSE-2026"] },
  { email: "yuri.parodi@consorzio.demo", name: "Yuri Parodi", licenseCategory: "C", school: 0, codes: ["FSE-2026", "AZ-LOGIST"] },
  { email: "rachele.costa@consorzio.demo", name: "Rachele Costa", licenseCategory: "C", school: 1, codes: ["CDC-GUIDE"] },
  { email: "fabio.oliva@consorzio.demo", name: "Fabio Oliva", licenseCategory: "C1", school: 1, codes: ["CQC-RINN", "PRIV"] },
  { email: "nadia.zunino@consorzio.demo", name: "Nadia Zunino", licenseCategory: "CQC", school: 2, codes: [] },
  { email: "giulia.gandolfo@consorzio.demo", name: "Giulia Gandolfo", licenseCategory: "DE", school: 2, codes: [] },
];

async function main() {
  // 1) Company
  let company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) {
    company = await prisma.company.create({ data: { name: COMPANY_NAME } });
    console.log(`✓ Company creata: ${company.name} (${company.id})`);
  } else {
    console.log(`• Company esistente: ${company.name} (${company.id})`);
  }

  // 2) Owner user + membership OWNER
  let owner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        email: OWNER_EMAIL,
        name: OWNER_NAME,
        password: hashPassword(OWNER_PASSWORD),
        role: "admin",
        activeCompanyId: company.id,
      },
    });
    console.log(`✓ Titolare creato: ${owner.email}`);
  } else {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: { password: hashPassword(OWNER_PASSWORD), activeCompanyId: company.id, role: "admin" },
    });
    console.log(`• Titolare esistente aggiornato: ${owner.email}`);
  }
  await prisma.companyMember.upsert({
    where: { companyId_userId: { companyId: company.id, userId: owner.id } },
    create: { companyId: company.id, userId: owner.id, role: "admin", autoscuolaRole: "OWNER" },
    update: { role: "admin", autoscuolaRole: "OWNER" },
  });

  // 3) CompanyService AUTOSCUOLE ACTIVE in modalità consorzio
  const existingService = await prisma.companyService.findFirst({
    where: { companyId: company.id, serviceKey: "AUTOSCUOLE" },
  });
  if (!existingService) {
    await prisma.companyService.create({
      data: { companyId: company.id, serviceKey: "AUTOSCUOLE", status: "ACTIVE", limits: CONSORZIO_LIMITS },
    });
    console.log("✓ CompanyService AUTOSCUOLE ACTIVE (consorzio) creato");
  } else {
    await prisma.companyService.update({
      where: { id: existingService.id },
      data: { status: "ACTIVE", limits: { ...(existingService.limits ?? {}), ...CONSORZIO_LIMITS } },
    });
    console.log("• CompanyService AUTOSCUOLE aggiornato (consorzio)");
  }

  // 4) Istruttori (user + membership INSTRUCTOR + record AutoscuolaInstructor)
  for (const instructor of INSTRUCTORS) {
    let user = await prisma.user.findFirst({ where: { email: instructor.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: instructor.email,
          name: instructor.name,
          password: hashPassword(OWNER_PASSWORD),
        },
      });
    }
    await prisma.companyMember.upsert({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      create: {
        companyId: company.id,
        userId: user.id,
        role: "member",
        autoscuolaRole: "INSTRUCTOR",
      },
      update: { autoscuolaRole: "INSTRUCTOR" },
    });
    const existing = await prisma.autoscuolaInstructor.findFirst({
      where: { companyId: company.id, name: instructor.name },
    });
    if (!existing) {
      await prisma.autoscuolaInstructor.create({
        data: {
          companyId: company.id,
          userId: user.id,
          name: instructor.name,
          status: "active",
        },
      });
      console.log(`✓ Istruttore creato: ${instructor.name}`);
    } else if (!existing.userId) {
      await prisma.autoscuolaInstructor.update({
        where: { id: existing.id },
        data: { userId: user.id },
      });
      console.log(`✓ Istruttore collegato all'account: ${instructor.name}`);
    }
  }

  // 5) Mezzi pesanti
  for (const vehicle of VEHICLES) {
    const existing = await prisma.autoscuolaVehicle.findFirst({
      where: { companyId: company.id, name: vehicle.name },
    });
    if (!existing) {
      await prisma.autoscuolaVehicle.create({
        data: { companyId: company.id, ...vehicle, status: "active" },
      });
      console.log(`✓ Veicolo creato: ${vehicle.name} (${vehicle.licenseCategory})`);
    }
  }

  // 6) Autoscuole consorziate
  const schoolIds = [];
  for (const school of SCHOOLS) {
    let existing = await prisma.consorzioSchool.findFirst({
      where: { consorzioCompanyId: company.id, name: school.name },
    });
    if (!existing) {
      existing = await prisma.consorzioSchool.create({
        data: {
          consorzioCompanyId: company.id,
          ...school,
          status: "active",
          joinedAt: new Date("2023-01-10T09:00:00Z"),
        },
      });
      console.log(`✓ Autoscuola consorziata creata: ${school.name}`);
    }
    schoolIds.push(existing.id);
  }

  // 7) Codici contabili
  const codeIdByLabel = {};
  for (const { code, description } of ACCOUNTING_CODES) {
    const row = await prisma.consorzioAccountingCode.upsert({
      where: { consorzioCompanyId_code: { consorzioCompanyId: company.id, code } },
      create: { consorzioCompanyId: company.id, code, description },
      update: { description },
    });
    codeIdByLabel[code] = row.id;
  }
  console.log(`✓ Codici contabili: ${ACCOUNTING_CODES.map((c) => c.code).join(", ")}`);

  // 8) Allievi (CompanyMember STUDENT taggati con la scuola + codici default)
  for (const student of STUDENTS) {
    let user = await prisma.user.findFirst({ where: { email: student.email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: student.email, name: student.name, password: hashPassword(OWNER_PASSWORD) },
      });
    }
    await prisma.companyMember.upsert({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      create: {
        companyId: company.id,
        userId: user.id,
        role: "member",
        autoscuolaRole: "STUDENT",
        studentPhase: "PRATICA",
        licenseCategory: student.licenseCategory,
        transmission: "manual",
        consorzioSchoolId: schoolIds[student.school],
      },
      update: {
        licenseCategory: student.licenseCategory,
        consorzioSchoolId: schoolIds[student.school],
      },
    });
    for (const code of student.codes) {
      await prisma.consorzioMemberAccountingCode.upsert({
        where: {
          codeId_companyId_userId: {
            codeId: codeIdByLabel[code],
            companyId: company.id,
            userId: user.id,
          },
        },
        create: { codeId: codeIdByLabel[code], companyId: company.id, userId: user.id },
        update: {},
      });
    }
  }
  console.log(`✓ Allievi: ${STUDENTS.length} (taggati per scuola, con codici default)`);

  // 9) Richiesta guida PENDING + notifica in campanella (demo del flusso
  //    ricevente: il sender vero arriva con la fase affiliate).
  const pendingRequest = await prisma.consorzioGuideRequest.findFirst({
    where: { consorzioCompanyId: company.id, status: "pending" },
  });
  if (!pendingRequest) {
    const rachele = await prisma.user.findFirst({
      where: { email: "rachele.costa@consorzio.demo" },
    });
    const vehicle = await prisma.autoscuolaVehicle.findFirst({
      where: { companyId: company.id, name: "Iveco Stralis" },
    });
    // Prossimo martedì alle 10:00 (ora locale server).
    const starts = new Date();
    starts.setDate(starts.getDate() + ((9 - starts.getDay()) % 7 || 7));
    starts.setHours(10, 0, 0, 0);
    const request = await prisma.consorzioGuideRequest.create({
      data: {
        consorzioCompanyId: company.id,
        schoolId: schoolIds[1],
        studentUserId: rachele.id,
        requestedStartsAt: starts,
        durationMinutes: 90,
        vehicleId: vehicle?.id ?? null,
        status: "pending",
      },
    });
    await prisma.autoscuolaNotification.create({
      data: {
        companyId: company.id,
        kind: "consortium_guide_request",
        studentName: rachele.name,
        startsAt: starts,
        meta: {
          requestId: request.id,
          schoolName: SCHOOLS[1].name,
          vehicleName: vehicle?.name ?? null,
        },
      },
    });
    console.log(`✓ Richiesta guida pending + notifica (${starts.toISOString()})`);
  } else {
    console.log("• Richiesta guida pending già presente");
  }

  // 10) Una guida già fatta nel mese corrente (demo Fatturazione: Yuri, C,
  //     60 min → tariffa C). Idempotente per bookingSource+studente.
  const yuri = await prisma.user.findFirst({
    where: { email: "yuri.parodi@consorzio.demo" },
  });
  const demoLesson = await prisma.autoscuolaAppointment.findFirst({
    where: { companyId: company.id, studentId: yuri.id, type: "guida" },
  });
  if (!demoLesson) {
    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: { companyId: company.id, name: "Angelo Mastro" },
    });
    const stralis = await prisma.autoscuolaVehicle.findFirst({
      where: { companyId: company.id, name: "Iveco Stralis" },
    });
    const starts = new Date();
    starts.setDate(2);
    starts.setHours(10, 0, 0, 0);
    await prisma.autoscuolaAppointment.create({
      data: {
        companyId: company.id,
        studentId: yuri.id,
        type: "guida",
        status: "completed",
        startsAt: starts,
        endsAt: new Date(starts.getTime() + 60 * 60000),
        instructorId: instructor?.id ?? null,
        vehicleId: stralis?.id ?? null,
        bookingSource: "staff_owner",
      },
    });
    console.log("✓ Guida demo (Yuri, C, 60 min) per la Fatturazione");
  } else {
    console.log("• Guida demo già presente");
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
