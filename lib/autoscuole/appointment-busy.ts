/**
 * Chi è OCCUPATO da un appuntamento.
 *
 * Il motore di disponibilità ragiona per "proprietario": per ogni allievo,
 * istruttore e veicolo tiene una lista di intervalli occupati, e uno slot è
 * libero solo se nessuno dei proprietari coinvolti ha una sovrapposizione.
 * Costruire quella lista vuol dire rispondere a una domanda sola — *questa
 * riga chi impegna?* — e fino a REG-591 la risposta stava scritta a mano in
 * CINQUE posti diversi (slot-matcher, slot-assignment, tre punti delle azioni
 * di disponibilità), tutti uguali e tutti da aggiornare insieme.
 *
 * Non sono stati aggiornati insieme. Con REG-585 una guida di gruppo o un
 * esame hanno potuto avere un SECONDO istruttore (`AutoscuolaAppointmentInstructor`),
 * ma le cinque copie guardavano solo `instructorId`: per il motore il collega
 * restava libero in quell'ora, e gli allievi si prenotavano sopra. Doppia
 * prenotazione vera, segnalata il 2026-10-02.
 *
 * Da qui in avanti la risposta sta in un posto solo. Chi aggiunge un modo
 * nuovo di impegnare qualcuno (un terzo ruolo, un altro veicolo) lo aggiunge
 * QUI, e lo prendono tutti e cinque.
 *
 * ⚠️ Serve anche il `select`: un campo aggiunto qui ma non caricato dalla query
 * è `undefined` a runtime e non impegna nessuno, in silenzio. Per questo il
 * frammento di select vive accanto alla funzione — si usano in coppia.
 */

/** Il `select` Prisma minimo perché `appointmentBusyOwnerIds` veda tutto. */
export const APPOINTMENT_BUSY_SELECT = {
  studentId: true,
  instructorId: true,
  vehicleId: true,
  startsAt: true,
  endsAt: true,
  appointmentVehicles: { select: { vehicleId: true } },
  // REG-591: il secondo istruttore di una guida di gruppo o di un esame.
  coInstructors: { select: { instructorId: true } },
} as const;

export type BusyAppointment = {
  /** Null solo sui segnaposto d'esame senza allievo: impegnano comunque istruttore e veicolo. */
  studentId: string | null;
  instructorId: string | null;
  vehicleId: string | null;
  appointmentVehicles?: Array<{ vehicleId: string }> | null;
  coInstructors?: Array<{ instructorId: string }> | null;
};

/**
 * Gli id di tutti i proprietari che questa riga tiene occupati: allievo,
 * istruttore principale, **co-istruttori**, veicolo principale e ogni altro
 * veicolo agganciato (moto + auto al seguito).
 */
export function appointmentBusyOwnerIds(appointment: BusyAppointment): string[] {
  const ids: string[] = [];
  if (appointment.studentId) ids.push(appointment.studentId);
  if (appointment.instructorId) ids.push(appointment.instructorId);
  for (const co of appointment.coInstructors ?? []) {
    if (co.instructorId) ids.push(co.instructorId);
  }
  if (appointment.vehicleId) ids.push(appointment.vehicleId);
  for (const link of appointment.appointmentVehicles ?? []) {
    if (link.vehicleId && link.vehicleId !== appointment.vehicleId) ids.push(link.vehicleId);
  }
  return ids;
}

/**
 * Gli id degli ISTRUTTORI impegnati da questa riga: il principale più i
 * colleghi. Per chi ragiona solo di istruttori (report ore, disponibilità per
 * istruttore) e non di veicoli o allievi.
 */
export function appointmentBusyInstructorIds(appointment: {
  instructorId: string | null;
  coInstructors?: Array<{ instructorId: string }> | null;
}): string[] {
  const ids: string[] = [];
  if (appointment.instructorId) ids.push(appointment.instructorId);
  for (const co of appointment.coInstructors ?? []) {
    if (co.instructorId) ids.push(co.instructorId);
  }
  return ids;
}
