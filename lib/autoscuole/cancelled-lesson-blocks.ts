// ─────────────────────────────────────────────────────────────────────────────
// Blocchi delle guide annullate non ancora sostituite (REG-623).
//
// Un "sostituto" non è un collegamento salvato (replacedByAppointmentId non lo
// scrive nessuno): è semplicemente un'altra guida che OCCUPA quell'orario con
// lo stesso istruttore. Per questo il blocco non va mai tolto a mano quando lo
// slot si riempie: è derivato dai dati dell'agenda, e appena c'è una guida
// attiva sovrapposta smette di esistere — da qualunque strada arrivi la guida
// (offerta del posto, prenotazione dall'app, creazione dalla segreteria,
// «Assegna sostituto»).
//
// Modulo client-safe: lo usa l'agenda web, i test lo usano così com'è.
// ─────────────────────────────────────────────────────────────────────────────

export type CancelledBlockAppointment = {
  id: string;
  type: string;
  status: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  instructorId?: string | null;
  instructor?: { id: string } | null;
  coInstructors?: Array<{ id: string }> | null;
  groupLessonId?: string | null;
  student?: { id: string } | null;
  cancellationKind?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | Date | null;
  agendaDismissedAt?: string | Date | null;
};

export type CancelledLessonBlock<T extends CancelledBlockAppointment> = {
  /** La guida annullata mostrata: la più recente se più d'una cade lì. */
  appointment: T;
  /** Tutte le guide annullate raccolte nel blocco (la X le toglie tutte). */
  ids: string[];
  instructorId: string;
};

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const ms = (value: string | Date) => (value instanceof Date ? value : new Date(value)).getTime();
const endMs = (a: { startsAt: string | Date; endsAt?: string | Date | null }) =>
  a.endsAt ? ms(a.endsAt) : ms(a.startsAt) + DEFAULT_DURATION_MS;

const instructorOf = (a: CancelledBlockAppointment) => a.instructorId ?? a.instructor?.id ?? null;

/**
 * Le guide che diventano blocco: annullate dall'allievo o dalla segreteria.
 * Restano fuori le cancellazioni d'ufficio (malattia, ferie, istruttore o
 * veicolo disattivato, «Elimina», account cancellato), i festivi, le guide
 * rimosse dallo storico, gli esami e i posti nelle guide di gruppo.
 */
export function isCancelledBlockCandidate(a: CancelledBlockAppointment) {
  if ((a.status ?? "").toLowerCase() !== "cancelled") return false;
  if (a.agendaDismissedAt) return false;
  if (a.type === "esame" || a.type === "group_lesson" || a.groupLessonId) return false;
  if (!instructorOf(a)) return false;
  const studentId = a.student?.id ?? "";
  if (!studentId || studentId.startsWith("exam-empty") || studentId.startsWith("gl-empty")) return false;
  if (a.cancellationKind === "manual_cancel") return true;
  // «Annulla guida» dalla segreteria con colpa della scuola.
  return a.cancellationKind === "operational_cancel" && a.cancellationReason === "school_fault";
}

/** Una riga che tiene occupato l'orario: tutto ciò che in agenda si vede. */
const occupiesSlot = (a: CancelledBlockAppointment) =>
  (a.status ?? "").toLowerCase() !== "cancelled" && a.cancellationKind !== "record_cleanup";

const involvesInstructor = (a: CancelledBlockAppointment, instructorId: string) =>
  instructorOf(a) === instructorId || (a.coInstructors ?? []).some((co) => co.id === instructorId);

/** true se un'altra guida attiva dello stesso istruttore copre l'orario. */
export function isCancelledLessonReplaced(
  cancelled: CancelledBlockAppointment,
  appointments: CancelledBlockAppointment[],
) {
  const instructorId = instructorOf(cancelled);
  if (!instructorId) return false;
  const start = ms(cancelled.startsAt);
  const end = endMs(cancelled);
  return appointments.some(
    (other) =>
      other.id !== cancelled.id &&
      occupiesSlot(other) &&
      involvesInstructor(other, instructorId) &&
      ms(other.startsAt) < end &&
      endMs(other) > start,
  );
}

/**
 * I blocchi da disegnare. Le annullate che si sovrappongono sullo stesso
 * istruttore (l'allievo annulla, un altro prenota e annulla a sua volta)
 * diventano UN blocco: si mostra la più recente, la X le toglie tutte.
 */
export function findCancelledLessonBlocks<T extends CancelledBlockAppointment>(
  appointments: T[],
): CancelledLessonBlock<T>[] {
  const open = appointments
    .filter((a) => isCancelledBlockCandidate(a) && !isCancelledLessonReplaced(a, appointments))
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt));

  const blocks: Array<CancelledLessonBlock<T> & { end: number }> = [];
  for (const a of open) {
    const instructorId = instructorOf(a)!;
    const start = ms(a.startsAt);
    const group = blocks.find((b) => b.instructorId === instructorId && start < b.end && endMs(a) > ms(b.appointment.startsAt));
    if (!group) {
      blocks.push({ appointment: a, ids: [a.id], instructorId, end: endMs(a) });
      continue;
    }
    group.ids.push(a.id);
    group.end = Math.max(group.end, endMs(a));
    const cancelledAt = (x: T) => (x.cancelledAt ? ms(x.cancelledAt) : 0);
    if (cancelledAt(a) > cancelledAt(group.appointment)) group.appointment = a;
  }
  return blocks.map(({ end: _end, ...block }) => block);
}

/** "6 giorni prima", "3 ore prima", "40 minuti prima", "dopo l'inizio". */
export function cancellationNoticeLabel(startsAt: string | Date, cancelledAt: string | Date | null | undefined) {
  if (!cancelledAt) return null;
  const minutes = Math.round((ms(startsAt) - ms(cancelledAt)) / 60_000);
  if (minutes <= 0) return "Dopo l'inizio della guida";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minuto" : "minuti"} prima`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "ora" : "ore"} prima`;
  const days = Math.floor(hours / 24);
  return `${days} giorni prima`;
}

/** Sotto le 24 ore il preavviso è corto: il riquadro lo segnala. */
export const isShortNotice = (startsAt: string | Date, cancelledAt: string | Date | null | undefined) =>
  !!cancelledAt && ms(startsAt) - ms(cancelledAt) < 24 * 60 * 60 * 1000;

export type CancelledByRole = "student" | "owner" | "instructor" | "staff";

export function cancelledByLabel(by: { name: string | null; role: CancelledByRole } | null | undefined) {
  if (!by) return "Non registrato";
  if (by.role === "student") return "L'allievo, dall'app";
  const who = by.role === "owner" ? "Segreteria" : by.role === "instructor" ? "Istruttore" : "Staff";
  return by.name ? `${who} · ${by.name}` : who;
}

export function lateCancellationLabel(action: string | null | undefined) {
  if (action === "charged") return "Penale addebitata";
  if (action === "dismissed") return "Penale condonata";
  return null;
}

/**
 * REG-624: la nota del blocco annullato è dell'ufficio. Arriva solo all'agenda
 * web (`officeNotes=1`) di titolare e segreteria; all'app e agli istruttori la
 * rotta bootstrap la toglie. La cache resta una per autoscuola: il filtro sta
 * dopo la cache, e `meta.officeNotes` dice al client se può scriverla.
 * Vale anche per le note del giorno (REG-632): fuori dall'ufficio spariscono.
 */
export function withOfficeNotes<T extends { appointments?: unknown[]; meta?: Record<string, unknown> }>(
  data: T,
  officeNotes: boolean,
): T {
  const { dayNotes, ...rest } = data as T & { dayNotes?: unknown };
  return {
    ...(rest as T),
    ...(officeNotes && dayNotes !== undefined ? { dayNotes } : {}),
    appointments: officeNotes
      ? data.appointments
      : data.appointments?.map((row) => {
          const { agendaNote: _note, ...rest } = row as Record<string, unknown>;
          return rest;
        }),
    meta: { ...data.meta, officeNotes },
  };
}
