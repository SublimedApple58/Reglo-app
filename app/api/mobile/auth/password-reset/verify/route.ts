import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { compare } from "@/lib/encrypt";
import { passwordResetVerifySchema } from "@/lib/validators";
import {
  findValidResetCode,
  RESET_CODE_MAX_ATTEMPTS,
} from "@/lib/auth/password-reset";

const INVALID_MESSAGE = "Codice non valido o scaduto.";

// Soft check used to unlock the "new password" step. Validates the code but
// does NOT consume it — consumption happens at /confirm.
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetVerifySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: INVALID_MESSAGE },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const code = parsed.data.code.trim();

  const user = await prisma.user.findFirst({ where: { email } });
  const record = user ? await findValidResetCode(user.id) : null;

  if (!record) {
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
        // Burn the code after too many wrong tries.
        ...(attempts >= RESET_CODE_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
      },
    });
    return NextResponse.json(
      { success: false, message: INVALID_MESSAGE },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
