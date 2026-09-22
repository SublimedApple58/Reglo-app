/**
 * Webhook WhatsApp: firma, parsing, opt-out (REG-500).
 *
 * Oggi in Reglo **non esiste**: in `app/api` c'è solo il webhook della voce.
 * Conseguenza pratica: se un allievo risponde "posso spostare?" a un promemoria,
 * quel messaggio non lo legge nessuno. E gli stati di consegna non arrivano, per
 * cui non sappiamo mai se un messaggio è stato davvero recapitato.
 *
 * Qui c'è la parte pura — firma e interpretazione del payload — così è testabile
 * senza rete. Il fornitore scelto è **Telnyx**; le forme Meta e Twilio restano
 * perché il codice deve reggere un cambio di fornitore senza riscritture.
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

/** Intestazione DER che trasforma una chiave Ed25519 grezza in SPKI. */
const TELNYX_ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Oltre questa distanza dall'ora del server la richiesta è da buttare. */
const TELNYX_MAX_SKEW_SECONDS = 5 * 60;

/**
 * Telnyx non usa HMAC come gli altri due: firma `timestamp|corpo` con Ed25519 e
 * manda la firma in base64. La chiave **pubblica** sta nel portale Telnyx, in
 * Account Settings → Keys & Credentials.
 *
 * Il controllo sul timestamp non è pignoleria: senza, una richiesta valida
 * catturata una volta resta valida per sempre e si può rigiocare all'infinito —
 * per esempio per far risultare revocato il consenso di un allievo.
 */
export function verifyTelnyxSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyBase64: string,
  now: Date = new Date(),
): boolean {
  if (!signature || !timestamp) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const skewSeconds = Math.abs(now.getTime() / 1000 - sentAt);
  if (skewSeconds > TELNYX_MAX_SKEW_SECONDS) return false;

  try {
    const sig = Buffer.from(signature, "base64");
    if (sig.length !== 64) return false;
    const key = toEd25519PublicKey(publicKeyBase64);
    if (!key) return false;
    return crypto.verify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`, "utf8"),
      key,
      sig,
    );
  } catch {
    return false;
  }
}

/**
 * Accetta la chiave in **entrambe** le forme in cui la si trova in giro: grezza a
 * 32 byte (come la pubblica il portale Telnyx) o già impacchettata in SPKI DER.
 *
 * Non è indecisione: `lib/autoscuole/voice.ts` legge la stessa variabile
 * `TELNYX_PUBLIC_KEY` assumendo SPKI, questo modulo nasceva assumendo la forma
 * grezza, e indovinare male significa un webhook che rifiuta tutto il primo
 * giorno senza che nessuno capisca perché. Reggere tutte e due costa otto righe.
 */
function toEd25519PublicKey(publicKeyBase64: string): crypto.KeyObject | null {
  const raw = Buffer.from(publicKeyBase64, "base64");
  const der =
    raw.length === 32 ? Buffer.concat([TELNYX_ED25519_SPKI_PREFIX, raw]) : raw;
  // Uno SPKI Ed25519 valido è sempre 44 byte: 12 di intestazione + 32 di chiave.
  if (der.length !== TELNYX_ED25519_SPKI_PREFIX.length + 32) return null;
  try {
    return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    return null;
  }
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


/* ──────────────────────────────── Telnyx ────────────────────────────────── */

type TelnyxWebhookBody = {
  data?: {
    event_type?: string;
    payload?: {
      id?: string;
      text?: string;
      from?: { phone_number?: string };
      to?: Array<{ phone_number?: string; status?: string }>;
      errors?: Array<{ code?: string; title?: string; detail?: string }>;
      whatsapp?: { text?: string };
    };
  };
};

/** Stati Telnyx → i quattro che ci interessano. Il resto è rumore di transito. */
const TELNYX_STATUS_MAP: Record<string, DeliveryStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  sending_failed: "failed",
  delivery_failed: "failed",
};

/**
 * Telnyx manda **un evento per richiesta**, con l'inviluppo `data.payload`.
 *
 * Attenzione a una trappola: anche un messaggio in arrivo ha `to[].status`, che
 * però vale `webhook_delivered` e riguarda la consegna *del webhook a noi*, non
 * quella del messaggio. Per questo si smista sul tipo di evento e mai sulla
 * presenza di uno stato — leggerlo al contrario farebbe registrare ogni risposta
 * di un allievo come se fosse uno stato di consegna.
 */
export function parseTelnyxWebhook(body: unknown): WhatsAppEvent[] {
  const data = (body as TelnyxWebhookBody)?.data;
  const payload = data?.payload;
  if (!payload) return [];

  if (data?.event_type === "message.received") {
    const from = payload.from?.phone_number;
    const text = payload.text ?? payload.whatsapp?.text ?? "";
    if (!from || !payload.id) return [];
    return [
      {
        type: "inbound",
        from,
        text,
        providerMessageId: payload.id,
        isOptOut: isOptOutText(text),
      },
    ];
  }

  // message.sent / message.finalized / message.* → stato di consegna.
  if (!data?.event_type?.startsWith("message.") || !payload.id) return [];
  const recipient = payload.to?.[0];
  const status = recipient?.status ? TELNYX_STATUS_MAP[recipient.status] : undefined;
  if (!status) return [];
  const error = payload.errors?.[0];
  return [
    {
      type: "status",
      providerMessageId: payload.id,
      status,
      recipient: recipient?.phone_number ?? "",
      ...(error
        ? { error: [error.title, error.detail].filter(Boolean).join(" — ") || "errore" }
        : {}),
    },
  ];
}
