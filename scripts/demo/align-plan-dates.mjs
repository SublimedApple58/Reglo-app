/**
 * Allinea la data di registrazione del PIANO a quella dell'autoscuola.
 *
 * Perché: i piani sono stati inseriti a mano tutti negli stessi giorni, e la
 * curva "Crescita" dei KPI (MRR cumulato) li faceva comparire tutti lì, come se
 * il fatturato fosse nato in un pomeriggio. `CompanyPlan.createdAt` è il campo
 * che alimenta quel grafico: portarlo alla data di registrazione dell'autoscuola
 * racconta quando il cliente è arrivato davvero.
 *
 * Tocca SOLO `createdAt`. Nessun prezzo, nessun posto, nessuno stato.
 *
 *   DOTENV_CONFIG_PATH=.env.dev node -r dotenv/config scripts/demo/align-plan-dates.mjs
 *   (APPLY=1 per scrivere)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";

const righe = await prisma.$queryRaw`
  SELECT c.name,
         to_char(p."createdAt", 'YYYY-MM-DD') AS piano_oggi,
         to_char(c."createdAt", 'YYYY-MM-DD') AS azienda
  FROM "CompanyPlan" p
  JOIN "Company" c ON c.id = p."companyId"
  WHERE date_trunc('day', p."createdAt") <> date_trunc('day', c."createdAt")
  ORDER BY c."createdAt"`;

console.log(`Piani da allineare: ${righe.length}`);
for (const r of righe) console.log(`  ${r.name}: ${r.piano_oggi} → ${r.azienda}`);

if (!APPLY) {
  console.log("\n(prova a vuoto: nessuna scrittura. APPLY=1 per applicare)");
  await prisma.$disconnect();
  process.exit(0);
}

const n = await prisma.$executeRaw`
  UPDATE "CompanyPlan" p
  SET "createdAt" = c."createdAt"
  FROM "Company" c
  WHERE c.id = p."companyId"
    AND date_trunc('day', p."createdAt") <> date_trunc('day', c."createdAt")`;
console.log("righe aggiornate:", n);

const [check] = await prisma.$queryRaw`
  SELECT count(*)::int AS ancora_disallineati
  FROM "CompanyPlan" p JOIN "Company" c ON c.id = p."companyId"
  WHERE date_trunc('day', p."createdAt") <> date_trunc('day', c."createdAt")`;
console.log("ancora disallineati:", check.ancora_disallineati);
await prisma.$disconnect();
