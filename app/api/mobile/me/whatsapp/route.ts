import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { setWhatsAppPreference } from "@/lib/autoscuole/whatsapp-consent";
import { formatError } from "@/lib/utils";

/**
 * Avvisi su WhatsApp dal profilo dell'app (REG-500): l'utente li accende o li
 * spegne da sé. Spegnere scrive la revoca — lo stesso effetto di rispondere
 * STOP al numero di Reglo — e da lì nessun WhatsApp parte più verso di lui.
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
    data: { enabled: !user.whatsappOptOutAt, hasPhone: Boolean(user.phone) },
  });
}

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request) {
  const mobileToken = await authenticate(request);
  if (!mobileToken) return unauthorized();
  try {
    const { enabled } = patchSchema.parse(await request.json());
    await setWhatsAppPreference(mobileToken.userId, enabled, "app_profilo");
    return NextResponse.json({ success: true, data: { enabled } });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
