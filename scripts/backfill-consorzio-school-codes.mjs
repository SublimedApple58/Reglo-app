/**
 * Backfill dei codici contabili delle autoscuole consorziate.
 *
 * 1. Assegna un codice contabile PLAUSIBILE a ogni `ConsorzioSchool` che non ce
 *    l'ha (derivato dal nome: "Autoscuola Robatto" → AS-ROBATTO) e lo propaga a
 *    tutti gli allievi della scuola — stessa logica di `syncSchoolAccountingCode`
 *    in `lib/actions/consorzio.actions.ts`.
 * 2. Con `--fill-to=<n>` crea autoscuole consorziate demo fino ad arrivare a n
 *    (serve a testare la ricerca per codice con volume realistico, ~40).
 * 3. Con `--students-per-school=<n>` crea allievi demo nelle consorziate che
 *    non ne hanno (serve al filtro "Autoscuola" dei picker allievo in agenda:
 *    le opzioni sono le scuole che hanno almeno un allievo).
 *
 * Idempotente: rilanciarlo non duplica né codici né scuole.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     node scripts/backfill-consorzio-school-codes.mjs --fill-to=40
 *
 * Opzioni: --company="<nome>" (default: l'unica company in modalità consorzio),
 *          --fill-to=<n>, --students-per-school=<n>, --dry-run.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has("dry-run");
const FILL_TO = Number(arg("fill-to", "0")) || 0;
const STUDENTS_PER_SCHOOL = Number(arg("students-per-school", "0")) || 0;
const COMPANY_NAME = arg("company");

/** "Autoscuola Gruppo Andrea Demo" → "AS-ANDREA" (max 12 char, A-Z0-9-). */
const codeFromName = (name) => {
  const cleaned = name
    .replace(/\b(autoscuola|auto scuola|scuola guida|demo|s\.?r\.?l\.?|snc|sas|spa)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const core = (words[words.length - 1] || name.replace(/[^a-zA-Z0-9]/g, "") || "SCUOLA")
    .toUpperCase()
    .slice(0, 9);
  return `AS-${core}`;
};

/** Autoscuole demo per portare il consorzio a volume (nomi + città liguri). */
const DEMO_SCHOOLS = [
  ["Autoscuola Aurelia", "Genova Sestri"],
  ["Autoscuola Belvedere", "Genova Sampierdarena"],
  ["Autoscuola Camogli", "Camogli"],
  ["Autoscuola Delfino", "Genova Foce"],
  ["Autoscuola Europa", "Genova Albaro"],
  ["Autoscuola Ferrari", "Chiavari"],
  ["Autoscuola Garibaldi", "Genova Centro"],
  ["Autoscuola Hermes", "La Spezia"],
  ["Autoscuola Italia", "Savona"],
  ["Autoscuola Lanterna", "Genova Porto"],
  ["Autoscuola Maremonti", "Recco"],
  ["Autoscuola Nuova Guida", "Genova Pegli"],
  ["Autoscuola Oregina", "Genova Oregina"],
  ["Autoscuola Portofino", "Santa Margherita"],
  ["Autoscuola Quarto", "Genova Quarto"],
  ["Autoscuola Rapallo", "Rapallo"],
  ["Autoscuola Sturla", "Genova Sturla"],
  ["Autoscuola Tigullio", "Lavagna"],
  ["Autoscuola Universo", "Genova Marassi"],
  ["Autoscuola Verdi", "Sestri Levante"],
  ["Autoscuola Zena", "Genova Centro"],
  ["Autoscuola Bisagno", "Genova Molassana"],
  ["Autoscuola Cornigliano", "Genova Cornigliano"],
  ["Autoscuola Doria", "Genova Prà"],
  ["Autoscuola Entella", "Chiavari"],
  ["Autoscuola Fontanabuona", "Cicagna"],
  ["Autoscuola Golfo", "La Spezia"],
  ["Autoscuola Levante", "Sestri Levante"],
  ["Autoscuola Millefonti", "Arenzano"],
  ["Autoscuola Nervi", "Genova Nervi"],
  ["Autoscuola Ponente", "Varazze"],
  ["Autoscuola Riviera", "Alassio"],
  ["Autoscuola San Giorgio", "Genova Centro"],
  ["Autoscuola Trasporti Liguri", "Genova Bolzaneto"],
  ["Autoscuola Val Polcevera", "Genova Rivarolo"],
  ["Autoscuola Vesima", "Genova Voltri"],
  ["Autoscuola Zoagli", "Zoagli"],
  ["Autoscuola Pegli Due", "Genova Pegli"],
  ["Autoscuola Struppa", "Genova Struppa"],
  ["Autoscuola Certosa", "Genova Certosa"],
];

const STUDENT_FIRST = [
  "Luca", "Marta", "Simone", "Ilaria", "Matteo", "Federica", "Alberto", "Silvia",
  "Riccardo", "Valentina", "Stefano", "Martina",
];
const STUDENT_LAST = [
  "Sanguineti", "Traverso", "Bruzzone", "Repetto", "Canepa", "Parodi",
  "Bertolotto", "Cevasco", "Musso", "Pittaluga", "Ansaldo", "Grondona",
];
const STUDENT_CATEGORIES = ["C", "CE", "D", "DE", "C1", "D1", "CQC", "ADR"];

const OWNERS = [
  "Marco Rossi", "Laura Bianchi", "Paolo Ferrari", "Chiara Gallo", "Andrea Costa",
  "Elena Rizzo", "Davide Conti", "Sara Greco", "Luca Moretti", "Giulia Barbieri",
];

async function main() {
  // ── Company consorzio ──
  const services = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE" },
    select: { companyId: true, limits: true, company: { select: { id: true, name: true } } },
  });
  const consortia = services.filter((s) => (s.limits ?? {}).accountKind === "consorzio");
  const target = COMPANY_NAME
    ? consortia.find((s) => s.company.name.toLowerCase().includes(COMPANY_NAME.toLowerCase()))
    : consortia[0];

  if (!target) {
    console.error("❌ Nessuna company in modalità consorzio trovata.");
    process.exit(1);
  }
  if (consortia.length > 1 && !COMPANY_NAME) {
    console.error(`❌ Più consorzi (${consortia.map((c) => c.company.name).join(", ")}): usa --company="…"`);
    process.exit(1);
  }
  const companyId = target.company.id;
  console.log(`• Consorzio: ${target.company.name} (${companyId})${DRY_RUN ? "  [DRY RUN]" : ""}`);

  // ── Codici già in uso (per non collidere) ──
  const usedCodes = new Set(
    (
      await prisma.consorzioAccountingCode.findMany({
        where: { consorzioCompanyId: companyId },
        select: { code: true },
      })
    ).map((c) => c.code),
  );

  const uniqueCode = (base) => {
    let code = base;
    let n = 2;
    while (usedCodes.has(code)) code = `${base}-${n++}`;
    usedCodes.add(code);
    return code;
  };

  /** Upsert codice + link scuola + propagazione a tutti i suoi allievi. */
  const assignCode = async (school, code) => {
    if (DRY_RUN) return;
    const row = await prisma.consorzioAccountingCode.upsert({
      where: { consorzioCompanyId_code: { consorzioCompanyId: companyId, code } },
      update: { archivedAt: null },
      create: { consorzioCompanyId: companyId, code, description: school.name },
      select: { id: true },
    });
    await prisma.consorzioSchool.update({
      where: { id: school.id },
      data: { accountingCodeId: row.id },
    });
    const memberIds = (
      await prisma.companyMember.findMany({
        where: { companyId, consorzioSchoolId: school.id },
        select: { userId: true },
      })
    ).map((m) => m.userId);
    if (school.accountingCodeId && school.accountingCodeId !== row.id && memberIds.length) {
      await prisma.consorzioMemberAccountingCode.deleteMany({
        where: { companyId, codeId: school.accountingCodeId, userId: { in: memberIds } },
      });
    }
    if (memberIds.length) {
      await prisma.consorzioMemberAccountingCode.createMany({
        data: memberIds.map((userId) => ({ companyId, userId, codeId: row.id })),
        skipDuplicates: true,
      });
    }
  };

  // ── 1. Backfill delle scuole esistenti senza codice ──
  const schools = await prisma.consorzioSchool.findMany({
    where: { consorzioCompanyId: companyId },
    orderBy: { createdAt: "asc" },
  });
  let backfilled = 0;
  for (const school of schools) {
    if (school.accountingCodeId) continue;
    const code = uniqueCode(codeFromName(school.name));
    await assignCode(school, code);
    console.log(`  ✓ ${school.name} → ${code}`);
    backfilled += 1;
  }
  console.log(`✓ Backfill: ${backfilled} autoscuole senza codice (su ${schools.length} totali)`);

  // ── 2. Volume: crea autoscuole demo fino a FILL_TO ──
  let created = 0;
  if (FILL_TO > schools.length) {
    const existingNames = new Set(schools.map((s) => s.name));
    const missing = FILL_TO - schools.length;
    const pool = DEMO_SCHOOLS.filter(([name]) => !existingNames.has(name)).slice(0, missing);
    for (const [index, [name, city]] of pool.entries()) {
      const code = uniqueCode(codeFromName(name));
      if (DRY_RUN) {
        console.log(`  + ${name} (${city}) → ${code}`);
        created += 1;
        continue;
      }
      const school = await prisma.consorzioSchool.create({
        data: {
          consorzioCompanyId: companyId,
          name,
          city,
          ownerName: OWNERS[index % OWNERS.length],
          address: `Via ${city.split(" ").pop()} ${10 + index}, ${city}`,
          vatNumber: String(11111111111 + index),
          phone: `010 ${String(300000 + index * 7).slice(0, 6)}`,
          email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.demo`,
          status: index % 11 === 10 ? "suspended" : "active",
          joinedAt: new Date(Date.UTC(2024, index % 12, 1 + (index % 27))),
        },
      });
      await assignCode(school, code);
      console.log(`  + ${name} (${city}) → ${code}`);
      created += 1;
    }
    if (pool.length < missing) {
      console.log(`  ⚠︎ Nomi demo esauriti: create ${pool.length} su ${missing} richieste.`);
    }
  }

  // ── 3. Allievi demo nelle consorziate che non ne hanno ──
  let students = 0;
  if (STUDENTS_PER_SCHOOL > 0) {
    const all = await prisma.consorzioSchool.findMany({
      where: { consorzioCompanyId: companyId, status: { not: "removed" } },
      select: { id: true, name: true, accountingCodeId: true },
      orderBy: { createdAt: "asc" },
    });
    for (const [schoolIndex, school] of all.entries()) {
      const existing = await prisma.companyMember.count({
        where: { companyId, consorzioSchoolId: school.id, autoscuolaRole: "STUDENT" },
      });
      for (let i = existing; i < STUDENTS_PER_SCHOOL; i += 1) {
        const seed = schoolIndex * 7 + i;
        const name = `${STUDENT_FIRST[seed % STUDENT_FIRST.length]} ${STUDENT_LAST[(seed * 3) % STUDENT_LAST.length]}`;
        const email = `allievo-${schoolIndex + 1}-${i + 1}@consorzio.demo`;
        if (DRY_RUN) {
          console.log(`  · ${school.name}: ${name} <${email}>`);
          students += 1;
          continue;
        }
        let user = await prisma.user.findFirst({ where: { email } });
        if (!user) user = await prisma.user.create({ data: { email, name } });
        await prisma.companyMember.upsert({
          where: { companyId_userId: { companyId, userId: user.id } },
          create: {
            companyId,
            userId: user.id,
            role: "member",
            autoscuolaRole: "STUDENT",
            studentPhase: "PRATICA",
            licenseCategory: STUDENT_CATEGORIES[seed % STUDENT_CATEGORIES.length],
            transmission: "manual",
            consorzioSchoolId: school.id,
          },
          update: { consorzioSchoolId: school.id },
        });
        if (school.accountingCodeId) {
          await prisma.consorzioMemberAccountingCode.createMany({
            data: [{ companyId, userId: user.id, codeId: school.accountingCodeId }],
            skipDuplicates: true,
          });
        }
        students += 1;
      }
    }
    console.log(`✓ Allievi demo creati: ${students}`);
  }

  const total = await prisma.consorzioSchool.count({ where: { consorzioCompanyId: companyId } });
  const withCode = await prisma.consorzioSchool.count({
    where: { consorzioCompanyId: companyId, accountingCodeId: { not: null } },
  });
  console.log("─────────────────────────────────────────────");
  console.log(
    `Autoscuole consorziate: ${total}  ·  con codice: ${withCode}  ·  nuove: ${created}  ·  allievi demo: ${students}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
