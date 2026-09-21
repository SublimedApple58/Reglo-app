/**
 * Webhook WhatsApp: firma, parsing, opt-out (REG-500).
 *
 * Oggi in Reglo **non esiste**: in `app/api` c'è solo il webhook della voce.
 * Conseguenza pratica: se un allievo risponde "posso spostare?" a un promemoria,
 * quel messaggio non lo legge nessuno. E gli stati di consegna non arrivano, per
 * cui non sappiamo mai se un messaggio è stato davvero recapitato.
 *
 * Qui c'è la parte pura — firma e interpretazione del payload — così è testabile
 * senza rete e vale per entrambi i fornitori candidati.
 */
import crypto from "crypto";

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type WhatsAppEvent =
  | {
      type: "status";
      providerMessageId: string;
      status: DeliveryStatus;
      recipient: string;
      error?: string;
    }
  | {
      type: "inbound";
      from: string;
      text: string;
      providerMessageId: string;
      /** L'utente ha chiesto di non essere più contattato. */
      isOptOut: boolean;
    };

/**
 * Parole che valgono come revoca del consenso. Meta pretende che una richiesta
 * di stop sia onorata: ignorarla fa scendere la quality rating e, alla lunga,
 * blocca il numero. Teniamo sia l'inglese (che Meta riconosce da sé) sia
 * l'italiano, perché i nostri allievi scrivono in italiano.
 */
const OPT_OUT_WORDS = [
  "stop",
  "unsubscribe",
  "cancella",
  "cancellami",
  "disiscrivimi",
  "non scrivermi",
  "non scrivetemi",
  "basta messaggi",
  "rimuovimi",
];

export function isOptOutText(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
  if (!normalized) return false;
  // Parola secca ("STOP") oppure frase che la contiene ("per favore cancellami").
  return OPT_OUT_WORDS.some(
    (word) => normalized === word || normalized.includes(word),
  );
}

/* ─────────────────────────────── Firma ──────────────────────────────────── */

/** Meta firma il corpo grezzo con l'app secret: `sha256=<hmac>`. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = header.slice("sha256=".length);
  // Confronto a tempo costante: le lunghezze diverse andrebbero in eccezione.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/** Twilio firma URL + parametri ordinati, in HMAC-SHA1 base64. */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | null,
  authToken: string,
): boolean {
  if (!header) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(payload, "utf8"))
    .digest("base64");
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/* ────────────────────────────── Parsing ─────────────────────────────────── */

type MetaWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: Array<{ title?: string; message?: string }>;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
        }>;
      };
    }>;
  }>;
};

const KNOWN_STATUSES: DeliveryStatus[] = ["sent", "delivered", "read", "failed"];

export function parseMetaWebhook(body: unknown): WhatsAppEvent[] {
  const parsed = body as MetaWebhookBody;
  const events: WhatsAppEvent[] = [];
  for (const entry of parsed?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const value = status.status as DeliveryStatus | undefined;
        if (!status.id || !value || !KNOWN_STATUSES.includes(value)) continue;
        events.push({
          type: "status",
          providerMessageId: status.id,
          status: value,
          recipient: status.recipient_id ? `+${status.recipient_id}` : "",
          ...(status.errors?.length
            ? { error: status.errors[0].message ?? status.errors[0].title ?? "errore" }
            : {}),
        });
      }
      for (const message of change.value?.messages ?? []) {
        // I bottoni "Annulla iscrizione" arrivano come `button`, non come testo.
        const text = message.text?.body ?? message.button?.text ?? "";
        if (!message.id || !message.from) continue;
        events.push({
          type: "inbound",
          from: `+${message.from}`,
          text,
          providerMessageId: message.id,
          isOptOut: isOptOutText(text),
        });
      }
    }
  }
  return events;
}

/** Twilio manda un form: uno stato OPPURE un messaggio in arrivo, mai insieme. */
export function parseTwilioWebhook(params: Record<string, string>): WhatsAppEvent[] {
  const stripPrefix = (value: string) => value.replace(/^whatsapp:/, "");
  if (params.MessageStatus && params.MessageSid) {
    const map: Record<string, DeliveryStatus> = {
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
      undelivered: "failed",
    };
    const status = map[params.MessageStatus];
    if (!status) return [];
    return [
      {
        type: "status",
        providerMessageId: params.MessageSid,
        status,
        recipient: stripPrefix(params.To ?? ""),
        ...(params.ErrorMessage || params.ErrorCode
          ? { error: params.ErrorMessage ?? `Twilio ${params.ErrorCode}` }
          : {}),
      },
    ];
  }
  if (params.From && params.Body != null && params.MessageSid) {
    return [
      {
        type: "inbound",
        from: stripPrefix(params.From),
        text: params.Body,
        providerMessageId: params.MessageSid,
        isOptOut: isOptOutText(params.Body),
      },
    ];
  }
  return [];
}
