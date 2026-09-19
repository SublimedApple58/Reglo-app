import { NextResponse } from "next/server";

import { passwordResetVerifySchema } from "@/lib/validators";
import {
  checkPasswordResetCode,
  RESET_INVALID_CODE_MESSAGE,
} from "@/lib/auth/password-reset";

// Controllo "morbido" per sbloccare il passo della nuova password: valida il
// codice ma NON lo consuma — il consumo avviene in /confirm.
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetVerifySchema.safeParse(payload);

  const check = parsed.success
    ? await checkPasswordResetCode(parsed.data.email, parsed.data.code)
    : { ok: false as const };

  if (!check.ok) {
    return NextResponse.json(
      { success: false, message: RESET_INVALID_CODE_MESSAGE },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
