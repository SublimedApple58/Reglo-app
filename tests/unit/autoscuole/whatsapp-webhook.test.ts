import crypto from "crypto";
import {
  isOptOutText,
  parseMetaWebhook,
  parseTelnyxWebhook,
  parseTwilioWebhook,
  verifyMetaSignature,
  verifyTelnyxSignature,
  verifyTwilioSignature,
} from "@/lib/autoscuole/whatsapp-webhook";

describe("isOptOutText", () => {
  it("riconosce STOP in qualunque forma", () => {
    expect(isOptOutText("STOP")).toBe(true);
    expect(isOptOutText("  stop  ")).toBe(true);
    expect(isOptOutText("Stop!")).toBe(true);
  });

  it("riconosce le richieste in italiano, anche dentro una frase", () => {
    expect(isOptOutText("per favore cancellami da questa lista")).toBe(true);
    expect(isOptOutText("non scrivetemi più")).toBe(true);
    expect(isOptOutText("basta messaggi grazie")).toBe(true);
  });

  it("non scambia una risposta normale per una revoca", () => {
    expect(isOptOutText("ok grazie, a domani")).toBe(false);
    expect(isOptOutText("posso spostare la guida?")).toBe(false);
    expect(isOptOutText("")).toBe(false);
  });
});

describe("firma Meta", () => {
  const secret = "app-secret-finto";
  const body = JSON.stringify({ entry: [] });
  const sign = (b: string, s: string) =>
    "sha256=" + crypto.createHmac("sha256", s).update(b, "utf8").digest("hex");

  it("accetta una firma valida", () => {
    expect(verifyMetaSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rifiuta una firma di un altro segreto", () => {
    expect(verifyMetaSignature(body, sign(body, "altro"), secret)).toBe(false);
  });

  it("rifiuta un corpo alterato", () => {
    expect(verifyMetaSignature('{"entry":[1]}', sign(body, secret), secret)).toBe(false);
  });

  it("rifiuta header mancante o malformato", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=corto", secret)).toBe(false);
  });
});

describe("firma Twilio", () => {
  const token = "auth-token-finto";
  const url = "https://app.reglo.it/api/webhooks/whatsapp";
  const params = { MessageSid: "SM1", MessageStatus: "delivered", To: "whatsapp:+393331234567" };
  const sign = (u: string, p: Record<string, string>, t: string) => {
    const payload = Object.keys(p).sort().reduce((acc, k) => acc + k + p[k], u);
    return crypto.createHmac("sha1", t).update(Buffer.from(payload, "utf8")).digest("base64");
  };

  it("accetta una firma valida", () => {
    expect(verifyTwilioSignature(url, params, sign(url, params, token), token)).toBe(true);
  });

  it("rifiuta se cambia anche un solo parametro", () => {
    const header = sign(url, params, token);
    expect(
      verifyTwilioSignature(url, { ...params, MessageStatus: "failed" }, header, token),
    ).toBe(false);
  });

  it("rifiuta header mancante", () => {
    expect(verifyTwilioSignature(url, params, null, token)).toBe(false);
  });
});

describe("parseMetaWebhook", () => {
  it("legge gli stati di consegna", () => {
    const events = parseMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.1", status: "delivered", recipient_id: "393331234567" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      {
        type: "status",
        providerMessageId: "wamid.1",
        status: "delivered",
        recipient: "+393331234567",
      },
    ]);
  });

  it("porta con sé il motivo di un fallimento", () => {
    const events = parseMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.2",
                    status: "failed",
                    recipient_id: "393331234567",
                    errors: [{ message: "numero non su WhatsApp" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events[0]).toMatchObject({ status: "failed", error: "numero non su WhatsApp" });
  });

  it("legge un messaggio in arrivo e ne riconosce la revoca", () => {
    const events = parseMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.3", from: "393331234567", type: "text", text: { body: "STOP" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      {
        type: "inbound",
        from: "+393331234567",
        text: "STOP",
        providerMessageId: "wamid.3",
        isOptOut: true,
      },
    ]);
  });

  it("legge anche il testo di un bottone (è così che arriva 'annulla iscrizione')", () => {
    const events = parseMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.4", from: "393331234567", type: "button", button: { text: "Stop" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events[0]).toMatchObject({ isOptOut: true });
  });

  it("non esplode su payload vuoti o sconosciuti", () => {
    expect(parseMetaWebhook({})).toEqual([]);
    expect(parseMetaWebhook(null)).toEqual([]);
    expect(
      parseMetaWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "boh" }] } }] }] }),
    ).toEqual([]);
  });
});

describe("parseTwilioWebhook", () => {
  it("legge uno stato", () => {
    expect(
      parseTwilioWebhook({
        MessageSid: "SM1",
        MessageStatus: "delivered",
        To: "whatsapp:+393331234567",
      }),
    ).toEqual([
      {
        type: "status",
        providerMessageId: "SM1",
        status: "delivered",
        recipient: "+393331234567",
      },
    ]);
  });

  it("tratta 'undelivered' come fallito e porta il codice d'errore", () => {
    const events = parseTwilioWebhook({
      MessageSid: "SM2",
      MessageStatus: "undelivered",
      To: "whatsapp:+393331234567",
      ErrorCode: "63016",
    });
    expect(events[0]).toMatchObject({ status: "failed", error: "Twilio 63016" });
  });

  it("legge un messaggio in arrivo", () => {
    expect(
      parseTwilioWebhook({
        MessageSid: "SM3",
        From: "whatsapp:+393331234567",
        Body: "posso spostare?",
      }),
    ).toEqual([
      {
        type: "inbound",
        from: "+393331234567",
        text: "posso spostare?",
        providerMessageId: "SM3",
        isOptOut: false,
      },
    ]);
  });

  it("ignora quello che non riconosce", () => {
    expect(parseTwilioWebhook({})).toEqual([]);
    expect(parseTwilioWebhook({ MessageStatus: "queued", MessageSid: "SM4" })).toEqual([]);
  });
});

/* ──────────────────────────────── Telnyx ────────────────────────────────── */

/** Chiave vera generata al volo: la firma si prova, non si guarda. */
function telnyxKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  // Telnyx pubblica la chiave GREZZA a 32 byte in base64, non lo SPKI completo.
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { publicKeyBase64: raw.toString("base64"), privateKey };
}

function signTelnyx(privateKey: crypto.KeyObject, timestamp: string, body: string) {
  return crypto
    .sign(null, Buffer.from(`${timestamp}|${body}`, "utf8"), privateKey)
    .toString("base64");
}

describe("verifyTelnyxSignature", () => {
  const body = JSON.stringify({ data: { event_type: "message.received" } });
  const now = new Date("2026-09-22T10:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));

  it("accetta una firma autentica", () => {
    const { publicKeyBase64, privateKey } = telnyxKeypair();
    const signature = signTelnyx(privateKey, timestamp, body);
    expect(verifyTelnyxSignature(body, signature, timestamp, publicKeyBase64, now)).toBe(true);
  });

  it("rifiuta un corpo manomesso dopo la firma", () => {
    const { publicKeyBase64, privateKey } = telnyxKeypair();
    const signature = signTelnyx(privateKey, timestamp, body);
    const tampered = JSON.stringify({ data: { event_type: "message.finalized" } });
    expect(verifyTelnyxSignature(tampered, signature, timestamp, publicKeyBase64, now)).toBe(false);
  });

  it("rifiuta la firma di un'altra chiave", () => {
    const { publicKeyBase64 } = telnyxKeypair();
    const impostore = telnyxKeypair();
    const signature = signTelnyx(impostore.privateKey, timestamp, body);
    expect(verifyTelnyxSignature(body, signature, timestamp, publicKeyBase64, now)).toBe(false);
  });

  it("rifiuta una richiesta vecchia, anche se la firma è buona (replay)", () => {
    const { publicKeyBase64, privateKey } = telnyxKeypair();
    const vecchio = String(Math.floor(now.getTime() / 1000) - 10 * 60);
    const signature = signTelnyx(privateKey, vecchio, body);
    expect(verifyTelnyxSignature(body, signature, vecchio, publicKeyBase64, now)).toBe(false);
  });

  it("accetta la chiave anche in forma SPKI completa, non solo grezza", () => {
    // `voice.ts` legge la stessa TELNYX_PUBLIC_KEY assumendo SPKI: se il valore
    // in produzione fosse in quella forma, la verifica deve reggere lo stesso.
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const signature = signTelnyx(privateKey, timestamp, body);
    expect(verifyTelnyxSignature(body, signature, timestamp, spki, now)).toBe(true);
  });

  it("rifiuta una chiave di lunghezza assurda invece di esplodere", () => {
    const signature = "A".repeat(88);
    expect(verifyTelnyxSignature(body, signature, timestamp, "bm9wZQ==", now)).toBe(false);
  });

  it("senza intestazioni non passa", () => {
    const { publicKeyBase64 } = telnyxKeypair();
    expect(verifyTelnyxSignature(body, null, timestamp, publicKeyBase64, now)).toBe(false);
    expect(verifyTelnyxSignature(body, "abc", null, publicKeyBase64, now)).toBe(false);
  });
});

describe("parseTelnyxWebhook", () => {
  it("legge un messaggio in arrivo", () => {
    const events = parseTelnyxWebhook({
      data: {
        event_type: "message.received",
        payload: {
          id: "msg_1",
          text: "posso spostare la guida?",
          from: { phone_number: "+393331234567" },
          to: [{ phone_number: "+390000000000", status: "webhook_delivered" }],
        },
      },
    });
    expect(events).toEqual([
      {
        type: "inbound",
        from: "+393331234567",
        text: "posso spostare la guida?",
        providerMessageId: "msg_1",
        isOptOut: false,
      },
    ]);
  });

  it("un messaggio in arrivo NON viene scambiato per uno stato di consegna", () => {
    // `webhook_delivered` in `to[].status` riguarda la consegna del webhook a noi.
    const events = parseTelnyxWebhook({
      data: {
        event_type: "message.received",
        payload: {
          id: "msg_2",
          text: "ciao",
          from: { phone_number: "+393331234567" },
          to: [{ phone_number: "+390000000000", status: "delivered" }],
        },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("inbound");
  });

  it("riconosce la revoca del consenso in arrivo", () => {
    const events = parseTelnyxWebhook({
      data: {
        event_type: "message.received",
        payload: {
          id: "msg_3",
          text: "CANCELLAMI",
          from: { phone_number: "+393331234567" },
        },
      },
    });
    expect(events[0]).toMatchObject({ type: "inbound", isOptOut: true });
  });

  it("legge uno stato di consegna e l'errore che lo accompagna", () => {
    const events = parseTelnyxWebhook({
      data: {
        event_type: "message.finalized",
        payload: {
          id: "msg_4",
          to: [{ phone_number: "+393331234567", status: "delivery_failed" }],
          errors: [{ code: "40003", title: "Undeliverable", detail: "numero senza WhatsApp" }],
        },
      },
    });
    expect(events).toEqual([
      {
        type: "status",
        providerMessageId: "msg_4",
        status: "failed",
        recipient: "+393331234567",
        error: "Undeliverable — numero senza WhatsApp",
      },
    ]);
  });

  it("ignora gli stati di transito e i payload che non c'entrano", () => {
    expect(
      parseTelnyxWebhook({
        data: { event_type: "message.sent", payload: { id: "m", to: [{ status: "queued" }] } },
      }),
    ).toEqual([]);
    expect(parseTelnyxWebhook({ data: { event_type: "call.answered", payload: { id: "c" } } })).toEqual([]);
    expect(parseTelnyxWebhook({})).toEqual([]);
    expect(parseTelnyxWebhook(null)).toEqual([]);
  });
});
