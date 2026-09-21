import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import {
  findUserByPhone,
  recordWhatsAppOptOut,
} from "@/lib/autoscuole/whatsapp-consent";
import { createWhatsAppReplyNotification } from "@/lib/autoscuole/notifications";
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
 * Cosa fa con quello che riceve:
 *  - **revoca** ("STOP", "cancellami", …) → la scrive su `User.whatsappOptOutAt`,
 *    e da lì in poi `sendWhatsAppToPhone` non scrive più a quella persona;
 *  - **risposta** → diventa una notifica in campanella per l'autoscuola, così
 *    qualcuno la legge davvero;
 *  - **stato di consegna** → per ora a log. Aggiornare la riga di
 *    `AutoscuolaMessageLog` richiede una colonna per l'id del fornitore, che
 *    arriverà quando gli invii passeranno dai template.
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
      await handleEvents(parseTwilioWebhook(params));
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

    await handleEvents(parseMetaWebhook(JSON.parse(raw)));
    return NextResponse.json({ received: true });
  } catch (error) {
    // Anche in errore si risponde 200: un 500 ripetuto fa disattivare la
    // sottoscrizione da parte di Meta, e perderemmo TUTTI gli eventi, non uno.
    console.error("[whatsapp-webhook] payload non gestito", error);
    return NextResponse.json({ received: true });
  }
}

async function handleEvents(events: ReturnType<typeof parseMetaWebhook>) {
  for (const event of events) {
    try {
      if (event.type === "status") {
        console.info("[whatsapp-webhook] stato", {
          id: event.providerMessageId,
          status: event.status,
          ...(event.error ? { error: event.error } : {}),
        });
        continue;
      }

      if (event.isOptOut) {
        const found = await recordWhatsAppOptOut(event.from);
        console.warn("[whatsapp-webhook] revoca consenso", {
          from: event.from,
          utenteTrovato: found,
        });
        continue;
      }

      await deliverReply(event.from, event.text);
    } catch (error) {
      // Un evento che esplode non deve portarsi dietro gli altri dello stesso
      // payload: Meta ne impacchetta più d'uno per richiesta.
      console.error("[whatsapp-webhook] evento non gestito", error);
    }
  }
}

/**
 * Porta la risposta a chi la deve leggere: la campanella dell'autoscuola.
 *
 * Se il numero non è di nessuno in anagrafica la risposta non si butta — si
 * lascia a log, perché è comunque qualcuno che ha scritto a Reglo. Senza una
 * company a cui appenderla, però, non c'è campanella dove metterla.
 */
async function deliverReply(from: string, text: string) {
  const user = await findUserByPhone(from);
  if (!user) {
    console.warn("[whatsapp-webhook] risposta da un numero sconosciuto", {
      from,
      text: text.slice(0, 120),
    });
    return;
  }
  const memberships = await prisma.companyMember.findMany({
    where: { userId: user.id, autoscuolaRole: "STUDENT" },
    select: { companyId: true },
  });
  if (!memberships.length) {
    console.warn("[whatsapp-webhook] risposta da un utente senza autoscuola", { from });
    return;
  }
  // Un allievo sta in una sola autoscuola nella pratica, ma il modello ne
  // ammette più d'una: la risposta va a tutte, perché non sappiamo a quale
  // delle due stesse rispondendo.
  for (const membership of memberships) {
    await createWhatsAppReplyNotification({
      companyId: membership.companyId,
      studentId: user.id,
      studentName: user.name ?? null,
      text,
      phone: from,
    });
  }
}
