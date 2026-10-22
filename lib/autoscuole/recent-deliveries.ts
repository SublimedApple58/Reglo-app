/**
 * «Ultimi invii» in Impostazioni → Promemoria e notifiche (REG-500).
 *
 * Il registro (`AutoscuolaMessageLog`) ha una riga per **tentativo**: con la
 * cascata un promemoria a chi non ha l'app lascia una push `skipped` e un
 * WhatsApp `sent`. All'autoscuola interessa il **messaggio**: a chi, cosa, su
 * quale canale è arrivato — o perché non è arrivato. Qui si raggruppano i
 * tentativi in messaggi. È la cura contro il fallimento muto che ha aperto
 * REG-500: prima nessuno sapeva che i WhatsApp non partivano da mesi.
 */
import type { DeliveryChannel } from "@/lib/autoscuole/delivery-log";

export type DeliveryLogRow = {
  kind: string;
  channel: string;
  status: string;
  error: string | null;
  appointmentId: string | null;
  studentId: string | null;
  recipient: string;
  createdAt: Date;
};

export type RecentDelivery = {
  at: string;
  label: string;
  studentName: string | null;
  /** Il canale che ha consegnato, `null` se non è arrivato. */
  channel: DeliveryChannel | null;
  /** Perché non è arrivato, in parole dell'autoscuola. */
  reason: string | null;
};

const KIND_LABELS: Record<string, string> = {
  appointment_reminder_student: "Promemoria guida",
  morning_reminder_student: "Promemoria mattutino",
  day_before_reminder_student: "Promemoria del giorno prima",
  appointment_reminder_instructor: "Promemoria all'istruttore",
  appointment_cancelled: "Guida annullata",
  appointment_rescheduled: "Guida spostata",
  appointment_location_changed: "Cambio luogo",
  exam_scheduled: "Esame fissato",
  case_deadline: "Scadenza documento",
};

export const deliveryKindLabel = (kind: string) => KIND_LABELS[kind] ?? "Avviso";

/** I motivi tecnici del registro, detti come li direbbe la segreteria. */
export function friendlyReason(channel: string, error: string | null): string | null {
  const text = (error ?? "").toLowerCase();
  if (channel === "push") {
    if (text.includes("nessun dispositivo")) return "non ha l'app";
    return null;
  }
  if (channel === "whatsapp") {
    if (text.includes("revocato") || text.includes("non ricevere") || text.includes("40300")) {
      return "ha chiesto di non ricevere WhatsApp";
    }
    if (text.includes("pilota")) return "WhatsApp non ancora attivo per la tua autoscuola";
    if (text.includes("destinatario mancante")) return "nessun numero in anagrafica";
    if (text.includes("numero")) return "numero non valido per WhatsApp";
    return null;
  }
  if (channel === "email") {
    if (text.includes("destinatario mancante")) return "nessuna email in anagrafica";
    return null;
  }
  return null;
}

const SAME_MESSAGE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Raggruppa i tentativi (dal più recente) in messaggi. Due righe sono lo
 * stesso messaggio se hanno stesso tipo, guida e allievo e sono nate a meno di
 * due minuti l'una dall'altra: la cascata scende i gradini in pochi secondi.
 */
export function groupDeliveries(
  rows: DeliveryLogRow[],
  names: Map<string, string>,
  limit: number,
): RecentDelivery[] {
  type Group = { first: DeliveryLogRow; rows: DeliveryLogRow[] };
  const groups: Group[] = [];
  for (const row of rows) {
    const key = `${row.kind}|${row.appointmentId ?? ""}|${row.studentId ?? row.recipient}`;
    const group = groups.find(
      (g) =>
        `${g.first.kind}|${g.first.appointmentId ?? ""}|${g.first.studentId ?? g.first.recipient}` === key &&
        Math.abs(g.first.createdAt.getTime() - row.createdAt.getTime()) < SAME_MESSAGE_WINDOW_MS,
    );
    if (group) group.rows.push(row);
    else groups.push({ first: row, rows: [row] });
    if (groups.length > limit) break;
  }

  return groups.slice(0, limit).map(({ first, rows: attempts }) => {
    const delivered = attempts.find((attempt) => attempt.status === "sent");
    const reasons = attempts
      .map((attempt) => friendlyReason(attempt.channel, attempt.error))
      .filter((reason): reason is string => Boolean(reason));
    return {
      at: first.createdAt.toISOString(),
      label: deliveryKindLabel(first.kind),
      studentName: first.studentId ? names.get(first.studentId) ?? null : null,
      channel: delivered ? (delivered.channel as DeliveryChannel) : null,
      reason: delivered
        ? null
        : reasons.length
          ? Array.from(new Set(reasons)).join(" · ")
          : "nessun canale disponibile",
    };
  });
}
