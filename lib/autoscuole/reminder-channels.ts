/**
 * Chi decide su quali canali esce una comunicazione (REG-604).
 *
 * Prima di REG-604 questa conoscenza stava in due posti: `communications.ts`
 * la usava per i promemoria, e **tutti gli altri invii non la usavano
 * affatto** — mandavano push ed email a prescindere da cosa l'autoscuola
 * avesse scelto in Impostazioni → Promemoria e notifiche. Da qui in avanti
 * esiste un solo posto che risponde alla domanda «quali canali per questa
 * autoscuola?», e ci passano tutti.
 */
import type { DeliveryChannel } from "@/lib/autoscuole/delivery-log";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";

/**
 * Quando l'autoscuola non ha scelto, valgono tutti e tre. È il default storico
 * dei promemoria e non va cambiato: un'autoscuola che non ha mai aperto quelle
 * impostazioni non deve perdere un canale.
 */
export const DEFAULT_REMINDER_CHANNELS = ["push", "whatsapp", "email"] as const;

export type ChannelAudience = "student" | "instructor" | "owner";

export const parseReminderChannels = (value: unknown): DeliveryChannel[] => {
  if (!Array.isArray(value)) return [...DEFAULT_REMINDER_CHANNELS];
  const channels = value.filter(
    (item): item is DeliveryChannel =>
      item === "push" || item === "whatsapp" || item === "email",
  );
  const unique = Array.from(new Set(channels));
  return unique.length ? unique : [...DEFAULT_REMINDER_CHANNELS];
};

/**
 * I canali che l'autoscuola ha configurato per questo destinatario.
 *
 * `owner` non ha un'impostazione propria: gli avvisi al titolare (allievi
 * pronti per l'esame, auto-cancellazioni) sono strumenti di lavoro suoi, non
 * comunicazioni ai suoi utenti. Passano comunque da qui, così il giorno in cui
 * nasce `ownerNotificationChannels` il gancio c'è già e non serve ritoccare i
 * punti di invio.
 */
export const getConfiguredChannels = async (
  companyId: string,
  audience: ChannelAudience,
): Promise<DeliveryChannel[]> => {
  if (audience === "owner") return [...DEFAULT_REMINDER_CHANNELS];
  const limits = await getCachedCompanyServiceLimits(companyId);
  return parseReminderChannels(
    audience === "instructor"
      ? limits.instructorReminderChannels
      : limits.studentReminderChannels,
  );
};

/**
 * I canali su cui questo messaggio può davvero uscire: **configurati ∩
 * supportati**.
 *
 * `supports` è la dichiarazione tecnica del punto di invio — «per questo
 * messaggio esistono un push e un'email, non un template WhatsApp approvato».
 * Tenerla separata dai canali configurati è ciò che permette di accendere
 * WhatsApp domani cambiando una riga in un punto di invio, invece di
 * ripassare da tutti.
 */
export const resolveChannels = async (
  companyId: string,
  audience: ChannelAudience,
  supports: readonly DeliveryChannel[],
): Promise<DeliveryChannel[]> => {
  const configured = await getConfiguredChannels(companyId, audience);
  return supports.filter((channel) => configured.includes(channel));
};
