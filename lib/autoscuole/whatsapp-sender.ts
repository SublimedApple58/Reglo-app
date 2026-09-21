/**
 * Invio WhatsApp: un'interfaccia, più adapter (REG-500).
 *
 * La scelta del fornitore NON è sul percorso critico e non va incisa nel codice:
 * tutti e tre i candidati (Meta Cloud API diretta, Twilio, 360dialog) mandano lo
 * stesso template allo stesso numero, cambia solo l'involucro HTTP. Si decide al
 * momento di collegare, su quale onboarding arriva prima, e si cambia idea dopo
 * con una variabile d'ambiente.
 *
 * Nota sui costi, perché guida la scelta: il margine del fornitore è il termine
 * piccolo (Twilio ~$0,005/msg → ~€10/mese a 2.200 messaggi), le tariffe Meta sono
 * il termine grande e sono identiche per tutti. Sopra i ~10.000 messaggi al mese
 * il margine Twilio smette di essere trascurabile: si passa a `cloud` (€0) o a
 * 360dialog (€49/mese fissi) cambiando `WHATSAPP_PROVIDER`.
 *
 * 360dialog espone la Cloud API con un altro base URL e un altro header di auth:
 * per questo NON ha un adapter suo, riusa quello `cloud`.
 */
import { externalSendsDisabled } from "@/lib/app-env";
import { isWhatsAppCapable, normalizeToE164 } from "@/lib/phone-e164";
import {
  buildTemplateParameters,
  getWhatsAppTemplate,
  type WhatsAppTemplateKind,
} from "@/lib/autoscuole/whatsapp-templates";

export type WhatsAppSendInput = {
  to: string;
  kind: WhatsAppTemplateKind;
  /** Valori delle variabili, per nome (vedi `variables` del template). */
  values: Record<string, string>;
  /** Lingua del template approvato su Meta. */
  languageCode?: string;
};

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string | null; skipped?: "ambiente" }
  | { ok: false; reason: string; retriable: boolean };

export interface WhatsAppSender {
  readonly providerName: string;
  send(input: WhatsAppSendInput & { to: string }): Promise<WhatsAppSendResult>;
}

/* ────────────────────────────── Meta Cloud API ───────────────────────────── */

/**
 * Funziona sia per Meta diretta sia per 360dialog: stesso payload, cambiano
 * base URL e header di autenticazione.
 */
class CloudApiSender implements WhatsAppSender {
  readonly providerName: string;

  constructor(
    private readonly config: {
      baseUrl: string;
      phoneNumberId: string;
      authHeader: Record<string, string>;
      label: string;
    },
  ) {
    this.providerName = config.label;
  }

  async send({ to, kind, values, languageCode = "it" }: WhatsAppSendInput) {
    const template = getWhatsAppTemplate(kind);
    const parameters = buildTemplateParameters(kind, values);
    const res = await fetch(
      `${this.config.baseUrl}/${this.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.config.authHeader },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/^\+/, ""), // la Cloud API vuole E.164 senza il +
          type: "template",
          template: {
            name: template.name,
            language: { code: languageCode },
            components: parameters.length
              ? [
                  {
                    type: "body",
                    parameters: parameters.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          },
        }),
      },
    );
    const payload = (await res.json().catch(() => null)) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    } | null;

    if (!res.ok) {
      const message = payload?.error?.message ?? `HTTP ${res.status}`;
      return {
        ok: false as const,
        reason: `${this.providerName}: ${message}`,
        // 4xx = payload o configurazione sbagliati, ritentare non serve.
        retriable: res.status >= 500 || res.status === 429,
      };
    }
    return { ok: true as const, providerMessageId: payload?.messages?.[0]?.id ?? null };
  }
}

/* ──────────────────────────────── Twilio ─────────────────────────────────── */

/**
 * Twilio non manda il template per nome: va creato un "Content Template" nella
 * console, che restituisce un `ContentSid`. Le variabili sono un oggetto JSON
 * con chiavi "1", "2", … — l'ordine viene comunque dal registro dei template,
 * così le due strade restano allineate.
 */
class TwilioSender implements WhatsAppSender {
  readonly providerName = "twilio";

  constructor(
    private readonly config: {
      accountSid: string;
      authToken: string;
      from: string;
      /** Mappa kind → ContentSid creato nella console Twilio. */
      contentSids: Record<string, string>;
    },
  ) {}

  async send({ to, kind, values }: WhatsAppSendInput) {
    const contentSid = this.config.contentSids[kind];
    if (!contentSid) {
      return {
        ok: false as const,
        reason: `twilio: manca il ContentSid per "${kind}" (va creato in console e messo in TWILIO_WHATSAPP_CONTENT_SIDS)`,
        retriable: false,
      };
    }
    const parameters = buildTemplateParameters(kind, values);
    const contentVariables = Object.fromEntries(
      parameters.map((value, index) => [String(index + 1), value]),
    );
    const auth = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`,
    ).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: `whatsapp:${this.config.from.replace(/^whatsapp:/, "")}`,
          To: `whatsapp:${to}`,
          ContentSid: contentSid,
          ContentVariables: JSON.stringify(contentVariables),
        }),
      },
    );
    const payload = (await res.json().catch(() => null)) as {
      sid?: string;
      message?: string;
      code?: number;
    } | null;
    if (!res.ok) {
      return {
        ok: false as const,
        reason: `twilio ${res.status}: ${payload?.message ?? "errore sconosciuto"}${
          payload?.code ? ` (${payload.code})` : ""
        }`,
        retriable: res.status >= 500 || res.status === 429,
      };
    }
    return { ok: true as const, providerMessageId: payload?.sid ?? null };
  }
}

/* ──────────────────────────── Scelta del sender ──────────────────────────── */

export type SenderResolution =
  | { configured: true; sender: WhatsAppSender }
  | { configured: false; reason: string };

/**
 * Legge l'ambiente e dice se WhatsApp è collegato **davvero**.
 *
 * Il valore di ritorno serve anche alla UI: finché qui non c'è un sender, il
 * canale WhatsApp non va offerto alle autoscuole. È la cura contro il problema
 * che ha aperto REG-500 — una casella spuntabile che prometteva invii impossibili.
 */
export function resolveWhatsAppSender(env: NodeJS.ProcessEnv = process.env): SenderResolution {
  const provider = (env.WHATSAPP_PROVIDER ?? "").toLowerCase();

  if (provider === "cloud" || provider === "360dialog") {
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    const token = env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !token) {
      return {
        configured: false,
        reason: "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN non configurate",
      };
    }
    const is360 = provider === "360dialog";
    return {
      configured: true,
      sender: new CloudApiSender({
        baseUrl: is360
          ? env.WHATSAPP_API_BASE_URL ?? "https://waba-v2.360dialog.io"
          : env.WHATSAPP_API_BASE_URL ?? "https://graph.facebook.com/v21.0",
        phoneNumberId,
        authHeader: is360
          ? { "D360-API-KEY": token }
          : { Authorization: `Bearer ${token}` },
        label: is360 ? "360dialog" : "meta-cloud",
      }),
    };
  }

  if (provider === "twilio") {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken || !from) {
      return { configured: false, reason: "TWILIO_* non configurate" };
    }
    let contentSids: Record<string, string> = {};
    try {
      contentSids = JSON.parse(env.TWILIO_WHATSAPP_CONTENT_SIDS ?? "{}");
    } catch {
      return {
        configured: false,
        reason: "TWILIO_WHATSAPP_CONTENT_SIDS non è un JSON valido",
      };
    }
    return {
      configured: true,
      sender: new TwilioSender({ accountSid, authToken, from, contentSids }),
    };
  }

  return {
    configured: false,
    reason: provider
      ? `WHATSAPP_PROVIDER="${provider}" non riconosciuto (cloud | 360dialog | twilio)`
      : "WHATSAPP_PROVIDER non impostata: WhatsApp non è collegato",
  };
}

/** True se il canale WhatsApp può essere offerto alle autoscuole in UI. */
export function isWhatsAppChannelAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveWhatsAppSender(env).configured;
}

/**
 * Invio con tutti i controlli davanti: ambiente, numero, template.
 * Non lancia mai: torna sempre un esito, perché chi chiama lo deve scrivere a log.
 */
export async function sendWhatsAppTemplate(
  input: WhatsAppSendInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WhatsAppSendResult> {
  if (externalSendsDisabled()) {
    return { ok: true, providerMessageId: null, skipped: "ambiente" };
  }
  const normalized = normalizeToE164(input.to);
  if (!normalized.ok) {
    return { ok: false, reason: `numero non utilizzabile (${normalized.reason})`, retriable: false };
  }
  if (!isWhatsAppCapable(normalized.e164)) {
    return { ok: false, reason: "numero senza WhatsApp (fisso o formato non valido)", retriable: false };
  }
  const resolution = resolveWhatsAppSender(env);
  if (!resolution.configured) {
    return { ok: false, reason: resolution.reason, retriable: false };
  }
  try {
    return await resolution.sender.send({ ...input, to: normalized.e164 });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "errore di rete",
      retriable: true,
    };
  }
}
