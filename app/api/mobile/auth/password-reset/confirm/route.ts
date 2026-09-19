import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { buildMobileAuthPayload } from "@/lib/mobile-auth-payload";
import { passwordResetConfirmSchema } from "@/lib/validators";
import {
  applyNewPassword,
  checkPasswordResetCode,
  RESET_INVALID_CODE_MESSAGE,
} from "@/lib/auth/password-reset";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(payload);

  if (!parsed.success) {
    const message = parsed.error?.issues?.[0]?.message ?? "Dati non validi.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  const check = await checkPasswordResetCode(parsed.data.email, parsed.data.code);

  if (!check.ok) {
    return NextResponse.json(
      { success: false, message: RESET_INVALID_CODE_MESSAGE },
      { status: 400 },
    );
  }

  // Codice valido: nuova password, codice bruciato, sessioni mobile revocate.
  await applyNewPassword({
    userId: check.userId,
    codeId: check.codeId,
    password: parsed.data.password,
  });

  // Auto-login: token fresco + payload completo (stessa forma di /login).
  const user = await prisma.user.findUnique({ where: { id: check.userId } });
  const data = user ? await buildMobileAuthPayload(user) : null;

  if (!data) {
    // Password aggiornata, ma l'utente non ha un'autoscuola da cui entrare.
    return NextResponse.json({
      success: true,
      message: "Password aggiornata. Accedi con le nuove credenziali.",
    });
  }

  return NextResponse.json({ success: true, data });
}
