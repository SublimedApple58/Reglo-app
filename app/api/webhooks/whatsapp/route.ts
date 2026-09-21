import { NextResponse } from "next/server";

import {
  parseMetaWebhook,
  parseTwilioWebhook,
  verifyMetaSignature,
  verifyTwilioSignature,
} from "@/lib/autoscuole/whatsapp-webhook";

/**
 * Webhook WhatsApp (REG-500) — stati di consegna e messaggi in arrivo.
 *
 * Accetta entrambe le forme, Meta Cloud API e Twilio, perché la scelta del
 * fornitore si fa al momento di collegare e non deve bloccare il codice.
 *
 * Regola d'oro dei webhook: **rispondere 200 in fretta e sempre**. Meta e Twilio
 * ritentano e, dopo troppi errori, disattivano la sottoscrizione. Quindi qui non
 * si fa lavoro lungo: si valida la firma, si interpreta, si registra.
 *
 * Quello che ancora NON fa, di proposito: non salva la revoca del consenso e non
 * consegna le risposte alla segreteria. Servono entrambe una colonna nuova
 * (consenso/opt-out) e una decisione di prodotto su dove vanno a finire le
 * risposte — vedi `plans/communications/reg-500-whatsapp.md`, fase 3. Fino ad
 * allora gli eventi vengono riconosciuti e messi a log, non persi.
 */

/** Meta verifica la sottoscrizione con una GET e si aspetta indietro la challenge. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    console.error("[whatsapp-webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN non configurata");
    return new NextResponse("not configured", { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const contentType = request.headers.get("content-type") ?? "";

  try {
    // ── Twilio: form-encoded, firma HMAC-SHA1 su URL + parametri ──
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = Object.fromEntries(new URLSearchParams(raw));
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const skipCheck = process.env.TWILIO_DISABLE_SIGNATURE_CHECK === "true";
      if (!skipCheck) {
        if (!authToken) return new NextResponse("not configured", { status: 500 });
        const url = process.env.WHATSAPP_WEBHOOK_URL ?? request.url;
        const valid = verifyTwilioSignature(
          url,
          params,
          request.headers.get("x-twilio-signature"),
          authToken,
        );
        if (!valid) return new NextResponse("bad signature", { status: 403 });
      }
      handleEvents(parseTwilioWebhook(params));
      // Twilio si aspetta TwiML (o un 200 vuoto): niente risposta automatica.
      return new NextResponse("", { status: 200 });
    }

    // ── Meta Cloud API / 360dialog: JSON, firma HMAC-SHA256 sul corpo grezzo ──
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const valid = verifyMetaSignature(
        raw,
        request.headers.get("x-hub-signature-256"),
        appSecret,
      );
      if (!valid) return new NextResponse("bad signature", { status: 403 });
    } else if (process.env.WHATSAPP_PROVIDER === "cloud") {
      // Con Meta diretta la firma è obbligatoria: senza segreto chiunque potrebbe
      // iniettare stati di consegna falsi.
      console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET non configurata");
      return new NextResponse("not configured", { status: 500 });
    }

    handleEvents(parseMetaWebhook(JSON.parse(raw)));
    return NextResponse.json({ received: true });
  } catch (error) {
    // Anche in errore si risponde 200: un 500 ripetuto fa disattivare la
    // sottoscrizione da parte di Meta, e perderemmo TUTTI gli eventi, non uno.
    console.error("[whatsapp-webhook] payload non gestito", error);
    return NextResponse.json({ received: true });
  }
}

function handleEvents(events: ReturnType<typeof parseMetaWebhook>) {
  for (const event of events) {
    if (event.type === "status") {
      // TODO(REG-500 fase 3): aggiornare la riga di AutoscuolaMessageLog
      // corrispondente a `providerMessageId`. Richiede la colonna per l'id del
      // fornitore, che oggi non c'è.
      console.info("[whatsapp-webhook] stato", {
        id: event.providerMessageId,
        status: event.status,
        ...(event.error ? { error: event.error } : {}),
      });
      continue;
    }
    if (event.isOptOut) {
      // TODO(REG-500 fase 3): persistere la revoca. Obbligatoria per policy Meta:
      // continuare a scrivere a chi ha detto STOP fa scendere la quality rating
      // e alla lunga fa bloccare il numero.
      console.warn("[whatsapp-webhook] REVOCA CONSENSO da", event.from);
      continue;
    }
    // TODO(REG-500 fase 3): consegnare la risposta alla segreteria.
    console.info("[whatsapp-webhook] risposta in arrivo", {
      from: event.from,
      text: event.text.slice(0, 120),
    });
  }
}
