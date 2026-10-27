import { prisma } from "@/db/prisma";

/**
 * REG-637 — storico pagamento di una guida: QUANDO è stata segnata pagata / da
 * pagare e DA CHI.
 *
 * Due fonti, fuse e ordinate dalla più recente:
 *  - `AutoscuolaAppointmentPaymentEvent`: i gesti manuali "Segna pagata" /
 *    "Segna da pagare" (web e app), scritti da `setManualPaymentStatus`.
 *  - `AutoscuolaStudentLessonCreditLedger`: la copertura con un credito (e la
 *    sua restituzione). C'era già, con data e autore, quindi le guide coperte da
 *    credito hanno lo storico anche da prima di REG-637.
 *
 * I cambi automatici (la guida nasce "da pagare", penale tardiva, annullo) non
 * sono gesti di nessuno e non compaiono: lo stato di partenza non si racconta.
 * Le guide segnate a mano prima di REG-637 non hanno righe → storico vuoto, e la
 * UI mostra solo l'etichetta come prima (niente "data non disponibile").
 *
 * Solo per lo staff: l'allievo non vede lo stato pagamento manuale.
 */

export type PaymentHistoryKind =
  | "paid"
  | "unpaid"
  | "cleared"
  | "credit_applied"
  | "credit_refunded";

export type PaymentHistoryEvent = {
  id: string;
  kind: PaymentHistoryKind;
  /** ISO 8601. */
  at: string;
  /** Nome di chi l'ha fatto; null = utente eliminato o gesto di sistema. */
  actorName: string | null;
};

const manualKind = (toStatus: string | null): PaymentHistoryKind =>
  toStatus === "paid" ? "paid" : toStatus === "unpaid" ? "unpaid" : "cleared";

export const toPaymentHistoryEvent = (row: {
  id: string;
  toStatus: string | null;
  createdAt: Date;
  actor: { name: string | null } | null;
}): PaymentHistoryEvent => ({
  id: row.id,
  kind: manualKind(row.toStatus),
  at: row.createdAt.toISOString(),
  actorName: row.actor?.name?.trim() || null,
});

/**
 * Storico di più guide in due letture (eventi manuali + ledger crediti), già
 * diviso per guida. Le guide senza storico non compaiono nella mappa.
 */
export async function loadPaymentHistories(
  companyId: string,
  appointmentIds: string[],
): Promise<Map<string, PaymentHistoryEvent[]>> {
  const out = new Map<string, PaymentHistoryEvent[]>();
  if (!appointmentIds.length) return out;

  const [manual, ledger] = await Promise.all([
    prisma.autoscuolaAppointmentPaymentEvent.findMany({
      where: { companyId, appointmentId: { in: appointmentIds } },
      select: {
        id: true,
        appointmentId: true,
        toStatus: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    prisma.autoscuolaStudentLessonCreditLedger.findMany({
      where: { companyId, appointmentId: { in: appointmentIds }, delta: { not: 0 } },
      select: {
        id: true,
        appointmentId: true,
        delta: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
  ]);

  const push = (appointmentId: string, event: PaymentHistoryEvent) => {
    const list = out.get(appointmentId);
    if (list) list.push(event);
    else out.set(appointmentId, [event]);
  };

  for (const row of manual) push(row.appointmentId, toPaymentHistoryEvent(row));
  for (const row of ledger) {
    if (!row.appointmentId) continue;
    push(row.appointmentId, {
      id: row.id,
      kind: row.delta < 0 ? "credit_applied" : "credit_refunded",
      at: row.createdAt.toISOString(),
      actorName: row.actor?.name?.trim() || null,
    });
  }

  for (const list of out.values()) list.sort((a, b) => b.at.localeCompare(a.at));
  return out;
}
