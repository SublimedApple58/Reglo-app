import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_ID = 'd1c62f9b-7120-4dc9-b599-852261194653'; // Reglo srl
const INSTRUCTOR_ID = '948b9b4a-c6bd-46a1-a8f1-f3a8f73e8eb9'; // Tiziano Nuovo 1
const LOCATION_ID = 'a4008421-430f-48a7-9ea1-53ab425cb363';

// Allievi (cluster Tiziano Nuovo 1), escluso Allievo 3 (l'utente che osserva)
const STUDENTS = [
  { id: 'a0143229-2a4d-4cda-965d-54563e050f6e', name: 'Allievo Prova' },
  { id: 'd9489e06-3007-4b94-80e8-8557a5fa4e11', name: 'Tiziano Felicio' },
  { id: '53c3a1f5-c8de-4156-8bf4-1b703e1e370b', name: 'Tiziano allievo 1' },
];

// Orari futuri che NON collidono con le guide di Allievo 3 (04/15/18/26 giu)
const SLOTS = [
  '2026-06-10T14:00:00.000Z',
  '2026-06-12T16:00:00.000Z',
  '2026-06-20T11:00:00.000Z',
];

async function main() {
  for (let i = 0; i < STUDENTS.length; i++) {
    const student = STUDENTS[i];
    const startsAt = new Date(SLOTS[i]);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const expiresAt = new Date(startsAt.getTime() - 60 * 60 * 1000); // -1h

    const appointment = await prisma.autoscuolaAppointment.create({
      data: {
        companyId: COMPANY_ID,
        studentId: student.id,
        instructorId: INSTRUCTOR_ID,
        locationId: LOCATION_ID,
        type: 'guida',
        types: [],
        status: 'scheduled',
        startsAt,
        endsAt,
        paymentRequired: false,
        paymentStatus: 'not_required',
        priceAmount: 50,
      },
    });

    const offer = await prisma.autoscuolaSwapOffer.create({
      data: {
        companyId: COMPANY_ID,
        appointmentId: appointment.id,
        requestingStudentId: student.id,
        status: 'broadcasted',
        sentAt: new Date(),
        expiresAt,
      },
    });

    console.log(
      `✓ ${student.name}: guida ${startsAt.toISOString()} → offer ${offer.id}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
