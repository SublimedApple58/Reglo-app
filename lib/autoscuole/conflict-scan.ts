import { prisma } from "@/db/prisma";
import {
  busyVehicleIds,
  pickConflictingVehicle,
  type ReservedVehicle,
  type ReservedVehicleRole,
} from "@/lib/autoscuole/conflict-reason";

/**
 * Il controllo conflitti della prenotazione, in un posto solo (REG-611).
 *
 * Viveva dentro `createAutoscuolaAppointmentBatch` e al PRIMO conflitto
 * faceva `return`: tutto il resto del quadro andava perso. Per far scegliere
 * un'auto sostitutiva serve invece l'elenco completo — quali date vanno,
 * quali no e perche' — prima di scrivere qualsiasi cosa.
 *
 * Qui dentro ci sta il controllo, usato sia dalla prova a vuoto sia dalla
 * creazione vera: cosi' non possono dire due cose diverse.
 */

/**
 * Sovrapposizione con i CONTAINER delle guide di gruppo: un container impegna
 * istruttore, veicolo principale, auto al seguito condivisa e flotta per tutta
 * la finestra anche con ZERO iscritti — e in quel caso non ha righe
 * appuntamento, quindi le scansioni sugli appuntamenti non lo vedono.
 */
export const findGroupContainerConflict = async ({
  companyId,
  startsAt,
  endsAt,
  instructorId,
  vehicleIds,
}: {
  companyId: string;
  startsAt: Date;
  endsAt: Date;
  instructorId?: string | null;
  vehicleIds?: string[];
}) => {
  const reserved = Array.from(new Set((vehicleIds ?? []).filter(Boolean)));
  if (!instructorId && !reserved.length) return null;
  return prisma.autoscuolaGroupLesson.findFirst({
    where: {
      companyId,
      status: "scheduled",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      OR: [
        ...(instructorId ? [{ instructorId }] : []),
        ...(reserved.length
          ? [
              { vehicleId: { in: reserved } },
              { followVehicleId: { in: reserved } },
              { fleetVehicles: { some: { vehicleId: { in: reserved } } } },
            ]
          : []),
      ],
    },
    // REG-609: servono anche i mezzi, non solo l'id — e' con questi che il
    // messaggio di conflitto puo' dire QUALE veicolo e' impegnato.
    select: {
      id: true,
      instructorId: true,
      vehicleId: true,
      followVehicleId: true,
      fleetVehicles: { select: { vehicleId: true } },
    },
  });
};

/**
 * L'elenco dei mezzi che una guida impegna, nell'ordine con cui si racconta il
 * conflitto: prima il veicolo principale (non si sostituisce con un clic), poi
 * le moto aggiuntive, infine l'auto al seguito. Un posto solo, cosi' creazione
 * singola, prenotazione multipla e prova a vuoto non possono divergere.
 */
export function buildReservedVehicles(args: {
  primaryVehicleId?: string | null;
  extraMotoVehicleIds?: readonly string[] | null;
  followVehicleId?: string | null;
}): ReservedVehicle[] {
  return [
    ...(args.primaryVehicleId
      ? [{ id: args.primaryVehicleId, role: "primary" as const }]
      : []),
    ...(args.extraMotoVehicleIds ?? []).map((id) => ({ id, role: "extra_moto" as const })),
    ...(args.followVehicleId ? [{ id: args.followVehicleId, role: "follow" as const }] : []),
  ];
}

/**
 * L'auto al seguito che vale per UNA data: la scelta per quella data se c'e',
 * altrimenti quella condivisa da tutta la prenotazione. `null` esplicito vuol
 * dire "nessuna auto al seguito" ed e' diverso da "non specificato".
 */
export function effectiveFollowVehicleId(
  shared: string | null | undefined,
  perEntry: string | null | undefined,
): string | null {
  return perEntry === undefined ? (shared ?? null) : perEntry;
}

/** Una guida da verificare, con i mezzi che terrebbe impegnati. */
export type ScanEntry = {
  startsAt: Date;
  endsAt: Date;
  /** Ordine di racconto: principale → moto aggiuntive → auto al seguito. */
  reserved: readonly ReservedVehicle[];
};

/** Perche' quella data non va. `null` = e' libera. */
export type EntryConflict =
  | { kind: "instructor"; inGroupLesson: boolean }
  | { kind: "block" }
  | { kind: "overlap" }
  | {
      kind: "vehicle";
      vehicleId: string;
      role: ReservedVehicleRole;
      inGroupLesson: boolean;
    };

/** Una guida senza `endsAt` vale mezz'ora: convenzione storica dei controlli. */
const DEFAULT_LESSON_MS = 30 * 60 * 1000;

const overlaps = (
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) => a.startsAt < b.endsAt && a.endsAt > b.startsAt;

/**
 * Verifica TUTTE le guide e torna, per ciascuna e nello stesso ordine, il
 * motivo del conflitto oppure `null`.
 *
 * Tre letture in tutto, qualunque sia il numero di guide: appuntamenti,
 * blocchi dell'istruttore e container di gruppo sulla finestra che le
 * contiene (con un giorno di margine, perche' una guida lunga puo' sforare il
 * bordo). L'incrocio avviene poi in memoria. Prima il container si leggeva
 * dentro il ciclo, una query per guida.
 *
 * Niente scritture, niente effetti collaterali: la creazione vera riusa questa
 * stessa funzione e si ferma al primo conflitto.
 */
export async function scanEntryConflicts(args: {
  companyId: string;
  instructorId: string;
  entries: readonly ScanEntry[];
}): Promise<Array<EntryConflict | null>> {
  const { companyId, instructorId, entries } = args;
  if (!entries.length) return [];

  const allReservedIds = Array.from(
    new Set(entries.flatMap((e) => e.reserved.map((v) => v.id))),
  );

  const scanStart = new Date(Math.min(...entries.map((e) => e.startsAt.getTime())));
  scanStart.setDate(scanStart.getDate() - 1);
  const scanEnd = new Date(Math.max(...entries.map((e) => e.endsAt.getTime())));
  scanEnd.setDate(scanEnd.getDate() + 1);

  const appointmentOr: Array<Record<string, unknown>> = [
    { instructorId },
    // REG-591: l'istruttore e' occupato anche quando ACCOMPAGNA la guida di un
    // collega. Senza questo ramo lo si vedeva libero e nasceva un doppione.
    { coInstructors: { some: { instructorId } } },
  ];
  if (allReservedIds.length) {
    appointmentOr.push({ vehicleId: { in: allReservedIds } });
    appointmentOr.push({
      appointmentVehicles: { some: { vehicleId: { in: allReservedIds } } },
    });
  }

  const [appointments, blocks, containers] = await Promise.all([
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        startsAt: { gte: scanStart, lt: scanEnd },
        status: { notIn: ["cancelled"] },
        OR: appointmentOr,
      },
      select: {
        startsAt: true,
        endsAt: true,
        instructorId: true,
        vehicleId: true,
        appointmentVehicles: { select: { vehicleId: true } },
        // Serve a sapere PERCHE' una riga e' uscita dalla query: con un solo
        // `instructorId` non si distingue la guida che il nostro istruttore
        // accompagna da quella di un collega presa solo per via di un mezzo.
        coInstructors: { select: { instructorId: true } },
      },
    }),
    prisma.autoscuolaInstructorBlock.findMany({
      where: { companyId, instructorId, startsAt: { gte: scanStart, lt: scanEnd } },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.autoscuolaGroupLesson.findMany({
      where: {
        companyId,
        status: "scheduled",
        startsAt: { gte: scanStart, lt: scanEnd },
        OR: [
          { instructorId },
          ...(allReservedIds.length
            ? [
                { vehicleId: { in: allReservedIds } },
                { followVehicleId: { in: allReservedIds } },
                { fleetVehicles: { some: { vehicleId: { in: allReservedIds } } } },
              ]
            : []),
        ],
      },
      select: {
        startsAt: true,
        endsAt: true,
        instructorId: true,
        vehicleId: true,
        followVehicleId: true,
        fleetVehicles: { select: { vehicleId: true } },
      },
    }),
  ]);

  const busyAppointments: BusyRow[] = appointments.map((a) => ({
    startsAt: a.startsAt,
    endsAt: a.endsAt ?? new Date(a.startsAt.getTime() + DEFAULT_LESSON_MS),
    // L'istruttore e' impegnato anche quando ACCOMPAGNA la guida di un collega.
    ownInstructor:
      a.instructorId === instructorId ||
      a.coInstructors.some((co) => co.instructorId === instructorId),
    vehicleIds: busyVehicleIds(a),
  }));
  const busyContainers: BusyRow[] = containers.map((c) => ({
    startsAt: c.startsAt,
    endsAt: c.endsAt ?? new Date(c.startsAt.getTime() + DEFAULT_LESSON_MS),
    ownInstructor: c.instructorId === instructorId,
    vehicleIds: busyVehicleIds(c),
  }));

  return resolveEntryConflicts({
    entries,
    appointments: busyAppointments,
    blocks: blocks.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt })),
    containers: busyContainers,
  });
}

/**
 * Una riga d'agenda che potrebbe bloccare una data: una guida o il container
 * di una guida di gruppo, ridotti a quel che serve per decidere.
 */
export type BusyRow = {
  startsAt: Date;
  endsAt: Date;
  /** Impegna il NOSTRO istruttore (titolare della guida o accompagnatore). */
  ownInstructor: boolean;
  /** Tutti i mezzi che quella riga tiene occupati. */
  vehicleIds: string[];
};

/**
 * Perche' una riga d'agenda blocca QUESTA data — o perche' non la blocca.
 *
 * Il punto delicato (REG-616): le righe arrivano da una query sola per tutte
 * le date, con in OR l'istruttore e **l'unione** dei mezzi di tutte quante.
 * Quindi fra loro ce ne sono che con questa data non c'entrano niente: la
 * guida di un collega, pescata perche' usa l'auto al seguito che qui abbiamo
 * gia' sostituito. Si considera bloccante solo la riga che tocca davvero il
 * nostro istruttore o uno dei mezzi riservati **in questa data**.
 *
 * L'istruttore occupato viene prima: cambiare auto non libererebbe l'ora, e
 * proporlo manderebbe l'utente a sbattere.
 */
const pickRowConflict = (
  entry: ScanEntry,
  rows: readonly BusyRow[],
  inGroupLesson: boolean,
): EntryConflict | null => {
  if (rows.some((row) => row.ownInstructor && overlaps(row, entry))) {
    return { kind: "instructor" as const, inGroupLesson };
  }
  for (const row of rows) {
    if (!overlaps(row, entry)) continue;
    const busy = pickConflictingVehicle(entry.reserved, row.vehicleIds);
    if (busy) {
      return { kind: "vehicle" as const, vehicleId: busy.id, role: busy.role, inGroupLesson };
    }
  }
  return null;
};

/**
 * Il cuore del controllo, senza database: date le righe d'agenda gia' lette,
 * dice per ciascuna guida perche' non va (o `null` se va).
 *
 * Sta fuori da `scanEntryConflicts` per poter essere provato sui dati esatti
 * che hanno prodotto il difetto, senza passare dal DB.
 */
export function resolveEntryConflicts(args: {
  entries: readonly ScanEntry[];
  appointments: readonly BusyRow[];
  blocks: readonly { startsAt: Date; endsAt: Date }[];
  containers: readonly BusyRow[];
}): Array<EntryConflict | null> {
  const { entries, appointments, blocks, containers } = args;

  return entries.map((entry, index) => {
    // 1. Un'altra guida gia' in agenda.
    const byAppointment = pickRowConflict(entry, appointments, false);
    if (byAppointment) return byAppointment;

    // 2. Slot bloccato sull'istruttore (malattia, ferie, impegno manuale).
    if (blocks.some((b) => overlaps(b, entry))) return { kind: "block" as const };

    // 3. Container di guida di gruppo: impegna anche a zero iscritti.
    const byContainer = pickRowConflict(entry, containers, true);
    if (byContainer) return byContainer;

    // 4. Due guide della stessa prenotazione che si accavallano fra loro.
    const selfOverlap = entries.some(
      (other, otherIndex) => otherIndex !== index && overlaps(other, entry),
    );
    return selfOverlap ? { kind: "overlap" as const } : null;
  });
}
