/**
 * Dati di prova per REG-617 — ricerca in «Aggiungi allievo» e invito ai gruppi.
 *
 * Il difetto si vede solo con MOLTI allievi idonei: con quattro in lista non
 * serve cercare, e l'invito risponde in un lampo. Qui l'autoscuola di prova si
 * riempie di allievi iscritti alle guide di gruppo — abbastanza da far
 * comparire il campo di ricerca (soglia: 8) — e una guida di gruppo con posti
 * aperti su cui provare l'invito.
 *
 * Fra i nomi ce ne sono due con l'accento e due che condividono il cognome:
 * sono i due casi che la ricerca deve sapere gestire (senza accenti, e per
 * parole in qualunque ordine).
 *
 * SAFE: tocca SOLO il DB di dev/staging (passa DOTENV_CONFIG_PATH), è
 * idempotente e sa ripulirsi.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-reg617.ts [--cleanup]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_NAME = 'Reglo E2E';
const TAG = 'REG617';
const CAR = `SWIFT ROSSA ${TAG}`;
const EMAIL_DOMAIN = 'reg617.reglo.local';

/** Capienza 3 con 2 posti presi: la stessa forma dello screenshot di Robatto. */
const CAPACITY = 3;
const ENROLLED = 2;

/**
 * Gli allievi idonei. Dodici liberi + due iscritti = quattordici: sopra la
 * soglia della ricerca anche dopo aver riempito due posti.
 */
const STUDENTS = [
  'Mario Rossi',
  'Marta Rossi',        // stesso cognome di Mario: "rossi mario" deve scegliere lui
  'Nicolò Bianchi',     // con l'accento: si trova scrivendo "nicolo"
  'Chiara Esposito',
  'Giuseppe Romano',
  'Francesca Colombo',
  'Alessandro Ricci',
  'Martina Marino',
  'Davide Greco',
  'Sofia Bruno',
  'Luca Gallo',
  'Giulia Conti',
  'Matteo De Luca',
  'Benedetta Faà',      // doppio accento in coda: caso limite della forma piatta
];

/** Il giovedì fra quattro settimane, alle 8: feriale e lontano da dati veri. */
const lessonStart = () => {
  const d = new Date();
  d.setDate(d.getDate() + 28);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7));
  d.setHours(8, 0, 0, 0);
  return d;
};

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');

const emailFor = (name: string) => `${slug(name)}@${EMAIL_DOMAIN}`;

async function main() {
  const cleanup = process.argv.includes('--cleanup');
  const company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) {
    throw new Error(`Autoscuola "${COMPANY_NAME}" assente: lancia prima pnpm seed:e2e:dev`);
  }
  const companyId = company.id;

  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
    select: { id: true, email: true },
  });
  const car = await prisma.autoscuolaVehicle.findFirst({ where: { companyId, name: CAR } });

  if (cleanup) {
    const groupLessons = await prisma.autoscuolaGroupLesson.findMany({
      where: { companyId, ...(car ? { vehicleId: car.id } : {}) },
      select: { id: true },
    });
    const glIds = groupLessons.map((g) => g.id);
    if (glIds.length) {
      await prisma.autoscuolaAppointment.deleteMany({ where: { groupLessonId: { in: glIds } } });
      await prisma.autoscuolaGroupLessonInvite.deleteMany({
        where: { groupLessonId: { in: glIds } },
      });
      await prisma.autoscuolaGroupLesson.deleteMany({ where: { id: { in: glIds } } });
    }
    if (users.length) {
      const userIds = users.map((u) => u.id);
      await prisma.autoscuolaAppointment.deleteMany({ where: { studentId: { in: userIds } } });
      await prisma.companyMember.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (car) await prisma.autoscuolaVehicle.deleteMany({ where: { id: car.id } });
    console.log('REG-617: dati di prova rimossi.');
    return;
  }

  // Gli account con cui si prova devono ATTERRARE qui: su staging stanno anche
  // in altre autoscuole (lezione di REG-608, 13/10/2026).
  await prisma.user.updateMany({
    where: { email: { in: ['titolare@reglo.it', 'istruttore@reglo.it'] } },
    data: { activeCompanyId: companyId },
  });

  const instructor = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId, name: 'Istruttore E2E' },
  });
  if (!instructor) throw new Error('Istruttore E2E assente: lancia prima pnpm seed:e2e:dev');

  // ── L'auto della guida di gruppo ──
  const carRow = car
    ? await prisma.autoscuolaVehicle.update({ where: { id: car.id }, data: { status: 'active' } })
    : await prisma.autoscuolaVehicle.create({
        data: {
          companyId,
          name: CAR,
          plate: `${TAG}-AUTO`,
          status: 'active',
          licenseCategory: 'B',
          transmission: 'manual',
        },
      });

  // ── Gli allievi, tutti iscritti alle guide di gruppo ──
  const studentIds: string[] = [];
  for (const name of STUDENTS) {
    const email = emailFor(name);
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { email, name, role: 'user' } }));
    // Il nome conta: è quello che si cerca. Se esisteva con un nome diverso,
    // riallinealo.
    if (user.name !== name) {
      await prisma.user.update({ where: { id: user.id }, data: { name } });
    }
    const memberData = {
      role: 'member' as const,
      autoscuolaRole: 'STUDENT' as const,
      licenseCategory: 'B',
      transmission: 'manual',
      studentPhase: 'PRATICA' as const,
      // Senza questo l'allievo non è idoneo: è il filtro primo del broadcast.
      groupLessonsOptIn: true,
      bookingBlocked: false,
    };
    const existing = await prisma.companyMember.findFirst({
      where: { companyId, userId: user.id },
    });
    if (existing) {
      await prisma.companyMember.update({
        where: { companyId_userId: { companyId, userId: user.id } },
        data: memberData,
      });
    } else {
      await prisma.companyMember.create({
        data: { companyId, userId: user.id, ...memberData },
      });
    }
    studentIds.push(user.id);
  }

  // ── La guida di gruppo: si riscrive da zero, così il giro è ripetibile ──
  const startsAt = lessonStart();
  const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);

  const previous = await prisma.autoscuolaGroupLesson.findMany({
    where: { companyId, vehicleId: carRow.id },
    select: { id: true },
  });
  if (previous.length) {
    const ids = previous.map((p) => p.id);
    await prisma.autoscuolaAppointment.deleteMany({ where: { groupLessonId: { in: ids } } });
    await prisma.autoscuolaGroupLessonInvite.deleteMany({ where: { groupLessonId: { in: ids } } });
    await prisma.autoscuolaGroupLesson.deleteMany({ where: { id: { in: ids } } });
  }
  // E gli inviti di un giro precedente su questa autoscuola, che altrimenti
  // restano "broadcasted" e sporcano l'inbox degli allievi di prova.
  await prisma.autoscuolaAppointment.deleteMany({
    where: { companyId, studentId: { in: studentIds } },
  });

  const groupLesson = await prisma.autoscuolaGroupLesson.create({
    data: {
      companyId,
      kind: 'standard',
      instructorId: instructor.id,
      vehicleId: carRow.id,
      startsAt,
      endsAt,
      capacity: CAPACITY,
      status: 'scheduled',
    },
  });

  // I primi due allievi dentro: il roster legge "2/3" e resta un posto aperto.
  await prisma.autoscuolaAppointment.createMany({
    data: studentIds.slice(0, ENROLLED).map((studentId) => ({
      companyId,
      studentId,
      instructorId: instructor.id,
      vehicleId: carRow.id,
      groupLessonId: groupLesson.id,
      type: 'group_lesson',
      types: ['group_lesson'],
      startsAt,
      endsAt,
      status: 'scheduled',
    })),
  });

  console.log('REG-617: dati di prova pronti.');
  console.log(`  guida di gruppo: ${startsAt.toLocaleString('it-IT')} · ${CAR} · ${ENROLLED}/${CAPACITY}`);
  console.log(`  allievi idonei: ${STUDENTS.length - ENROLLED} (su ${STUDENTS.length} iscritti ai gruppi)`);
  console.log(`  prove per la ricerca: "nicolo" → Nicolò Bianchi · "rossi mario" → Mario Rossi`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
