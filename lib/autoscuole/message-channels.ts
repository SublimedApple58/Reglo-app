/**
 * REG-767 — i canali **per singola comunicazione**.
 *
 * Prima l'autoscuola sceglieva i canali una volta sola per tutti (allievi o
 * istruttori, `studentReminderChannels` / `instructorReminderChannels`) e ogni
 * messaggio scendeva la cascata App → WhatsApp → Email fermandosi al primo che
 * consegnava (REG-500). Da REG-767 (decisione di Tiziano del 24/11/2026):
 *
 * - ogni comunicazione ha i suoi canali, nella chiave `channelsByMessage` dei
 *   limits del CompanyService;
 * - una comunicazione parte **su tutti e soli** i canali accesi sulla sua riga:
 *   niente cascata, niente riserva;
 * - nessun canale acceso = la comunicazione non parte.
 *
 * Chi non ha mai toccato la riga parte con **solo l'App** (decisione di Tiziano
 * del 24/11/2026; WhatsApp ed Email si accendono riga per riga). Le chiavi sono i `kind`
 * già usati dagli invii e dai modelli WhatsApp (`whatsapp-templates.ts`).
 *
 * REG-771: una chiave può non coincidere col `kind`. Lo spostamento di una
 * guida avvisato all'istruttore ha `kind: "appointment_rescheduled"` (è quello
 * che legge il mobile) ma la sua riga, `appointment_rescheduled_instructor`:
 * prima seguiva di nascosto la riga «Guida spostata» degli allievi. Lo stesso
 * per il ritiro di un allievo da una guida di gruppo, avvisato all'istruttore
 * con `kind: "appointment_cancelled"` e riga `appointment_cancelled_instructor`.
 * Chi invia passa `channelKey` a `notifyAutoscuolaUser`.
 */
import type { DeliveryChannel } from "@/lib/autoscuole/delivery-log";
import {
  sendableTemplateName,
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplate,
} from "@/lib/autoscuole/whatsapp-templates";

export const CHANNEL_ORDER: readonly DeliveryChannel[] = ["push", "whatsapp", "email"];

/** Le righe mai toccate partono così: solo l'App. */
export const DEFAULT_MESSAGE_CHANNELS: readonly DeliveryChannel[] = ["push"];

export const MESSAGE_CHANNEL_KEYS = [
  "appointment_reminder_student",
  "morning_reminder_student",
  "day_before_reminder_student",
  "appointment_created",
  "appointment_cancelled",
  "appointment_rescheduled",
  "appointment_location_changed",
  "exam_scheduled",
  "appointment_reminder_instructor",
  "appointment_rescheduled_instructor",
  "appointment_cancelled_instructor",
] as const;

export type MessageChannelKey = (typeof MESSAGE_CHANNEL_KEYS)[number];

export const isMessageChannelKey = (value: string): value is MessageChannelKey =>
  (MESSAGE_CHANNEL_KEYS as readonly string[]).includes(value);

/** A chi va la comunicazione. */
export const MESSAGE_AUDIENCE: Record<MessageChannelKey, "student" | "instructor"> = {
  appointment_reminder_student: "student",
  morning_reminder_student: "student",
  day_before_reminder_student: "student",
  appointment_created: "student",
  appointment_cancelled: "student",
  appointment_rescheduled: "student",
  appointment_location_changed: "student",
  exam_scheduled: "student",
  appointment_reminder_instructor: "instructor",
  appointment_rescheduled_instructor: "instructor",
  appointment_cancelled_instructor: "instructor",
};

/**
 * Il booleano che già accendeva o spegneva la comunicazione, dove c'era. Resta
 * la fonte di verità per «parte o no»: le impostazioni lo scrivono a `false`
 * quando sulla riga si spegne l'ultimo canale, e a `true` quando se ne riaccende
 * uno. Le righe senza booleano sono spente dalla sola lista vuota.
 */
export const MESSAGE_ENABLED_FLAG: Partial<Record<MessageChannelKey, string>> = {
  morning_reminder_student: "studentReminderMorningEnabled",
  day_before_reminder_student: "studentReminderDayBeforeEnabled",
  appointment_created: "studentCreationNoticeEnabled",
  appointment_reminder_instructor: "instructorReminderEnabled",
};

/** I flag con default acceso quando assenti (gli altri sono spenti di default). */
const FLAG_DEFAULT_ON = new Set(["instructorReminderEnabled"]);

const isChannel = (value: unknown): value is DeliveryChannel =>
  value === "push" || value === "whatsapp" || value === "email";

/** Lista pulita, senza doppioni, nell'ordine App → WhatsApp → Email. */
export const normalizeChannelList = (value: readonly unknown[]): DeliveryChannel[] =>
  CHANNEL_ORDER.filter((channel) => value.some((item) => item === channel && isChannel(item)));

/**
 * I canali salvati per questa comunicazione, o il valore di partenza (solo
 * App). Una lista vuota salvata vuol dire «spenta» e resta vuota.
 */
export function storedMessageChannels(
  limits: Record<string, unknown>,
  key: MessageChannelKey,
): DeliveryChannel[] {
  const byMessage = limits.channelsByMessage;
  if (byMessage && typeof byMessage === "object" && !Array.isArray(byMessage)) {
    const own = (byMessage as Record<string, unknown>)[key];
    if (Array.isArray(own)) return normalizeChannelList(own);
  }
  // Valore di partenza deciso da Tiziano il 24/11/2026: solo l'App. Con
  // l'invio su tutti i canali accesi, ereditare la vecchia scelta globale
  // (quasi sempre tutti e tre) avrebbe triplicato ogni messaggio.
  return [...DEFAULT_MESSAGE_CHANNELS];
}

/** Vero se la comunicazione è accesa dal suo booleano (dove esiste). */
export function messageFlagOn(limits: Record<string, unknown>, key: MessageChannelKey): boolean {
  const flag = MESSAGE_ENABLED_FLAG[key];
  if (!flag) return true;
  return FLAG_DEFAULT_ON.has(flag) ? limits[flag] !== false : limits[flag] === true;
}

/**
 * I canali su cui la comunicazione parte davvero oggi: nessuno se è spenta,
 * altrimenti quelli della sua riga. Il filtro «esiste un modello WhatsApp?»
 * resta a valle (`deliverWhatsApp` registra il motivo), come prima.
 */
export function effectiveMessageChannels(
  limits: Record<string, unknown>,
  key: MessageChannelKey,
): DeliveryChannel[] {
  if (!messageFlagOn(limits, key)) return [];
  return storedMessageChannels(limits, key);
}

/**
 * WhatsApp si può accendere su questa riga? Serve un modello Meta utility
 * approvato. Le righe senza modello nel registro (oggi «Guida spostata» e
 * «Guida annullata» degli istruttori, REG-771) mostrano solo App ed Email.
 */
export function whatsappTemplateReady(key: MessageChannelKey): boolean {
  const template = (WHATSAPP_TEMPLATES as Record<string, WhatsAppTemplate>)[key];
  return template ? sendableTemplateName(template) !== null : false;
}

/** Per la pagina: i canali accesi di ogni riga (vuota = spenta). */
export function messageChannelsForSettings(
  limits: Record<string, unknown>,
): Record<MessageChannelKey, DeliveryChannel[]> {
  return Object.fromEntries(
    MESSAGE_CHANNEL_KEYS.map((key) => [key, effectiveMessageChannels(limits, key)]),
  ) as Record<MessageChannelKey, DeliveryChannel[]>;
}

/** Per la pagina: su quali righe WhatsApp ha un modello utilizzabile. */
export function whatsappReadyByMessage(): Record<MessageChannelKey, boolean> {
  return Object.fromEntries(
    MESSAGE_CHANNEL_KEYS.map((key) => [key, whatsappTemplateReady(key)]),
  ) as Record<MessageChannelKey, boolean>;
}
