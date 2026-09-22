/**
 * Invio WhatsApp: un'interfaccia, più adapter (REG-500).
 *
 * **Fornitore scelto: Telnyx** (deciso il 22/09/2026). Telnyx è BSP ufficiale
 * della WhatsApp Business Platform ed è già il fornitore della voce di Reglo:
 * stessa chiave API, stessa fattura, stesso portale. Il margine è $0,004/msg
 * senza canone fisso — più basso di Twilio ($0,005–0,010) — e l'onboarding passa
 * dall'Embedded Signup di Meta dal portale Telnyx, senza il giro manuale con
 * System User e Graph API che serve con la Cloud API diretta.
 *
 * Gli adapter `cloud` (Meta diretta / 360dialog) e `twilio` restano nel file come
 * riferimento e via di fuga, ma non sono la strada: l'account Twilio è sospeso
 * con saldo negativo e non ci vogliamo dipendere.
 *
 * Sui costi, perché non si torni a discuterne: il margine del fornitore è il
 * termine piccolo (a 2.200 msg/mese, $0,004 fanno ~€8/mese), le tariffe Meta sono
 * il termine grande e sono identiche per chiunque. Il fornitore si cambia con una
 * variabile d'ambiente, non con una riscrittura.
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

/* ──────────────────────────────── Telnyx ────────────────────────────────── */

/**
 * Telnyx fa da tramite verso Meta ma **non** riscrive il modello dei template:
 * il corpo `whatsapp_message` è la struttura Meta pari pari (nome, lingua,
 * `components`), incapsulata in una busta Telnyx con `from`/`to` in E.164 col +.
 *
 * Conseguenza pratica, ed è la ragione per cui questo adapter è il più semplice
 * dei tre: i template si scrivono una volta sola e valgono anche se un domani si
 * passa a Meta diretta. Twilio invece pretende un `ContentSid` per template,
 * creato a mano in console — quel lavoro non è riutilizzabile.
 *
 * La chiave API è la stessa della voce (`TELNYX_API_KEY`): non c'è un account
 * nuovo da aprire né una credenziale nuova da custodire.
 */
class TelnyxSender implements WhatsAppSender {
  readonly providerName = "telnyx";

  constructor(
    private readonly config: {
      apiKey: string;
      /** Numero mittente registrato su WhatsApp, in E.164. */
      from: string;
      baseUrl: string;
    },
  ) {}

  async send({ to, kind, values, languageCode = "it" }: WhatsAppSendInput) {
    const template = getWhatsAppTemplate(kind);
    const parameters = buildTemplateParameters(kind, values);
    const res = await fetch(`${this.config.baseUrl}/messages/whatsapp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to,
        whatsapp_message: {
          type: "template",
          template: {
            name: template.name,
            // "deterministic" = manda esattamente questa lingua o fallisci. Il
            // fallback automatico di Meta sceglierebbe una lingua a caso fra
            // quelle approvate, e l'allievo si vedrebbe arrivare l'inglese.
            language: { policy: "deterministic", code: languageCode },
            components: parameters.length
              ? [
                  {
                    type: "body",
                    parameters: parameters.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          },
        },
      }),
    });

    const payload = (await res.json().catch(() => null)) as {
      data?: { id?: string };
      errors?: Array<{ code?: string; title?: string; detail?: string }>;
    } | null;

    if (!res.ok) {
      const first = payload?.errors?.[0];
      const message =
        [first?.title, first?.detail].filter(Boolean).join(" — ") || `HTTP ${res.status}`;
      return {
        ok: false as const,
        reason: `telnyx ${res.status}: ${message}${first?.code ? ` (${first.code})` : ""}`,
        retriable: res.status >= 500 || res.status === 429,
      };
    }
    return { ok: true as const, providerMessageId: payload?.data?.id ?? null };
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

  if (provider === "telnyx") {
    // Stessa chiave della voce: se la voce funziona, questa c'è già.
    const apiKey = env.TELNYX_API_KEY;
    const from = env.TELNYX_WHATSAPP_FROM;
    if (!apiKey) {
      return { configured: false, reason: "TELNYX_API_KEY non configurata" };
    }
    if (!from) {
      return {
        configured: false,
        reason:
          "TELNYX_WHATSAPP_FROM non configurata (il numero mittente registrato su WhatsApp, in E.164)",
      };
    }
    return {
      configured: true,
      sender: new TelnyxSender({
        apiKey,
        from,
        baseUrl: env.TELNYX_API_BASE_URL ?? "https://api.telnyx.com/v2",
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
      ? `WHATSAPP_PROVIDER="${provider}" non riconosciuto (telnyx | cloud | 360dialog | twilio)`
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
