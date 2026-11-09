import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import {
  completeFirstAccess,
  FIRST_ACCESS_RATE_LIMIT_MESSAGE,
  readActivationToken,
} from "@/lib/auth/first-access";
import { clientIp, hitRateLimit } from "@/lib/auth/rate-limit";
import { buildMobileAuthPayload } from "@/lib/mobile-auth-payload";
import { firstAccessCompleteSchema } from "@/lib/validators";

/** «Primo accesso», ultimo passo: salva i dati, attiva l'account e apre la sessione. */
export async function POST(request: Request) {
  if (!(await hitRateLimit(`first-access-complete:ip:${clientIp(request)}`, 20, 15 * 60))) {
    return NextResponse.json(
      { success: false, message: FIRST_ACCESS_RATE_LIMIT_MESSAGE },
      { status: 429 },
    );
  }

  const parsed = firstAccessCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dati non validi.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  const userId = readActivationToken(parsed.data.activationToken);
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Sessione scaduta. Ricomincia dal tuo numero di telefono." },
      { status: 401 },
    );
  }

  const { activationToken: _token, ...details } = parsed.data;
  const result = await completeFirstAccess(userId, details);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const data = user ? await buildMobileAuthPayload(user) : null;
  if (!data) {
    return NextResponse.json(
      { success: false, message: "Account attivato. Accedi con il tuo numero e la nuova password." },
      { status: 403 },
    );
  }
  return NextResponse.json({ success: true, data });
}
