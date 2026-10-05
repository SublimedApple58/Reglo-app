/**
 * L'unico punto da cui Reglo manda un WhatsApp (REG-500).
 *
 * Perché esiste: fino a oggi gli invii passavano da `sendAutoscuolaWhatsApp`,
 * che parlava **direttamente con Twilio** in testo libero. Quel percorso è
 * rimasto acceso anche dopo che REG-500 aveva scritto lo stack nuovo su Telnyx,
 * perché nessuno l'ha mai innestato: in produzione ha prodotto 618 errori
 * `Twilio 401 authentication failed`, l'ultimo il giorno in cui è stato tolto.
 * Nel frattempo la UI mostrava WhatsApp come "In arrivo" — il cancello stava
 * solo davanti, il retro era aperto.
 *
 * Qui i cancelli sono tre, e sono tutti **prima** dell'invio:
 *  1. il canale è configurato? (`WHATSAPP_PROVIDER` & co.)
 *  2. esiste un template approvato per questo tipo di messaggio? Meta consente
 *     testo libero solo entro 24 ore da un messaggio dell'utente, e un
 *     promemoria per domani è per definizione fuori;
 *  3. quella persona ha revocato il consenso?
 *
 * Se uno dei tre dice no, il messaggio **non parte e viene registrato come
 * `skipped` con il motivo**. Non silenzio, non eccezioni: una riga che qualcuno
 * può leggere. È la differenza fra "non è partito" e "non lo sa nessuno".
 */
import { prisma } from "@/db/prisma";
import {
  deliverAndLog,
  logSkipped,
  type DeliveryAttempt,
} from "@/lib/autoscuole/delivery-log";
import { findUserByPhone } from "@/lib/autoscuole/whatsapp-consent";
import {
  isWhatsAppChannelAvailable,
  sendWhatsAppTemplate,
} from "@/lib/autoscuole/whatsapp-sender";
import {
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplateKind,
} from "@/lib/autoscuole/whatsapp-templates";

/** Il `kind` ha un template approvato? Se no, da qui non passa. */
export function hasWhatsAppTemplate(kind: string): kind is WhatsAppTemplateKind {
  return Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, kind);
}

/**
 * I tre cancelli, come funzione pura: `null` = si può mandare, altrimenti il
 * motivo per cui no, con le parole che finiranno nel registro.
 *
 * Sta qui separata dal resto perché è la regola vera, e una regola che decide
 * se un messaggio parte dev'essere leggibile e testabile senza un database
 * davanti.
 */
export function whatsAppSkipReason(input: {
  recipient: string;
  templateKind: string;
  channelAvailable: boolean;
  optedOut: boolean;
}): string | null {
  if (!input.recipient) return "destinatario mancante";
  if (!input.channelAvailable) {
    return "canale WhatsApp non configurato (WHATSAPP_PROVIDER e credenziali del fornitore)";
  }
  if (!hasWhatsAppTemplate(input.templateKind)) {
    return `nessun template approvato per "${input.templateKind}": fuori dalle 24 ore Meta non consente testo libero`;
  }
  if (input.optedOut) return "l'utente ha revocato il consenso WhatsApp";
  return null;
}

/** Nome dell'autoscuola, variabile di ogni template. Una query per company. */
const companyNames = new Map<string, string>();
async function companyName(companyId: string): Promise<string> {
  const cached = companyNames.get(companyId);
  if (cached) return cached;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  const name = company?.name ?? "la tua autoscuola";
  companyNames.set(companyId, name);
  return name;
}

export type WhatsAppDeliveryInput = {
  /** Valori delle variabili del template, per nome. `autoscuola` è automatico. */
  values: Record<string, string>;
  /**
   * Template da usare quando NON coincide con il `kind` del log. Serve agli
   * esami: a log restano `appointment_reminder_student` come email e push —
   * è lo stesso avviso — ma il testo approvato è un altro, perché l'esame non
   * porta mai l'orario.
   */
  templateKind?: WhatsAppTemplateKind;
};

/**
 * Manda il WhatsApp se si può, e in ogni caso lascia scritto cos'è successo.
 * Ritorna `true` solo se è partito davvero, così la cascata dei canali sa se
 * fermarsi o provare quello dopo.
 */
export async function deliverWhatsApp(
  attempt: Omit<DeliveryAttempt, "channel">,
  input: WhatsAppDeliveryInput,
): Promise<boolean> {
  const logged: DeliveryAttempt = { ...attempt, channel: "whatsapp" };
  const wanted = input.templateKind ?? logged.kind;

  // La revoca si legge solo se serve davvero: se il canale è spento o il
  // template non c'è, la query al database è sprecata.
  const channelAvailable = isWhatsAppChannelAvailable();
  const optedOut =
    channelAvailable && logged.recipient && hasWhatsAppTemplate(wanted)
      ? Boolean((await findUserByPhone(logged.recipient))?.whatsappOptOutAt)
      : false;

  const reason = whatsAppSkipReason({
    recipient: logged.recipient,
    templateKind: wanted,
    channelAvailable,
    optedOut,
  });
  if (reason) {
    await logSkipped(logged, reason);
    return false;
  }
  const templateKind = wanted as WhatsAppTemplateKind;

  const values = {
    ...input.values,
    autoscuola: input.values.autoscuola ?? (await companyName(logged.companyId)),
  };

  return deliverAndLog(logged, async (to) => {
    const result = await sendWhatsAppTemplate({ to, kind: templateKind, values });
    // `deliverAndLog` distingue riuscito/fallito dall'eccezione: il risultato
    // negativo del fornitore va trasformato, se no finirebbe a log come `sent`.
    if (!result.ok) throw new Error(result.reason);
    return result;
  });
}
