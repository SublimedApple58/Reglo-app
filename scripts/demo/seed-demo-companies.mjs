/**
 * Tre autoscuole FITTIZIE per la demo del backoffice (settembre 2026).
 *
 * Cosa crea, per ciascuna: una Company, il suo CompanyService AUTOSCUOLE
 * (marcato `seedDemo`) e un CompanyPlan. NIENTE utenti, membri, inviti,
 * appuntamenti o linee vocali: senza indirizzi email e senza righe operative
 * non può partire nessuna mail, nessun webhook e nessuna notifica push.
 *
 * NON portano `excludeFromKpis`: devono contribuire ad ARR e conteggi, è lo
 * scopo della demo.
 *
 *   Uso:  DOTENV_CONFIG_PATH=.env.dev node -r dotenv/config scripts/demo/seed-demo-companies.mjs
 *         (aggiungi APPLY=1 per scrivere davvero; senza, stampa e basta)
 *
 * ─── PER RIPULIRE QUANDO LA DEMO È FINITA ──────────────────────────────────
 * Identificarle:
 *   SELECT c.id, c.name, c."createdAt"
 *   FROM "Company" c JOIN "CompanyService" cs ON cs."companyId" = c.id
 *   WHERE cs."serviceKey" = 'AUTOSCUOLE' AND (cs.limits::jsonb ->> 'seedDemo') = 'true';
 *
 * Eliminarle (CompanyService e CompanyPlan spariscono in cascata):
 *   DELETE FROM "Company" c
 *   USING "CompanyService" cs
 *   WHERE cs."companyId" = c.id
 *     AND cs."serviceKey" = 'AUTOSCUOLE'
 *     AND (cs.limits::jsonb ->> 'seedDemo') = 'true';
 * ───────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";

// Listino reale: 312 €/anno a posto istruttore, Segretaria AI 350 €/anno.
const SEAT_PRICE_CENTS = 31_200;
const VOICE_PRICE_CENTS = 35_000;

const SCUOLE = [
  { name: "Autoscuola Ponte Vecchio", createdAt: "2026-09-01T09:20:00Z", seats: 22 },
  { name: "Autoscuola Città Alta", createdAt: "2026-09-08T15:05:00Z", seats: 20 },
  { name: "Autoscuola Porta Nuova", createdAt: "2026-09-12T11:40:00Z", seats: 19 },
];

const annualCents = (s) => s.seats * SEAT_PRICE_CENTS + VOICE_PRICE_CENTS;

const totale = SCUOLE.reduce((n, s) => n + annualCents(s), 0);
console.log("Autoscuole da creare:");
for (const s of SCUOLE) {
  console.log(
    `  ${s.name} — registrata ${s.createdAt.slice(0, 10)} — ${s.seats} posti + Segretaria = ${(annualCents(s) / 100).toLocaleString("it-IT")} €/anno`,
  );
}
console.log(`ARR aggiunto: ${(totale / 100).toLocaleString("it-IT")} €`);

if (!APPLY) {
  console.log("\n(prova a vuoto: nessuna scrittura. APPLY=1 per applicare)");
  await prisma.$disconnect();
  process.exit(0);
}

for (const s of SCUOLE) {
  const esiste = await prisma.company.findFirst({ where: { name: s.name }, select: { id: true } });
  if (esiste) {
    console.log("già presente, salto:", s.name);
    continue;
  }
  const createdAt = new Date(s.createdAt);
  const company = await prisma.company.create({
    data: { name: s.name, createdAt, updatedAt: createdAt },
  });
  await prisma.companyService.create({
    data: {
      companyId: company.id,
      serviceKey: "AUTOSCUOLE",
      status: "ACTIVE",
      createdAt,
      updatedAt: createdAt,
      limits: {
        seedDemo: true,
        seedDemoPurpose: "demo backoffice settembre 2026",
        seedDemoCreatedAt: new Date().toISOString().slice(0, 10),
      },
    },
  });
  await prisma.companyPlan.create({
    data: {
      companyId: company.id,
      billingPeriod: "annual",
      instructorSeats: s.seats,
      instructorSeatPriceCents: SEAT_PRICE_CENTS,
      voiceEnabled: true,
      voicePriceCents: VOICE_PRICE_CENTS,
      // La data del piano segue quella dell'autoscuola: è ciò che alimenta la
      // curva "Crescita", e un piano registrato oggi appiattirebbe il grafico.
      createdAt,
      updatedAt: createdAt,
      renewsAt: new Date(new Date(createdAt).setFullYear(createdAt.getFullYear() + 1)),
    },
  });
  console.log("creata:", s.name, company.id);
}
await prisma.$disconnect();
