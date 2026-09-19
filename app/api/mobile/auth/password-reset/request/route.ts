import { NextResponse } from "next/server";

import { passwordResetRequestSchema } from "@/lib/validators";
import {
  requestPasswordResetCode,
  RESET_GENERIC_REQUEST_MESSAGE,
} from "@/lib/auth/password-reset";

// Risposta sempre identica: non rivela mai se l'email esiste (no enumerazione).
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Email non valida." },
      { status: 400 },
    );
  }

  await requestPasswordResetCode(parsed.data.email, "app");

  return NextResponse.json({ success: true, message: RESET_GENERIC_REQUEST_MESSAGE });
}
