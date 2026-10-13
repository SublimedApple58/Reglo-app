/**
 * Dati di prova per REG-608 — "Auto al seguito occupata" (prenotazione multipla).
 *
 * Costruisce, dentro l'autoscuola "Reglo E2E" del seed, uno scenario in cui
 * l'auto al seguito scelta e' occupata in alcune date e altre auto lo sono in
 * altre: l'unico modo per fotografare i tre casi veri della schermata
 * (conflitti misti / una stessa auto libera per tutte / nessuna auto libera).
 *
 * SAFE: tocca SOLO il DB di dev (va lanciato con DOTENV_CONFIG_PATH=.env.dev),
 * e' idempotente e sa ripulirsi.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-reg608.ts [--cleanup]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_NAME = 'Reglo E2E';
const TAG = 'REG608';
const STUDENT_EMAIL = 'allievo.reg608@reglo.it';
const BLOCKER_INSTRUCTOR = `Istruttore occupato ${TAG}`;

/** Le auto B dello scenario: la prima e' quella che l'utente sceglie e che risulta presa. */
const CARS = ['POLO BLU', 'GOLF GHIACCIO', 'GOLF ORO', 'GOLF GRIGIA'].map(
  (name) => `${name} ${TAG}`,
);
const MOTO = `HONDA 500 ${TAG}`;

/** Il lunedì fra cinque settimane: lontano da dati veri e sempre feriale. */
const baseDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 35);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7));
  return d;
};

const at = (dayOffset: number, hour: number) => {
  const d = baseDay();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/**
 * Chi occupa cosa. Ogni riga e' una guida di un ALTRO istruttore che tiene
 * impegnata quell'auto in quell'ora.
 *
 *            D1 09  D1 11  D1 15  D2 09  D2 11  D2 15
 * POLO BLU     X      X      X      X      X      X     <- l'auto scelta, sempre presa
 * GHIACCIO     .      .      X      .      .      X
 * ORO          X      .      .      .      .      X
 * GRIGIA       X      X      X      X      X      X     <- non si libera mai
 *
 * Ne esce: alle 09 del primo giorno resta libera solo GHIACCIO (scelta
 * automatica), alle 11 ne restano due (si sceglie), alle 15 nessuna. Sul
 * secondo giorno alle 09 e alle 11 sono libere le stesse due auto, quindi
 * compare la scorciatoia "usa la stessa per tutte".
 */
const BUSY: Array<{ car: string; day: number; hour: number }> = [
  { car: CARS[0], day: 0, hour: 9 },
  { car: CARS[0], day: 0, hour: 11 },
  { car: CARS[0], day: 0, hour: 15 },
  { car: CARS[0], day: 1, hour: 9 },
  { car: CARS[0], day: 1, hour: 11 },
  { car: CARS[0], day: 1, hour: 15 },
  { car: CARS[1], day: 0, hour: 15 },
  { car: CARS[1], day: 1, hour: 15 },
  { car: CARS[2], day: 0, hour: 9 },
  { car: CARS[2], day: 1, hour: 15 },
  { car: CARS[3], day: 0, hour: 9 },
  { car: CARS[3], day: 0, hour: 11 },
  { car: CARS[3], day: 0, hour: 15 },
  { car: CARS[3], day: 1, hour: 9 },
  { car: CARS[3], day: 1, hour: 11 },
  { car: CARS[3], day: 1, hour: 15 },
  // Alle 17 del primo giorno sono prese TUTTE: e' il caso "nessuna auto libera".
  { car: CARS[0], day: 0, hour: 17 },
  { car: CARS[1], day: 0, hour: 17 },
  { car: CARS[2], day: 0, hour: 17 },
  { car: CARS[3], day: 0, hour: 17 },
];

/** L'istruttore che prenota e' lui stesso occupato qui: cambiare auto non risolve. */
const INSTRUCTOR_BUSY = { day: 1, hour: 17 };

async function main() {
  const cleanup = process.argv.includes('--cleanup');
  const company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) throw new Error(`Autoscuola "${COMPANY_NAME}" assente: lancia prima pnpm seed:e2e:dev`);
  const companyId = company.id;

  if (cleanup) {
    const vehicles = await prisma.autoscuolaVehicle.findMany({
      where: { companyId, name: { contains: TAG } },
      select: { id: true },
    });
    const blocker = await prisma.autoscuolaInstructor.findFirst({
      where: { companyId, name: BLOCKER_INSTRUCTOR },
      select: { id: true },
    });
    const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL }, select: { id: true } });
    const ids = vehicles.map((v) => v.id);
    await prisma.autoscuolaAppointment.deleteMany({
      where: {
        companyId,
        OR: [
          ...(ids.length ? [{ vehicleId: { in: ids } }] : []),
          ...(blocker ? [{ instructorId: blocker.id }] : []),
          ...(student ? [{ studentId: student.id }] : []),
        ],
      },
    });
    if (ids.length) await prisma.autoscuolaVehicle.deleteMany({ where: { id: { in: ids } } });
    if (blocker) await prisma.autoscuolaInstructor.delete({ where: { id: blocker.id } });
    if (student) {
      await prisma.companyMember.deleteMany({ where: { companyId, userId: student.id } });
      await prisma.user.delete({ where: { id: student.id } });
    }
    console.log('REG-608: dati di prova rimossi.');
    return;
  }

  // ── Veicoli: le quattro auto B piu' la moto dell'allievo ──
  const vehicleIdByName = new Map<string, string>();
  for (const [index, name] of [...CARS, MOTO].entries()) {
    const isMoto = name === MOTO;
    const existing = await prisma.autoscuolaVehicle.findFirst({ where: { companyId, name } });
    const data = {
      companyId,
      name,
      plate: `${TAG}-${index}`,
      status: 'active',
      licenseCategory: isMoto ? 'A' : 'B',
      transmission: 'manual',
    };
    const row = existing
      ? await prisma.autoscuolaVehicle.update({ where: { id: existing.id }, data })
      : await prisma.autoscuolaVehicle.create({ data });
    vehicleIdByName.set(name, row.id);
  }

  // ── L'istruttore che occupa i mezzi (diverso da quello che prenota) ──
  let blocker = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId, name: BLOCKER_INSTRUCTOR },
  });
  if (!blocker) {
    blocker = await prisma.autoscuolaInstructor.create({
      data: { companyId, name: BLOCKER_INSTRUCTOR, status: 'active' },
    });
  }
  const booking = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId, name: 'Istruttore E2E' },
  });
  if (!booking) throw new Error('Istruttore E2E assente: lancia prima pnpm seed:e2e:dev');

  // ── Un allievo con percorso MOTO: senza, il form non offre le guide moto ──
  let studentUser = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  if (!studentUser) {
    studentUser = await prisma.user.create({
      data: { email: STUDENT_EMAIL, name: 'Marta Moto REG608', role: 'user' },
    });
  }
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId: studentUser.id },
  });
  const memberData = {
    role: 'member' as const,
    autoscuolaRole: 'STUDENT' as const,
    licenseCategory: 'A',
    transmission: 'manual',
    studentPhase: 'PRATICA' as const,
  };
  if (member) {
    await prisma.companyMember.update({
      where: { companyId_userId: { companyId, userId: studentUser.id } },
      data: memberData,
    });
  } else {
    await prisma.companyMember.create({
      data: { companyId, userId: studentUser.id, ...memberData },
    });
  }

  // Un allievo qualunque per le guide che occupano le auto (categoria B).
  const filler = await prisma.companyMember.findFirst({
    where: { companyId, autoscuolaRole: 'STUDENT', userId: { not: studentUser.id } },
    select: { userId: true },
  });
  if (!filler) throw new Error('Serve almeno un altro allievo nel seed.');

  // ── Pulizia delle guide bloccanti precedenti, poi riscrittura ──
  const tagIds = [...vehicleIdByName.values()];
  await prisma.autoscuolaAppointment.deleteMany({
    where: { companyId, OR: [{ vehicleId: { in: tagIds } }, { instructorId: blocker.id }] },
  });
  // Anche la guida "istruttore occupato", che non sta su un mezzo taggato.
  await prisma.autoscuolaAppointment.deleteMany({
    where: { companyId, studentId: filler.userId, instructorId: booking.id },
  });

  // Qualunque ALTRA auto B dell'autoscuola (es. quella del seed base) resterebbe
  // libera in ogni slot e falserebbe lo scenario: la si occupa ovunque.
  const otherCars = await prisma.autoscuolaVehicle.findMany({
    where: {
      companyId,
      status: 'active',
      licenseCategory: 'B',
      name: { not: { contains: TAG } },
    },
    select: { id: true, name: true },
  });
  const allSlots = Array.from(
    new Map(BUSY.map((b) => [`${b.day}-${b.hour}`, { day: b.day, hour: b.hour }])).values(),
  );
  const extraBusy = otherCars.flatMap((car) =>
    allSlots.map((slot) => ({ carId: car.id, ...slot })),
  );

  for (const slot of BUSY) {
    const startsAt = at(slot.day, slot.hour);
    await prisma.autoscuolaAppointment.create({
      data: {
        companyId,
        studentId: filler.userId,
        instructorId: blocker.id,
        vehicleId: vehicleIdByName.get(slot.car)!,
        type: 'guida',
        types: ['guida'],
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        status: 'scheduled',
        appointmentVehicles: {
          create: [{ vehicleId: vehicleIdByName.get(slot.car)!, role: 'primary' }],
        },
      },
    });
  }

  for (const slot of extraBusy) {
    const startsAt = at(slot.day, slot.hour);
    await prisma.autoscuolaAppointment.create({
      data: {
        companyId,
        studentId: filler.userId,
        instructorId: blocker.id,
        vehicleId: slot.carId,
        type: 'guida',
        types: ['guida'],
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        status: 'scheduled',
        appointmentVehicles: { create: [{ vehicleId: slot.carId, role: 'primary' }] },
      },
    });
  }

  // L'istruttore che prenota, occupato di suo: conflitto non risolvibile
  // cambiando auto.
  const instrBusyStart = at(INSTRUCTOR_BUSY.day, INSTRUCTOR_BUSY.hour);
  await prisma.autoscuolaAppointment.create({
    data: {
      companyId,
      studentId: filler.userId,
      instructorId: booking.id,
      type: 'guida',
      types: ['guida'],
      startsAt: instrBusyStart,
      endsAt: new Date(instrBusyStart.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
    },
  });

  const d = baseDay();
  console.log('REG-608: dati di prova pronti.');
  console.log(`  giorno 1 = ${d.toLocaleDateString('it-IT')}, giorno 2 = ${at(1, 0).toLocaleDateString('it-IT')}`);
  console.log(`  allievo moto: ${STUDENT_EMAIL}`);
  console.log(`  auto al seguito da scegliere: ${CARS[0]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
