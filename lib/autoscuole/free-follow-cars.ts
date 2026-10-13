import { prisma } from "@/db/prisma";
import { busyVehicleIds } from "@/lib/autoscuole/conflict-reason";
import { FOLLOW_CAR_CATEGORY } from "@/lib/autoscuole/follow-car";

/**
 * Quali auto al seguito sono LIBERE in un dato slot (REG-610).
 *
 * Il prodotto sa gia' dire se un veicolo e' occupato; non sapeva dire il
 * contrario. Il selettore "Auto al seguito" della prenotazione elenca oggi
 * tutte le auto B dell'autoscuola, libere o no — chi sceglie scopre solo al
 * salvataggio che quella macchina era gia' presa. Qui si ribalta la domanda:
 * dato uno slot, chi e' davvero disponibile.
 *
 * Occupato vuol dire le stesse tre cose del controllo conflitti: la guida che
 * tiene il mezzo come veicolo principale, la guida che se lo tiene via la join
 * (ed e' il caso dell'auto al seguito di un collega) e il contenitore di una
 * guida di gruppo, che impegna mezzi anche a zero iscritti.
 */

/** Uno slot da interrogare. `key` torna indietro nella mappa: la sceglie il chiamante. */
export type FreeCarSlot = { key: string; startsAt: Date; endsAt: Date };

export type FreeCar = { id: string; name: string; transmission: string | null };

/** Un impegno gia' in agenda, ridotto a quel che serve: quando e su quali mezzi. */
export type VehicleBusyRow = { startsAt: Date; endsAt: Date; vehicleIds: string[] };

/** Una guida senza `endsAt` vale mezz'ora: stessa convenzione dei controlli conflitti. */
const DEFAULT_LESSON_MS = 30 * 60 * 1000;

const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
  a.startsAt < b.endsAt && a.endsAt > b.startsAt;

/**
 * Cuore puro: per ogni slot, i veicoli che nessun impegno tocca.
 * L'ordine dei veicoli in ingresso e' quello che esce — decide il chiamante.
 */
export function computeFreeVehiclesPerSlot<T extends { id: string }>(args: {
  slots: readonly FreeCarSlot[];
  vehicles: readonly T[];
  busy: readonly VehicleBusyRow[];
}): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const slot of args.slots) {
    const takenHere = new Set<string>();
    for (const row of args.busy) {
      if (!overlaps(row, slot)) continue;
      for (const id of row.vehicleIds) takenHere.add(id);
    }
    result.set(
      slot.key,
      args.vehicles.filter((v) => !takenHere.has(v.id)),
    );
  }
  return result;
}

/**
 * Le auto al seguito libere in ciascuno slot, in ordine alfabetico.
 *
 * Una sola scansione per TUTTI gli slot: si legge la finestra che li contiene
 * (con un giorno di margine, come fanno i controlli conflitti per via delle
 * guide lunghe a cavallo) e poi si incrocia in memoria.
 *
 * Volutamente NON filtra per istruttore: oggi la creazione di una guida non lo
 * fa (lo fa solo la modifica di una guida esistente), e filtrare qui darebbe
 * due comportamenti diversi nella stessa schermata.
 */
export async function listFreeFollowCarsForSlots(args: {
  companyId: string;
  slots: readonly FreeCarSlot[];
  /** Auto da non proporre: tipicamente quella gia' scelta, che e' il problema. */
  excludeVehicleIds?: readonly string[];
}): Promise<Map<string, FreeCar[]>> {
  const { companyId, slots } = args;
  if (!slots.length) return new Map();

  const excluded = new Set(args.excludeVehicleIds ?? []);
  const cars = (
    await prisma.autoscuolaVehicle.findMany({
      where: { companyId, status: "active", licenseCategory: FOLLOW_CAR_CATEGORY },
      select: { id: true, name: true, transmission: true },
      orderBy: { name: "asc" },
    })
  ).filter((car) => !excluded.has(car.id));
  if (!cars.length) return new Map(slots.map((s) => [s.key, []]));

  const carIds = cars.map((c) => c.id);
  const scanStart = new Date(Math.min(...slots.map((s) => s.startsAt.getTime())));
  scanStart.setDate(scanStart.getDate() - 1);
  const scanEnd = new Date(Math.max(...slots.map((s) => s.endsAt.getTime())));
  scanEnd.setDate(scanEnd.getDate() + 1);

  const [appointments, containers] = await Promise.all([
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        status: { notIn: ["cancelled"] },
        startsAt: { gte: scanStart, lt: scanEnd },
        OR: [
          { vehicleId: { in: carIds } },
          { appointmentVehicles: { some: { vehicleId: { in: carIds } } } },
        ],
      },
      select: {
        startsAt: true,
        endsAt: true,
        vehicleId: true,
        appointmentVehicles: { select: { vehicleId: true } },
      },
    }),
    prisma.autoscuolaGroupLesson.findMany({
      where: {
        companyId,
        status: "scheduled",
        startsAt: { gte: scanStart, lt: scanEnd },
        OR: [
          { vehicleId: { in: carIds } },
          { followVehicleId: { in: carIds } },
          { fleetVehicles: { some: { vehicleId: { in: carIds } } } },
        ],
      },
      select: {
        startsAt: true,
        endsAt: true,
        vehicleId: true,
        followVehicleId: true,
        fleetVehicles: { select: { vehicleId: true } },
      },
    }),
  ]);

  const busy: VehicleBusyRow[] = [
    ...appointments.map((a) => ({
      startsAt: a.startsAt,
      endsAt: a.endsAt ?? new Date(a.startsAt.getTime() + DEFAULT_LESSON_MS),
      vehicleIds: busyVehicleIds(a),
    })),
    ...containers.map((c) => ({
      startsAt: c.startsAt,
      endsAt: c.endsAt ?? new Date(c.startsAt.getTime() + DEFAULT_LESSON_MS),
      vehicleIds: busyVehicleIds(c),
    })),
  ];

  return computeFreeVehiclesPerSlot({ slots, vehicles: cars, busy });
}
