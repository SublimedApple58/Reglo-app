import crypto from "crypto";
import {
  isOptOutText,
  parseMetaWebhook,
  parseTwilioWebhook,
  verifyMetaSignature,
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
