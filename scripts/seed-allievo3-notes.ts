import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_ID = 'd1c62f9b-7120-4dc9-b599-852261194653'; // Reglo srl
const STUDENT_ID = '1b8d5a8e-8caf-489f-a187-a904c27c1c63'; // Allievo 3
const INSTRUCTOR_ID = '948b9b4a-c6bd-46a1-a8f1-f3a8f73e8eb9'; // Tiziano Nuovo 1
const LOCATION_ID = 'a4008421-430f-48a7-9ea1-53ab425cb363';

type Seed = {
  startsAt: string; // UTC
  type: string;
  types: string[];
  rating: number;
  notes: string;
};

const LESSONS: Seed[] = [
  {
    startsAt: '2026-05-12T08:00:00.000Z',
    type: 'guida',
    types: ['manovre'],
    rating: 3,
    notes:
      'Prima guida sulle manovre. Retromarcia in rettilineo buona, ma sul parcheggio a S serve ancora attenzione agli specchietti. Tende a frizionare troppo in partenza.',
  },
  {
    startsAt: '2026-05-16T13:00:00.000Z',
    type: 'guida',
    types: ['urbano'],
    rating: 4,
    notes:
      'Guida in centro abitato. Buona gestione delle precedenze e degli incroci. Da migliorare la posizione in carreggiata nelle curve a destra.',
  },
  {
    startsAt: '2026-05-20T07:30:00.000Z',
    type: 'guida',
    types: ['manovre', 'parcheggio'],
    rating: 4,
    notes:
      'Parcheggi: in parallelo ottimo, a pettine ancora un po’ incerto. Migliorata la frizione in partenza rispetto alla scorsa volta.',
  },
  {
    startsAt: '2026-05-23T15:00:00.000Z',
    type: 'guida',
    types: ['extraurbano'],
    rating: 5,
    notes:
      'Strada extraurbana: sorpassi gestiti con sicurezza, buona lettura della segnaletica. Velocità sempre adeguata. Molto bene!',
  },
  {
    startsAt: '2026-05-27T19:30:00.000Z',
    type: 'guida',
    types: ['notturna'],
    rating: 4,
    notes:
      'Guida notturna. Uso corretto degli abbaglianti e dei fari. Un po’ di insicurezza nel valutare le distanze al buio, ma in netto miglioramento.',
  },
  {
    startsAt: '2026-05-30T09:00:00.000Z',
    type: 'guida',
    types: ['autostrada'],
    rating: 5,
    notes:
      'Prima esperienza in autostrada. Immissione e cambi di corsia ottimi, mantiene bene la distanza di sicurezza. Pronta per l’esame.',
  },
  {
    startsAt: '2026-06-01T13:00:00.000Z',
    type: 'esame',
    types: ['esame'],
    rating: 5,
    notes:
      'Simulazione d’esame completa: nessun errore grave. Manovra richiesta eseguita correttamente al primo tentativo. Complimenti, sei pronta!',
  },
];

async function main() {
  for (const lesson of LESSONS) {
    const startsAt = new Date(lesson.startsAt);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    const created = await prisma.autoscuolaAppointment.create({
      data: {
        companyId: COMPANY_ID,
        studentId: STUDENT_ID,
        instructorId: INSTRUCTOR_ID,
        locationId: LOCATION_ID,
        type: lesson.type,
        types: lesson.types,
        status: 'completed',
        startsAt,
        endsAt,
        rating: lesson.rating,
        notes: lesson.notes,
        paymentRequired: false,
        paymentStatus: 'not_required',
        priceAmount: 50,
      },
    });

    console.log(
      `✓ ${startsAt.toISOString().slice(0, 10)} ${lesson.types.join(',')} ★${lesson.rating} → ${created.id}`,
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
