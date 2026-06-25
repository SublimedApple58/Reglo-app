/**
 * Rich, realistic demo seed — "Autoscuola Reglo" — for the STAGING database.
 *
 * Creates a believable driving school: an owner, 7 instructors (Italian names,
 * weekly availability), a 9-vehicle fleet (cars + moto, some exclusive, some
 * open), ~28 students assigned to instructor clusters, locations, and a LIVE
 * agenda (completed past lessons + scheduled future ones). Idempotent: re-running
 * refreshes data without duplicating (users/instructors/vehicles/students are
 * find-or-create; availability + appointments are wiped and rebuilt).
 *
 * SAFE: targets ONLY the DB pointed at by .env.staging. Run:
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-staging-demo.ts
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

const PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'RegloTest2026!';
const hashPassword = (plain: string): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY mancante (.env.staging).');
  return crypto.createHmac('sha256', key).update(plain).digest('hex');
};

const COMPANY_NAME = 'Autoscuola Reglo';

// ── time helpers (Italy is UTC+2 in June → local 9:00 == 07:00 UTC) ──────────
const LOCAL_TO_UTC = 2;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const atUtcHour = (day: Date, localHour: number) => {
  const x = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  x.setUTCHours(localHour - LOCAL_TO_UTC, 0, 0, 0);
  return x;
};
const isWeekday = (d: Date) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;

// ── data ─────────────────────────────────────────────────────────────────────
const INSTRUCTORS = [
  { name: 'Marco Bianchi', email: 'marco.bianchi@reglo.it', phone: '+39 320 1112201', autonomous: true },
  { name: 'Giulia Conti', email: 'giulia.conti@reglo.it', phone: '+39 320 1112202', autonomous: true },
  { name: 'Luca Ferrari', email: 'luca.ferrari@reglo.it', phone: '+39 320 1112203', autonomous: false },
  { name: 'Sara Greco', email: 'sara.greco@reglo.it', phone: '+39 320 1112204', autonomous: false },
  { name: 'Andrea Romano', email: 'andrea.romano@reglo.it', phone: '+39 320 1112205', autonomous: false },
  { name: 'Paolo Esposito', email: 'paolo.esposito@reglo.it', phone: '+39 320 1112206', autonomous: false }, // moto
  { name: 'Chiara Marino', email: 'istruttore@reglo.it', phone: '+39 320 1112207', autonomous: false },
];

// vehicle per instructor index (exclusive), + open vehicles at the end
const VEHICLES = [
  { name: 'Fiat Panda', plate: 'GA123AA', licenseCategory: 'B', transmission: 'manual', owner: 0 },
  { name: 'Volkswagen Polo', plate: 'GB456BB', licenseCategory: 'B', transmission: 'manual', owner: 1 },
  { name: 'Citroën C3', plate: 'GC789CC', licenseCategory: 'B', transmission: 'manual', owner: 2 },
  { name: 'Renault Clio', plate: 'GD012DD', licenseCategory: 'B', transmission: 'automatic', owner: 3 },
  { name: 'Ford Fiesta', plate: 'GE345EE', licenseCategory: 'B', transmission: 'manual', owner: 4 },
  { name: 'Honda CB500F', plate: 'GF678FF', licenseCategory: 'A', transmission: 'manual', owner: 5 },
  { name: 'Peugeot 208', plate: 'GI567II', licenseCategory: 'B', transmission: 'manual', owner: 6 },
  { name: 'Toyota Yaris', plate: 'GG901GG', licenseCategory: 'B', transmission: 'automatic', owner: null }, // open
  { name: 'Yamaha MT-07', plate: 'GH234HH', licenseCategory: 'A2', transmission: 'manual', owner: null }, // open moto
];

const FIRST = ['Alessandro', 'Sofia', 'Lorenzo', 'Giorgia', 'Matteo', 'Aurora', 'Davide', 'Martina', 'Federico', 'Chiara', 'Riccardo', 'Alice', 'Tommaso', 'Sara', 'Gabriele', 'Emma', 'Francesco', 'Giulia', 'Edoardo', 'Beatrice', 'Leonardo', 'Noemi', 'Simone', 'Elisa', 'Nicolò', 'Camilla', 'Antonio', 'Vittoria'];
const LAST = ['Russo', 'Esposito', 'Colombo', 'Bruno', 'Gallo', 'Costa', 'Fontana', 'Caruso', 'Rizzo', 'Moretti', 'Barbieri', 'Lombardi', 'Ricci', 'Mancini', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Serra', 'Coppola', 'De Luca', 'Villa', 'Marchetti', 'Sala', 'Ferrara'];

async function upsertUser(email: string, name: string, companyId: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  const data = { name, password: hashPassword(PASSWORD), activeCompanyId: companyId };
  if (existing) return prisma.user.update({ where: { id: existing.id }, data });
  return prisma.user.create({ data: { email, role: 'user', ...data } });
}

async function upsertMember(companyId: string, userId: string, fields: Record<string, unknown>) {
  const existing = await prisma.companyMember.findFirst({ where: { companyId, userId } });
  if (existing) {
    return prisma.companyMember.update({
      where: { companyId_userId: { companyId, userId } },
      data: fields,
    });
  }
  return prisma.companyMember.create({ data: { companyId, userId, ...fields } });
}

async function main() {
  // 1. Company
  let company = await prisma.company.findFirst({
    where: { name: { in: [COMPANY_NAME, 'Reglo E2E'] } },
    orderBy: { createdAt: 'asc' },
  });
  company = company
    ? await prisma.company.update({ where: { id: company.id }, data: { name: COMPANY_NAME } })
    : await prisma.company.create({ data: { name: COMPANY_NAME } });
  const companyId = company.id;

  // 2. AUTOSCUOLE service
  const limits = {
    vehiclesEnabled: true,
    groupLessonsEnabled: true,
    phasesEnabled: ['AWAITING', 'TEORIA', 'PRATICA', 'PATENTATO'],
    defaultLicenseCategory: 'B',
    defaultTransmission: 'manual',
    appBookingActors: 'both',
  };
  const svc = await prisma.companyService.findFirst({ where: { companyId, serviceKey: 'AUTOSCUOLE' } });
  if (svc) await prisma.companyService.update({ where: { id: svc.id }, data: { status: 'ACTIVE', limits } });
  else await prisma.companyService.create({ data: { companyId, serviceKey: 'AUTOSCUOLE', status: 'ACTIVE', limits } });

  // 3. Owner
  const owner = await upsertUser('titolare@reglo.it', 'Titolare Reglo', companyId);
  await upsertMember(companyId, owner.id, { role: 'admin', autoscuolaRole: 'OWNER' });

  // 4. Locations
  const locations = [
    { name: 'Sede Principale', address: 'Via Roma 42, Milano', lat: '45.4654', lng: '9.1859', isDefault: true },
    { name: 'Piazzale Lotto', address: "Piazzale Lotto, Milano", lat: '45.4780', lng: '9.1380', isDefault: false },
  ];
  let defaultLocationId = '';
  for (const l of locations) {
    let loc = await prisma.autoscuolaLocation.findFirst({ where: { companyId, name: l.name } });
    if (!loc) {
      loc = await prisma.autoscuolaLocation.create({
        data: {
          companyId, name: l.name, address: l.address,
          latitude: new Decimal(l.lat), longitude: new Decimal(l.lng),
          isDefault: l.isDefault, isPrecise: true,
        },
      });
    }
    if (l.isDefault) defaultLocationId = loc.id;
  }

  // 5. Instructors (user + member + record + weekly availability)
  const instructorIds: string[] = [];
  for (const ins of INSTRUCTORS) {
    const u = await upsertUser(ins.email, ins.name, companyId);
    await upsertMember(companyId, u.id, { role: 'member', autoscuolaRole: 'INSTRUCTOR' });
    let rec = await prisma.autoscuolaInstructor.findFirst({ where: { companyId, userId: u.id } });
    rec = rec
      ? await prisma.autoscuolaInstructor.update({ where: { id: rec.id }, data: { name: ins.name, phone: ins.phone, status: 'active', autonomousMode: ins.autonomous } })
      : await prisma.autoscuolaInstructor.create({ data: { companyId, userId: u.id, name: ins.name, phone: ins.phone, status: 'active', autonomousMode: ins.autonomous } });
    instructorIds.push(rec.id);
  }

  // 6. Vehicles (exclusive owners + open) — followsInstructorAvailability for owned.
  // Drop leftover minimal-seed vehicles (plates E2E-*) so the fleet is clean.
  await prisma.autoscuolaVehicle.deleteMany({ where: { companyId, plate: { startsWith: 'E2E' } } });
  const vehicleIds: string[] = [];
  for (const v of VEHICLES) {
    const assignedInstructorId = v.owner === null ? null : instructorIds[v.owner];
    let veh = await prisma.autoscuolaVehicle.findFirst({ where: { companyId, name: v.name } });
    const data = {
      plate: v.plate, status: 'active', licenseCategory: v.licenseCategory, transmission: v.transmission,
      assignedInstructorId, followsInstructorAvailability: assignedInstructorId !== null,
    };
    veh = veh
      ? await prisma.autoscuolaVehicle.update({ where: { id: veh.id }, data })
      : await prisma.autoscuolaVehicle.create({ data: { companyId, name: v.name, ...data } });
    vehicleIds.push(veh.id);
  }
  // primary vehicle per instructor = the vehicle they own
  const vehicleByInstructor = new Map<string, string>();
  VEHICLES.forEach((v, i) => { if (v.owner !== null) vehicleByInstructor.set(instructorIds[v.owner], vehicleIds[i]); });

  // 7. Weekly availability — wipe + rebuild. Instructors Mon–Fri 8–13 & 14–19.
  await prisma.autoscuolaWeeklyAvailability.deleteMany({ where: { companyId } });
  for (const instructorId of instructorIds) {
    await prisma.autoscuolaWeeklyAvailability.create({
      data: {
        companyId, ownerType: 'instructor', ownerId: instructorId,
        daysOfWeek: [1, 2, 3, 4, 5], startMinutes: 480, endMinutes: 780,
        startMinutes2: 840, endMinutes2: 1140,
      },
    });
  }
  // open vehicles get their own availability (owned ones follow the instructor)
  VEHICLES.forEach((v, i) => { /* placeholder to keep index parity */ void v; void i; });
  for (let i = 0; i < VEHICLES.length; i++) {
    if (VEHICLES[i].owner === null) {
      await prisma.autoscuolaWeeklyAvailability.create({
        data: {
          companyId, ownerType: 'vehicle', ownerId: vehicleIds[i],
          daysOfWeek: [1, 2, 3, 4, 5], startMinutes: 480, endMinutes: 1140,
        },
      });
    }
  }

  // 8. Students (~28) — user + member, assigned round-robin to instructors.
  // Moto students (A1/A2/A) go to the moto instructor (index 5).
  const motoInstructorId = instructorIds[5];
  const studentsByInstructor = new Map<string, string[]>(); // instructorId -> [userId]
  const allStudentUserIds: string[] = [];
  for (let i = 0; i < 28; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const email = i === 0 ? 'allievo@reglo.it' : `allievo${i + 1}@reglo.it`;
    const u = await upsertUser(email, i === 0 ? 'Davide Russo' : name, companyId);
    allStudentUserIds.push(u.id);

    const moto = i % 9 === 4; // ~3 moto students
    const licenseCategory = moto ? (i % 2 === 0 ? 'A2' : 'A1') : 'B';
    const transmission = !moto && i % 5 === 0 ? 'automatic' : 'manual';
    const assignedInstructorId = moto ? motoInstructorId : instructorIds[i % 5]; // first 5 are car instructors

    await upsertMember(companyId, u.id, {
      role: 'member', autoscuolaRole: 'STUDENT', studentPhase: 'PRATICA',
      assignedInstructorId, licenseCategory, transmission,
    });
    const list = studentsByInstructor.get(assignedInstructorId) ?? [];
    list.push(u.id);
    studentsByInstructor.set(assignedInstructorId, list);
  }

  // 9. Appointments — wipe + rebuild a live agenda (past completed + future scheduled).
  await prisma.autoscuolaAppointment.deleteMany({ where: { companyId } });
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const NOTES = ['Buona padronanza del veicolo.', 'Da rivedere i parcheggi.', 'Ottimo controllo in città.', 'Migliorare le precedenze.', 'Pronta per la guida autostradale.'];
  const hours = [9, 10, 11, 15, 16, 17];
  const rows: Array<Record<string, unknown>> = [];

  for (let offset = -7; offset <= 13; offset++) {
    const day = addDays(todayUtc, offset);
    if (!isWeekday(day)) continue;
    const past = offset < 0;
    instructorIds.forEach((instructorId, iIdx) => {
      const students = studentsByInstructor.get(instructorId) ?? [];
      if (!students.length) return;
      const vehicleId = vehicleByInstructor.get(instructorId) ?? vehicleIds[vehicleIds.length - 2];
      // 2–3 lessons per instructor per day, rotating students/hours by day offset
      const count = 2 + ((iIdx + offset) % 2);
      for (let k = 0; k < count; k++) {
        const student = students[(offset + k + iIdx + 100) % students.length];
        const localHour = hours[(k + iIdx) % hours.length];
        const startsAt = atUtcHour(day, localHour);
        const completed = past;
        const noShow = past && (offset + k) % 11 === 0;
        rows.push({
          companyId, studentId: student, instructorId, vehicleId, locationId: defaultLocationId,
          type: 'guida', types: k % 3 === 0 ? ['manovre'] : [],
          status: noShow ? 'no_show' : completed ? 'completed' : 'scheduled',
          startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
          paymentRequired: false, paymentStatus: 'not_required', priceAmount: new Decimal('50.00'),
          bookingSource: 'staff_owner',
          ...(completed && !noShow ? { rating: 3 + ((offset + k) % 3), notes: NOTES[(k + iIdx) % NOTES.length] } : {}),
        });
      }
    });
  }
  // batch insert
  for (let i = 0; i < rows.length; i += 200) {
    await prisma.autoscuolaAppointment.createMany({ data: rows.slice(i, i + 200) as never });
  }

  // 10. Company logo (Reglo) on R2
  try {
    const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;
    const endpointRaw = process.env.R2_ENDPOINT;
    if (bucket && endpointRaw && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
      const endpoint = endpointRaw.replace(/\/+$/, '').replace(new RegExp(`/${bucket}$`), '');
      const client = new S3Client({
        region: process.env.R2_REGION ?? 'auto', endpoint, forcePathStyle: true,
        credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
      });
      const key = `companies/${companyId}/logo.png`;
      const body = fs.readFileSync(path.resolve(process.cwd(), 'assets/reglo_new_logo.png'));
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/png' }));
      await prisma.company.update({ where: { id: companyId }, data: { logoKey: key } });
    }
  } catch (e) {
    console.warn('Logo upload saltato:', (e as Error).message);
  }

  console.log('✓ Demo "Autoscuola Reglo" seedata su STAGING');
  console.log(`  Company: ${company.name} (${companyId})`);
  console.log(`  Istruttori: ${INSTRUCTORS.length} | Veicoli: ${VEHICLES.length} | Allievi: ${allStudentUserIds.length} | Appuntamenti: ${rows.length}`);
  console.log(`  Login titolare: titolare@reglo.it / ${PASSWORD}`);
  console.log(`  Login istruttore: istruttore@reglo.it (Chiara Marino) / ${PASSWORD}`);
  console.log(`  Login allievo: allievo@reglo.it (Davide Russo) / ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
