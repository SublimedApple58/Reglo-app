/**
 * Ridimensiona i piani delle tre autoscuole di demo perché l'ARR TOTALE della
 * piattaforma (reali + demo) arrivi a ~20.000 €, invece di aggiungere 20k sopra
 * i 15k reali.
 *
 * Effetto collaterale buono: con 5-6 posti a testa le tre scuole tornano in
 * linea con i clienti veri (il più grande ne ha 8), invece di essere i tre
 * colossi da 20 posti che erano.
 *
 *   DOTENV_CONFIG_PATH=.env.prod node -r dotenv/config scripts/demo/resize-demo-plans.mjs
 *   (APPLY=1 per scrivere)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";
const SEAT_PRICE_CENTS = 31_200; // 312 €/anno, listino reale

const NUOVI_PIANI = {
  "Autoscuola Ponte Vecchio": 6,
  "Autoscuola Città Alta": 5,
  "Autoscuola Porta Nuova": 5,
};

const arrOf = (rows) =>
  rows.reduce((n, p) => {
    const periodo =
      p.instructorSeats * p.instructorSeatPriceCents +
      (p.voiceEnabled ? p.voicePriceCents : 0);
    return n + (p.billingPeriod === "monthly" ? periodo * 12 : periodo);
  }, 0);

const tutti = await prisma.companyPlan.findMany({
  include: { company: { select: { name: true } } },
});
const reali = tutti.filter((p) => !(p.company.name in NUOVI_PIANI));
console.log("ARR reale:", (arrOf(reali) / 100).toLocaleString("it-IT"), "€");
console.log("ARR totale attuale:", (arrOf(tutti) / 100).toLocaleString("it-IT"), "€");

const demoArr = Object.values(NUOVI_PIANI).reduce((n, seats) => n + seats * SEAT_PRICE_CENTS, 0);
console.log("\nNuovi piani demo (Segretaria disattivata):");
for (const [nome, seats] of Object.entries(NUOVI_PIANI)) {
  console.log(`  ${nome}: ${seats} posti = ${((seats * SEAT_PRICE_CENTS) / 100).toLocaleString("it-IT")} €/anno`);
}
console.log("ARR totale dopo:", ((arrOf(reali) + demoArr) / 100).toLocaleString("it-IT"), "€");

if (!APPLY) {
  console.log("\n(prova a vuoto: nessuna scrittura. APPLY=1 per applicare)");
  await prisma.$disconnect();
  process.exit(0);
}

for (const [nome, seats] of Object.entries(NUOVI_PIANI)) {
  const piano = tutti.find((p) => p.company.name === nome);
  if (!piano) {
    console.log("piano non trovato, salto:", nome);
    continue;
  }
  await prisma.companyPlan.update({
    where: { id: piano.id },
    data: {
      instructorSeats: seats,
      instructorSeatPriceCents: SEAT_PRICE_CENTS,
      voiceEnabled: false,
      voicePriceCents: 0,
    },
  });
  console.log("aggiornato:", nome, "→", seats, "posti");
}
await prisma.$disconnect();
