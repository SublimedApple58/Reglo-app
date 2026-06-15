import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { compare, hash } from "@/lib/encrypt";
import { buildMobileAuthPayload } from "@/lib/mobile-auth-payload";
import { passwordResetConfirmSchema } from "@/lib/validators";
import {
  findValidResetCode,
  RESET_CODE_MAX_ATTEMPTS,
} from "@/lib/auth/password-reset";

const INVALID_MESSAGE = "Codice non valido o scaduto.";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(payload);

  if (!parsed.success) {
    const message =
      parsed.error?.issues?.[0]?.message ?? "Dati non validi.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const code = parsed.data.code.trim();

  const user = await prisma.user.findFirst({ where: { email } });
  const record = user ? await findValidResetCode(user.id) : null;

  if (!user || !record) {
    return NextResponse.json(
      { success: false, message: INVALID_MESSAGE },
      { status: 400 },
    );
  }

  const ok = await compare(code, record.codeHash);
  if (!ok) {
    const attempts = record.attempts + 1;
    await prisma.passwordResetCode.update({
      where: { id: record.id },
      data: {
        attempts,
        ...(attempts >= RESET_CODE_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
      },
    });
    return NextResponse.json(
      { success: false, message: INVALID_MESSAGE },
      { status: 400 },
    );
  }

  // Code is valid: set the new password, burn the code, and revoke every
  // existing mobile session for security (the user must re-auth elsewhere).
  const newPasswordHash = await hash(parsed.data.password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    }),
    prisma.passwordResetCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.mobileAccessToken.deleteMany({ where: { userId: user.id } }),
  ]);

  // Auto-login: issue a fresh token + full payload (same shape as /login).
  const data = await buildMobileAuthPayload(user);

  if (!data) {
    // Password is updated but the user has no company membership to enter with.
    return NextResponse.json({
      success: true,
      message: "Password aggiornata. Accedi con le nuove credenziali.",
    });
  }

  return NextResponse.json({ success: true, data });
}
