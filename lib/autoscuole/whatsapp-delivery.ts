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
import { findUserByPhone, recordWhatsAppOptOut } from "@/lib/autoscuole/whatsapp-consent";
import {
  isStagingTestRecipient,
  isWhatsAppChannelAvailable,
  isWhatsAppEnabledForCompany,
  sendWhatsAppTemplate,
} from "@/lib/autoscuole/whatsapp-sender";
import { externalSendsDisabled } from "@/lib/app-env";
import {
  WHATSAPP_TEMPLATES,
  sendableTemplateName,
  type WhatsAppTemplate,
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
  /** Il pilota esclude questa autoscuola (`WHATSAPP_PILOT_COMPANY_IDS`). */
  outsidePilot?: boolean;
  /** Solo per i test: il template da valutare al posto di quello del registro. */
  template?: WhatsAppTemplate;
}): string | null {
  if (!input.recipient) return "destinatario mancante";
  if (!input.channelAvailable) {
    return "canale WhatsApp non configurato (WHATSAPP_PROVIDER e credenziali del fornitore)";
  }
  if (input.outsidePilot) {
    return "WhatsApp in pilota su altre autoscuole (WHATSAPP_PILOT_COMPANY_IDS)";
  }
  if (!hasWhatsAppTemplate(input.templateKind)) {
    return `nessun template approvato per "${input.templateKind}": fuori dalle 24 ore Meta non consente testo libero`;
  }
  const template: WhatsAppTemplate = input.template ?? WHATSAPP_TEMPLATES[input.templateKind];
  // Si manda la versione corrente se è approvata e utility, se no la
  // precedente alle stesse condizioni. Meta può riclassificare marketing un
  // template sottomesso come utility: costa di più, chiede un opt-in esplicito
  // e ha limiti di consegna per utente — non lo mandiamo, la cascata ripiega
  // sull'email (decisione 22/10).
  if (!sendableTemplateName(template)) {
    const versions = [template, ...(template.previous ? [template.previous] : [])]
      .map((v) => `${v.name}: ${v.approval === "approved" ? v.category : v.approval}`)
      .join(", ");
    return `nessuna versione approvata e utility del template (${versions})`;
  }
  if (input.optedOut) return "l'utente ha revocato il consenso WhatsApp";
  return null;
}

/**
 * `nome`, la prima variabile di ogni template: il nome di battesimo, perché i
 * testi cominciano con «Ciao …» e il cognome lì suona come una raccomandata.
 *
 * Sta qui, accanto a `companyName`, perché `nome` e `autoscuola` sono le due
 * variabili che hanno **tutti** i template: chi aggiunge un punto di invio deve
 * trovarle in un posto solo. `communications.ts` tiene il suo `parseNameParts`
 * perché lì serve anche il cognome, per l'email.
 */
export function firstNameFor(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const clean = (user.name ?? "").trim().replace(/\s+/g, " ");
  if (clean) return clean.split(" ")[0];
  const localPart = (user.email ?? "").split("@")[0];
  if (localPart) return localPart.slice(0, 1).toUpperCase() + localPart.slice(1);
  return "Allievo";
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
    outsidePilot: channelAvailable && !isWhatsAppEnabledForCompany(logged.companyId),
  });
  if (reason) {
    await logSkipped(logged, reason);
    return false;
  }
  const templateKind = wanted as WhatsAppTemplateKind;

  // `autoscuola` si riempie **solo** se il template la dichiara. Dal 16/10
  // nessuno dei dieci la usa — i messaggi non sono firmati dall'autoscuola —
  // e riempirla comunque vorrebbe dire una query per ogni invio per un valore
  // che nessuno legge. Il gancio resta per il giorno in cui servirà.
  // Il cast serve perché oggi nessun template dichiara `autoscuola`: senza, il
  // tipo delle variabili è l'unione dei nomi esistenti e TypeScript rifiuta il
  // confronto. È il tipo che dice che il gancio è spento, non un errore.
  const needsCompanyName =
    (WHATSAPP_TEMPLATES[templateKind].variables as readonly string[]).includes(
      "autoscuola",
    ) && !input.values.autoscuola;
  const values = needsCompanyName
    ? { ...input.values, autoscuola: await companyName(logged.companyId) }
    : input.values;

  // Staging: senza questo, l'invio "riuscito" in modalità no-op fermerebbe la
  // cascata come se il messaggio fosse arrivato.
  if (externalSendsDisabled() && !isStagingTestRecipient(logged.recipient)) {
    await logSkipped(logged, "invii esterni disattivati in questo ambiente");
    return false;
  }

  return deliverAndLog(logged, async (to) => {
    const result = await sendWhatsAppTemplate({ to, kind: templateKind, values });
    // `deliverAndLog` distingue riuscito/fallito dall'eccezione: il risultato
    // negativo del fornitore va trasformato, se no finirebbe a log come `sent`.
    if (!result.ok) {
      // Telnyx ha una revoca che noi non avevamo (uno STOP arrivato quando
      // il webhook non lo leggeva, o un'altra via): la riportiamo, così i
      // prossimi messaggi vengono saltati prima di spendere un tentativo.
      if (result.blockedByOptOut) await recordWhatsAppOptOut(to);
      throw new Error(result.reason);
    }
    return result;
  });
}
