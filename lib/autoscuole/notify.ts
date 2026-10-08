/**
 * Il punto di passaggio unico delle comunicazioni-evento (REG-604).
 *
 * Una chiamata, N canali, una riga di registro per canale. Prima esistevano
 * **21 punti di invio** che si scrivevano la cascata a mano — di solito una
 * push seguita da un'email — e nessuno di loro guardava i canali configurati
 * dall'autoscuola: quella impostazione governava solo i promemoria.
 *
 * ## Perché non sta dentro `communications.ts`
 *
 * I promemoria hanno una cascata loro, con dentro il motore delle regole e i
 * template di messaggio configurabili. Quelli sono **già** conformi ai canali.
 * Qui c'è il resto: annullamenti, spostamenti, chiusure, offerte, pagamenti,
 * esami. Il pezzo condiviso fra i due mondi è `reminder-channels.ts`, che è
 * l'unico posto che sa cosa vuol dire «i canali di quest'autoscuola».
 *
 * ## WhatsApp
 *
 * La struttura lo prevede già, ma oggi **nessuno** di questi messaggi ha un
 * template approvato da Meta, e fuori dalla finestra di 24 ore Meta non
 * consente testo libero. Per questo `supports` di default è `["push","email"]`:
 * quando il template arriverà, al punto di invio basterà allargare `supports` e
 * passare `whatsapp` — qui non cambia niente.
 */
import type { DeliveryChannel } from "@/lib/autoscuole/delivery-log";
import { deliverAndLog } from "@/lib/autoscuole/delivery-log";
import { deliverWhatsApp } from "@/lib/autoscuole/whatsapp-delivery";
import { PUSH_ONLY_KINDS } from "@/lib/autoscuole/whatsapp-templates";
import type { WhatsAppTemplateKind } from "@/lib/autoscuole/whatsapp-templates";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import { sendDynamicEmail } from "@/email";
import type { ChannelAudience } from "@/lib/autoscuole/reminder-channels";
import { resolveChannels } from "@/lib/autoscuole/reminder-channels";

/** I canali tecnicamente possibili oggi per un messaggio-evento. */
export const EVENT_CHANNELS = ["push", "email"] as const;

/** Messaggi che esistono solo come push: non c'è un'email da mandare. */
export const PUSH_ONLY = ["push"] as const;

export type NotifyRecipient = {
  userId: string;
  email?: string | null;
  phone?: string | null;
};

export type NotifyInput = {
  companyId: string;
  /**
   * Un solo valore per due usi: finisce nel registro **e** in `data.kind`
   * della push, che è quello che il mobile legge per l'inbox. Tenerli separati
   * era un modo di farli divergere.
   */
  kind: string;
  audience: ChannelAudience;
  recipient: NotifyRecipient;
  title: string;
  body: string;
  /** Default `EVENT_CHANNELS`. Passa `PUSH_ONLY` per i messaggi senza email. */
  supports?: readonly DeliveryChannel[];
  /**
   * Canali già risolti dal chiamante, che scavalcano la lettura
   * dell'impostazione.
   *
   * Serve ai tre messaggi di **offerta** — posto libero, invito a guida di
   * gruppo, richiesta di sostituzione — che hanno un'impostazione propria,
   * `slotFillChannels`, e la rispettavano già da prima di REG-604. Tirarli
   * sotto `studentReminderChannels` sarebbe stato annullare una scelta di
   * prodotto deliberata (le offerte hanno un'economia di canale diversa dai
   * promemoria: vedi `PUSH_ONLY_KINDS`). Passano da qui per avere un solo
   * percorso di invio e il registro, non per cambiare canale.
   */
  channels?: readonly DeliveryChannel[];
  /**
   * WhatsApp, quando il canale è fra quelli attivi.
   *
   * - `logKind`: con che nome registrare il tentativo, se diverso da `kind`.
   *   I tre messaggi di offerta lo usano per conservare le righe che
   *   scrivevano già prima di REG-604.
   * - `templateKind`: il template approvato da Meta. **Oggi nessuno di questi
   *   messaggi ne ha uno**, quindi resta vuoto e `deliverWhatsApp` registra
   *   uno `skipped` col motivo — che è esattamente il comportamento di prima
   *   (REG-500). Il giorno in cui il template esiste, si valorizza qui e
   *   l'invio parte senza altre modifiche.
   */
  whatsapp?: {
    logKind?: string;
    templateKind?: WhatsAppTemplateKind;
    values: Record<string, string>;
  };
  /** Payload della push. `kind` viene aggiunto da qui, non va ripetuto. */
  data?: Record<string, unknown>;
  appointmentId?: string | null;
  /** Oggetto dell'email, se diverso dal titolo (che porta l'emoji). */
  emailSubject?: string;
};

const pushOnlyKinds = new Set<string>(PUSH_ONLY_KINDS);

/**
 * Manda il messaggio sui canali attivi. **Non lancia mai**: un canale caduto
 * non deve fermare gli altri né l'operazione che l'ha generato.
 */
export async function notifyAutoscuolaUser(input: NotifyInput): Promise<void> {
  const supports = input.supports ?? EVENT_CHANNELS;
  const channels = input.channels
    ? supports.filter((channel) => input.channels!.includes(channel))
    : await resolveChannels(input.companyId, input.audience, supports);
  if (!channels.length) return;

  const attempt = {
    companyId: input.companyId,
    kind: input.kind,
    appointmentId: input.appointmentId ?? null,
    studentId: input.audience === "student" ? input.recipient.userId : null,
    body: input.body,
  };

  if (channels.includes("push")) {
    await deliverAndLog(
      { ...attempt, channel: "push", recipient: input.recipient.userId },
      (userId) =>
        sendAutoscuolaPushToUsers({
          companyId: input.companyId,
          userIds: [userId],
          title: input.title,
          body: input.body,
          data: { kind: input.kind, ...(input.data ?? {}) },
        }),
    );
  }

  if (channels.includes("email")) {
    await deliverAndLog(
      { ...attempt, channel: "email", recipient: input.recipient.email ?? "" },
      (to) =>
        sendDynamicEmail({
          to,
          subject: input.emailSubject ?? input.title,
          body: input.body,
        }),
    );
  }

  // Un cancello oltre ai canali: i messaggi esclusi da WhatsApp per scelta —
  // gli inviti, decisione del 21/09 per costo e rischio di segnalazione. Il
  // secondo cancello, «esiste un template approvato?», lo tiene già
  // `deliverWhatsApp`, che in caso negativo registra il motivo invece di
  // sbattere contro il fornitore.
  if (channels.includes("whatsapp") && input.whatsapp && !pushOnlyKinds.has(input.kind)) {
    await deliverWhatsApp(
      {
        ...attempt,
        kind: input.whatsapp.logKind ?? input.kind,
        recipient: input.recipient.phone ?? "",
      },
      {
        values: input.whatsapp.values,
        ...(input.whatsapp.templateKind ? { templateKind: input.whatsapp.templateKind } : {}),
      },
    );
  }
}

/**
 * Lo stesso messaggio a più persone. Serio: in serie, non in parallelo — ogni
 * invio scrive una riga di registro, e N invii paralleli su un invito di
 * gruppo da 180 destinatari aprirebbero 360 scritture insieme.
 */
export async function notifyAutoscuolaUsers(
  recipients: NotifyRecipient[],
  input: Omit<NotifyInput, "recipient">,
): Promise<void> {
  for (const recipient of recipients) {
    await notifyAutoscuolaUser({ ...input, recipient });
  }
}
