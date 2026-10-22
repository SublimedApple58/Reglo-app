import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { setWhatsAppPreference } from "@/lib/autoscuole/whatsapp-consent";
import { whatsAppStartUrl } from "@/lib/autoscuole/whatsapp-sender";
import { formatError } from "@/lib/utils";

/**
 * Avvisi su WhatsApp dal profilo dell'app (REG-500).
 *
 * Spegnere scrive la revoca — come rispondere STOP — e da lì nessun WhatsApp
 * parte più. **Riaccendere non la toglie da qui**: Telnyx tiene una sua revoca
 * per ogni STOP ricevuto e la toglie solo quando la persona scrive START o
 * UNSTOP (l'API non permette altro, verificato il 22/10). Se togliessimo la
 * nostra, ogni invio andrebbe a sbattere contro il blocco di Telnyx. Quindi
 * l'app riceve `startUrl` e apre WhatsApp con «START» già scritto: quando lo
 * START arriva al webhook, la revoca sparisce da entrambe le parti insieme.
 */
async function authenticate(request: Request) {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return null;
  return getMobileToken(token);
}

const unauthorized = () =>
  NextResponse.json({ success: false, message: "Token non valido." }, { status: 401 });

export async function GET(request: Request) {
  const mobileToken = await authenticate(request);
  if (!mobileToken) return unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: mobileToken.userId },
    select: { phone: true, whatsappOptOutAt: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, message: "Utente non trovato." }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: {
      enabled: !user.whatsappOptOutAt,
      hasPhone: Boolean(user.phone),
      startUrl: whatsAppStartUrl(),
    },
  });
}

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request) {
  const mobileToken = await authenticate(request);
  if (!mobileToken) return unauthorized();
  try {
    const { enabled } = patchSchema.parse(await request.json());
    if (!enabled) {
      await setWhatsAppPreference(mobileToken.userId, false, "app_profilo");
      return NextResponse.json({ success: true, data: { enabled: false } });
    }
    const user = await prisma.user.findUnique({
      where: { id: mobileToken.userId },
      select: { whatsappOptOutAt: true },
    });
    if (user?.whatsappOptOutAt) {
      // Revoca in corso: si toglie solo con uno START dalla chat di Reglo.
      return NextResponse.json({
        success: true,
        data: { enabled: false, needsStart: true, startUrl: whatsAppStartUrl() },
      });
    }
    await setWhatsAppPreference(mobileToken.userId, true, "app_profilo");
    return NextResponse.json({ success: true, data: { enabled: true } });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
