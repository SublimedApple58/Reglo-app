import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FIRST_ACCESS_NOT_FOUND_MESSAGE,
  FIRST_ACCESS_RATE_LIMIT_MESSAGE,
  startFirstAccess,
} from "@/lib/auth/first-access";
import { clientIp, hitRateLimit } from "@/lib/auth/rate-limit";
import { normalizeLoginPhone } from "@/lib/users/login-phone";

const schema = z.object({ phone: z.string().trim().min(5) });

/**
 * «Primo accesso» (lib/auth/first-access.ts): il numero corrisponde a un
 * allievo mai attivato? Se sì torna un permesso temporaneo e i dati da
 * confermare; altrimenti una risposta unica, qualunque sia il motivo.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Scrivi il tuo numero di telefono." },
      { status: 400 },
    );
  }

  const phoneKey = normalizeLoginPhone(parsed.data.phone) ?? parsed.data.phone;
  const [ipOk, phoneOk] = await Promise.all([
    hitRateLimit(`first-access:ip:${clientIp(request)}`, 20, 15 * 60),
    hitRateLimit(`first-access:phone:${phoneKey}`, 5, 15 * 60),
  ]);
  if (!ipOk || !phoneOk) {
    return NextResponse.json(
      { success: false, message: FIRST_ACCESS_RATE_LIMIT_MESSAGE },
      { status: 429 },
    );
  }

  const result = await startFirstAccess(parsed.data.phone);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: FIRST_ACCESS_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  const { ok: _ok, ...data } = result;
  return NextResponse.json({ success: true, data });
}
