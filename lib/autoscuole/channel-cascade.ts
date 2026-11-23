/**
 * La cascata dei canali (REG-500): un messaggio, un canale.
 *
 * La UI di Impostazioni → Promemoria e notifiche lo prometteva dal 28/09
 * («ogni allievo riceve il messaggio una volta sola, sul primo canale
 * disponibile per lui»), ma il backend faceva l'opposto: sia i promemoria
 * (`communications.ts`) sia i messaggi-evento (`notify.ts`) mandavano su
 * **tutti** i canali spuntati. Con WhatsApp acceso, chi ha l'app avrebbe
 * ricevuto push + WhatsApp + email dello stesso promemoria — e pagato da noi.
 *
 * REG-767 (24/11/2026): la cascata è finita. Ogni comunicazione ha i suoi
 * canali (`message-channels.ts`) e parte su tutti quelli accesi
 * (`deliverToEach`). Resta l'ordine fisso in cui si provano.
 *
 * L'ordine è fisso e non configurabile: l'app è gratis e arriva a chi l'ha
 * installata; WhatsApp a chi non ce l'ha; l'email resta la rete per chi non ha
 * nemmeno un numero. L'autoscuola sceglie solo **quali** gradini esistono.
 */
import type { DeliveryChannel } from "@/lib/autoscuole/delivery-log";

export const CASCADE_ORDER: readonly DeliveryChannel[] = ["push", "whatsapp", "email"];

/**
 * I canali delle **offerte** (posto libero, invito a guida di gruppo, richiesta
 * di sostituzione): solo l'app. Sono proposte, non impegni presi, e su
 * WhatsApp da sole varrebbero più di tutti i promemoria in bolletta
 * (decisione del 16/10). Prima stavano dietro `slotFillChannels`, che in UI
 * si chiamava «Cancellazioni»: un controllo col nome sbagliato, tolto.
 */
export const OFFER_CHANNELS = ["push"] as const satisfies readonly DeliveryChannel[];

/**
 * Un canale: prova a consegnare e dice se ce l'ha fatta.
 * `true` vuol dire **consegnato** (la push ha raggiunto almeno un dispositivo,
 * il WhatsApp è partito, l'email è stata accettata), non «ho provato».
 */
export type CascadeStep = () => Promise<boolean>;

/**
 * REG-767: la comunicazione parte su **tutti e soli** i canali accesi sulla sua
 * riga, nell'ordine App → WhatsApp → Email. Niente cascata e niente riserva
 * (decisione di Tiziano del 24/11/2026): se è acceso solo WhatsApp va solo su
 * WhatsApp, se sono accesi App ed Email va su tutti e due. In serie e non in
 * parallelo: ogni tentativo scrive una riga di registro.
 *
 * Ritorna i canali che hanno consegnato (vuoto se nessuno). I canali senza
 * `step` si saltano: un punto di invio senza email da mandare non la passa.
 */
export async function deliverToEach(
  channels: readonly DeliveryChannel[],
  steps: Partial<Record<DeliveryChannel, CascadeStep>>,
): Promise<DeliveryChannel[]> {
  const delivered: DeliveryChannel[] = [];
  for (const channel of CASCADE_ORDER) {
    if (!channels.includes(channel)) continue;
    const step = steps[channel];
    if (!step) continue;
    try {
      if (await step()) delivered.push(channel);
    } catch {
      // Un canale caduto non ferma gli altri.
    }
  }
  return delivered;
}

/** La push conta come consegnata solo se almeno un dispositivo l'ha presa. */
export function pushReachedADevice(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      "sent" in result &&
      typeof (result as { sent: unknown }).sent === "number" &&
      (result as { sent: number }).sent > 0,
  );
}
