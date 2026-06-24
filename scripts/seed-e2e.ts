/**
 * Idempotent seed for the E2E test driving school ("Reglo E2E").
 *
 * Creates a self-contained autoscuola used by the Playwright vehicle specs:
 *  - a company with the AUTOSCUOLE service active (vehicles module on, follow-car
 *    rule enabled for category A),
 *  - three users on the @reglo.it domain sharing one password (owner, instructor,
 *    student),
 *  - an instructor record + a couple of vehicles (a moto cat. A + a car cat. B).
 *
 * SAFE: targets ONLY the DEV database (run with DOTENV_CONFIG_PATH=.env.dev) and
 * is fully idempotent (find-or-create), so re-running never duplicates rows.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-e2e.ts
 */
import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mirrors lib/encrypt.ts `hash`: HMAC-SHA256(password) keyed by ENCRYPTION_KEY,
// hex-encoded. Must match exactly so the credentials login `compare` succeeds.
const hashPassword = (plain: string): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY mancante (carica .env.dev).');
  return crypto.createHmac('sha256', key).update(plain).digest('hex');
};

const COMPANY_NAME = 'Reglo E2E';
const PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'RegloTest2026!';

const USERS = [
  { email: 'titolare@reglo.it', name: 'Titolare E2E', autoscuolaRole: 'OWNER' as const, memberRole: 'admin' },
  { email: 'istruttore@reglo.it', name: 'Istruttore E2E', autoscuolaRole: 'INSTRUCTOR' as const, memberRole: 'member' },
  { email: 'allievo@reglo.it', name: 'Allievo E2E', autoscuolaRole: 'STUDENT' as const, memberRole: 'member' },
];

async function findOrCreateUser(email: string, name: string, passwordHash: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { name, password: passwordHash },
    });
  }
  return prisma.user.create({
    data: { email, name, password: passwordHash, role: 'user' },
  });
}

async function main() {
  const passwordHash = hashPassword(PASSWORD);

  // 1. Company
  let company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) {
    company = await prisma.company.create({ data: { name: COMPANY_NAME } });
  }

  // 2. AUTOSCUOLE service (vehicles on, follow-car rule for A)
  const limits = {
    vehiclesEnabled: true,
    followCarRules: { A: { enabled: true } },
    phasesEnabled: ['PRATICA'],
    defaultLicenseCategory: 'B',
    defaultTransmission: 'manual',
  };
  const service = await prisma.companyService.findFirst({
    where: { companyId: company.id, serviceKey: 'AUTOSCUOLE' },
  });
  if (service) {
    await prisma.companyService.update({
      where: { id: service.id },
      data: { status: 'ACTIVE', limits },
    });
  } else {
    await prisma.companyService.create({
      data: { companyId: company.id, serviceKey: 'AUTOSCUOLE', status: 'ACTIVE', limits },
    });
  }

  // 3. Users + memberships
  const userIds: Record<string, string> = {};
  for (const u of USERS) {
    const user = await findOrCreateUser(u.email, u.name, passwordHash);
    userIds[u.autoscuolaRole] = user.id;

    // Land them in this company on login.
    await prisma.user.update({
      where: { id: user.id },
      data: { activeCompanyId: company.id },
    });

    const member = await prisma.companyMember.findFirst({
      where: { companyId: company.id, userId: user.id },
    });
    const memberData = {
      role: u.memberRole,
      autoscuolaRole: u.autoscuolaRole,
      ...(u.autoscuolaRole === 'STUDENT'
        ? { licenseCategory: 'B', transmission: 'manual' }
        : {}),
    };
    if (member) {
      await prisma.companyMember.update({
        where: { companyId_userId: { companyId: company.id, userId: user.id } },
        data: memberData,
      });
    } else {
      await prisma.companyMember.create({
        data: { companyId: company.id, userId: user.id, ...memberData },
      });
    }
  }

  // 4. Instructor record (linked to the instructor user)
  let instructor = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId: company.id, userId: userIds['INSTRUCTOR'] },
  });
  if (!instructor) {
    instructor = await prisma.autoscuolaInstructor.create({
      data: {
        companyId: company.id,
        userId: userIds['INSTRUCTOR'],
        name: 'Istruttore E2E',
        status: 'active',
      },
    });
  }

  // 5. Vehicles — a moto (cat A) + a car (cat B, follow-car candidate). Both
  //    "open" (no exclusive owner) so the mode-switch spec starts from "Aperto".
  const vehicles = [
    { name: 'Yamaha MT (moto E2E)', plate: 'E2E-MOTO', licenseCategory: 'A', transmission: 'manual' },
    { name: 'Fiat Panda (auto E2E)', plate: 'E2E-AUTO', licenseCategory: 'B', transmission: 'manual' },
  ];
  for (const v of vehicles) {
    const existing = await prisma.autoscuolaVehicle.findFirst({
      where: { companyId: company.id, name: v.name },
    });
    if (!existing) {
      await prisma.autoscuolaVehicle.create({
        data: { companyId: company.id, status: 'active', ...v },
      });
    }
  }

  console.log('✓ Seed E2E completato');
  console.log(`  Company: ${company.name} (${company.id})`);
  console.log(`  Utenti:  ${USERS.map((u) => u.email).join(', ')}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Istruttore: ${instructor.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
