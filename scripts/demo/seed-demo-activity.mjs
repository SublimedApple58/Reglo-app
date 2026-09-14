/**
 * Attività per le tre autoscuole di demo: istruttori con disponibilità,
 * allievi e guide già svolte, così nella tabella "Autoscuole nel periodo" del
 * backoffice compaiono vive invece che ferme a zero.
 *
 * ─── COSA NON FA, DI PROPOSITO ─────────────────────────────────────────────
 * - email su dominio `reglo.invalid` (TLD riservato dalla RFC 2606: non è
 *   instradabile, nessun messaggio può partire nemmeno per errore);
 * - nessun numero di telefono → niente WhatsApp/SMS;
 * - nessuna password → quegli account non possono accedere;
 * - nessun dispositivo push, nessun invito, nessuna pratica, nessun piano di
 *   pagamento, `paymentRequired = false` su tutte le guide;
 * - guide SOLO nel passato e già `completed`: i job che ricordano le lezioni
 *   guardano quelle future, quelli che chiudono le guide guardano le
 *   `scheduled`. Non c'è niente da notificare e niente da elaborare.
 * - le guide partono dalla data di registrazione della scuola: una scuola nata
 *   due giorni fa non può avere tre settimane di storico.
 *
 * Pulizia: le righe sono tutte agganciate alle tre Company, quindi la DELETE
 * in testa a seed-demo-companies.mjs (cascata) porta via anche queste. Gli
 * UTENTI però non sono agganciati alla Company: si rimuovono con
 *   DELETE FROM "User" WHERE email LIKE '%@reglo.invalid';
 * (da eseguire DOPO la delete delle Company, perché i CompanyMember cadono con
 * la Company e gli appuntamenti hanno onDelete: Restrict sullo studente).
 *
 *   DOTENV_CONFIG_PATH=.env.prod node -r dotenv/config scripts/demo/seed-demo-activity.mjs
 *   (APPLY=1 per scrivere)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";

// Generatore deterministico: rilanciare lo script dà gli stessi numeri.
let seme = 20260914;
const rnd = () => {
  seme = (seme * 1103515245 + 12345) % 2147483648;
  return seme / 2147483648;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const NOMI = ["Marco","Giulia","Luca","Sara","Andrea","Chiara","Matteo","Elisa","Davide","Federica","Simone","Martina","Alessio","Ilaria","Stefano","Valentina","Riccardo","Alice","Lorenzo","Beatrice","Nicola","Camilla","Fabio","Giorgia","Emanuele","Noemi","Tommaso","Arianna","Filippo","Aurora"];
const COGNOMI = ["Rossi","Bianchi","Ferrari","Russo","Esposito","Colombo","Ricci","Marino","Greco","Bruno","Gallo","Conti","De Luca","Costa","Giordano","Mancini","Rizzo","Lombardi","Moretti","Barbieri","Fontana","Santoro","Mariani","Rinaldi","Caruso","Ferrara","Galli","Martini","Leone","Longo"];

const SCUOLE = [
  { name: "Autoscuola Ponte Vecchio", dal: "2026-09-01", istruttori: 3, allievi: 45, guideGiorno: 15 },
  { name: "Autoscuola Città Alta", dal: "2026-09-08", istruttori: 3, allievi: 25, guideGiorno: 12 },
  { name: "Autoscuola Porta Nuova", dal: "2026-09-12", istruttori: 3, allievi: 15, guideGiorno: 10 },
];

// Fasce dichiarate: lun-sab 9-12 e 15-17 (il sabato solo mattina, come fanno
// quasi tutte). Le guide stanno dentro queste ore, così contano come
// "occupate" e non come "fuori fascia".
const FASCE = [
  { startMinutes: 9 * 60, endMinutes: 12 * 60 },
  { startMinutes: 15 * 60, endMinutes: 17 * 60 },
];
const SLOT = [9 * 60, 10 * 60, 11 * 60, 15 * 60, 16 * 60];
// Mix dei canali vicino a quello vero della piattaforma (~40% dall'app).
const CANALI = ["student_self","student_self","staff_owner","staff_instructor","staff_owner"];

const giorniLavorativi = (dal, a) => {
  const out = [];
  for (let d = new Date(dal); d < a; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) out.push(new Date(d)); // chiuso solo la domenica
  }
  return out;
};
const soloMattina = (giorno) => giorno.getDay() === 6;

const oggi = new Date();
oggi.setHours(0, 0, 0, 0);

let totali = { istruttori: 0, allievi: 0, guide: 0 };
const piano = SCUOLE.map((s) => {
  const giorni = giorniLavorativi(new Date(`${s.dal}T00:00:00`), oggi);
  const guide = giorni.reduce((n, g) => n + (soloMattina(g) ? Math.round(s.guideGiorno / 2) : s.guideGiorno), 0);
  totali.istruttori += s.istruttori;
  totali.allievi += s.allievi;
  totali.guide += guide;
  return { ...s, giorni: giorni.length, guide };
});

console.log("Attività da creare:");
for (const s of piano) {
  console.log(`  ${s.name}: ${s.istruttori} istruttori · ${s.allievi} allievi · ~${s.guide} guide su ${s.giorni} giorni lavorativi (dal ${s.dal})`);
}
console.log(`Totale: ${totali.istruttori} istruttori, ${totali.allievi} allievi, ~${totali.guide} guide`);

if (!APPLY) {
  console.log("\n(prova a vuoto: nessuna scrittura. APPLY=1 per applicare)");
  await prisma.$disconnect();
  process.exit(0);
}

for (const s of SCUOLE) {
  const company = await prisma.company.findFirst({ where: { name: s.name }, select: { id: true, createdAt: true } });
  if (!company) { console.log("azienda non trovata, salto:", s.name); continue; }
  const giaFatto = await prisma.autoscuolaInstructor.count({ where: { companyId: company.id } });
  if (giaFatto > 0) { console.log("attività già presente, salto:", s.name); continue; }
  const slug = s.name.toLowerCase().replace(/[^a-z]+/g, "");

  // ── Istruttori (utente + membro + scheda + disponibilità) ───────────────
  const istruttori = [];
  for (let i = 0; i < s.istruttori; i++) {
    const nome = `${pick(NOMI)} ${pick(COGNOMI)}`;
    const user = await prisma.user.create({
      data: {
        name: nome,
        email: `istr${i + 1}.${slug}@reglo.invalid`,
        role: "user",
        createdAt: company.createdAt,
        updatedAt: company.createdAt,
      },
    });
    await prisma.companyMember.create({
      data: { companyId: company.id, userId: user.id, role: "member", autoscuolaRole: "INSTRUCTOR", createdAt: company.createdAt },
    });
    const istr = await prisma.autoscuolaInstructor.create({
      data: { companyId: company.id, userId: user.id, name: nome, status: "active", createdAt: company.createdAt, updatedAt: company.createdAt },
    });
    await prisma.autoscuolaWeeklyAvailability.create({
      data: {
        companyId: company.id,
        ownerType: "instructor",
        ownerId: istr.id,
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        ranges: FASCE,
        startMinutes: FASCE[0].startMinutes,
        endMinutes: FASCE[FASCE.length - 1].endMinutes,
        createdAt: company.createdAt,
        updatedAt: company.createdAt,
      },
    });
    istruttori.push(istr.id);
  }

  // ── Allievi ─────────────────────────────────────────────────────────────
  const allievi = [];
  for (let i = 0; i < s.allievi; i++) {
    const nome = `${pick(NOMI)} ${pick(COGNOMI)}`;
    const iscritto = new Date(company.createdAt.getTime() + Math.floor(rnd() * 5) * 86_400_000);
    const user = await prisma.user.create({
      data: { name: nome, email: `allievo${i + 1}.${slug}@reglo.invalid`, role: "user", createdAt: iscritto, updatedAt: iscritto },
    });
    await prisma.companyMember.create({
      data: { companyId: company.id, userId: user.id, role: "member", autoscuolaRole: "STUDENT", createdAt: iscritto },
    });
    allievi.push(user.id);
  }

  // ── Guide già svolte ────────────────────────────────────────────────────
  const giorni = giorniLavorativi(new Date(`${s.dal}T00:00:00`), oggi);
  const righe = [];
  for (const giorno of giorni) {
    const mattina = soloMattina(giorno);
    const quante = mattina ? Math.round(s.guideGiorno / 2) : s.guideGiorno;
    const slotDelGiorno = mattina ? SLOT.filter((m) => m < 12 * 60) : SLOT;
    for (let n = 0; n < quante; n++) {
      const istruttore = istruttori[n % istruttori.length];
      const minuti = slotDelGiorno[Math.floor(rnd() * slotDelGiorno.length)];
      const durata = rnd() < 0.5 ? 60 : 90;
      const startsAt = new Date(giorno);
      startsAt.setHours(0, minuti, 0, 0);
      const endsAt = new Date(startsAt.getTime() + durata * 60_000);
      // 90 minuti dalle 11 o dalle 16 uscirebbero dalla fascia: si accorciano.
      if (minuti === 11 * 60 || minuti === 16 * 60) endsAt.setTime(startsAt.getTime() + 60 * 60_000);
      const creata = new Date(startsAt.getTime() - (1 + Math.floor(rnd() * 4)) * 86_400_000);
      righe.push({
        companyId: company.id,
        studentId: allievi[Math.floor(rnd() * allievi.length)],
        instructorId: istruttore,
        type: "guida",
        status: "completed",
        startsAt,
        endsAt,
        bookingSource: CANALI[Math.floor(rnd() * CANALI.length)],
        paymentRequired: false,
        paymentStatus: "not_required",
        createdAt: creata < company.createdAt ? company.createdAt : creata,
        updatedAt: startsAt,
      });
    }
  }
  await prisma.autoscuolaAppointment.createMany({ data: righe });
  console.log(`${s.name}: ${istruttori.length} istruttori, ${allievi.length} allievi, ${righe.length} guide`);
}
await prisma.$disconnect();
