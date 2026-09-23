/**
 * Consenso WhatsApp e destino delle risposte (REG-500).
 *
 * Due cose che il livello di invio puro non può fare, perché richiedono il DB:
 *  - **non scrivere a chi ha detto STOP**;
 *  - **far leggere a qualcuno** quello che l'allievo risponde.
 *
 * La seconda è la più trascurata: finché non esisteva un webhook, un allievo che
 * rispondeva "posso spostare?" parlava nel vuoto. Peggio del silenzio: lui crede
 * di aver avvisato l'autoscuola.
 */
import { prisma } from "@/db/prisma";
import { normalizeToE164 } from "@/lib/phone-e164";
import {
  sendWhatsAppTemplate,
  type WhatsAppSendInput,
  type WhatsAppSendResult,
} from "@/lib/autoscuole/whatsapp-sender";

/** Cerca l'utente da un numero in arrivo, provando le forme in cui è salvato. */
export async function findUserByPhone(phone: string) {
  const normalized = normalizeToE164(phone);
  if (!normalized.ok) return null;
  const e164 = normalized.e164;
  // In anagrafica convivono `+393331234567`, `3331234567` e `393331234567`:
  // la normalizzazione a monte è in corso, qui si cercano tutte e tre.
  const withoutPlus = e164.slice(1);
  const national = withoutPlus.startsWith("39") ? withoutPlus.slice(2) : null;
  const candidates = [e164, withoutPlus, ...(national ? [national] : [])];
  return prisma.user.findFirst({
    where: { phone: { in: candidates } },
    select: { id: true, name: true, whatsappOptOutAt: true },
  });
}

/** Registra la revoca. Idempotente: una seconda STOP non sposta la data. */
export async function recordWhatsAppOptOut(phone: string): Promise<boolean> {
  const user = await findUserByPhone(phone);
  if (!user) return false;
  if (user.whatsappOptOutAt) return true;
  await prisma.user.update({
    where: { id: user.id },
    data: { whatsappOptOutAt: new Date() },
  });
  return true;
}

/** L'allievo torna a ricevere: lo sblocca la segreteria, o un suo "START". */
export async function clearWhatsAppOptOut(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { whatsappOptOutAt: null } });
}

/**
 * Unico punto da cui passano gli invii WhatsApp dell'app.
 *
 * Controlla la revoca **prima** di spendere un messaggio: scrivere a chi ha
 * detto STOP non è solo scortese, fa scendere la quality rating di Meta e alla
 * lunga fa bloccare il mittente per tutte le autoscuole insieme.
 */
export async function sendWhatsAppToPhone(
  input: WhatsAppSendInput,
): Promise<WhatsAppSendResult & { optedOut?: true }> {
  const user = await findUserByPhone(input.to);
  if (user?.whatsappOptOutAt) {
    return {
      ok: false,
      reason: "l'utente ha chiesto di non ricevere messaggi WhatsApp",
      retriable: false,
      optedOut: true,
    };
  }
  return sendWhatsAppTemplate(input);
}
