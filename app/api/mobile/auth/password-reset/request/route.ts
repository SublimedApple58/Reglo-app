import { NextResponse } from "next/server";

import { mobilePasswordResetRequestSchema } from "@/lib/validators";
import {
  requestPasswordResetCode,
  RESET_GENERIC_REQUEST_MESSAGE_APP,
} from "@/lib/auth/password-reset";

// Risposta sempre identica: non rivela mai se l'account esiste (no enumerazione).
// Il campo `email` accetta anche il telefono di chi accede col numero.
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = mobilePasswordResetRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Inserisci email o telefono." },
      { status: 400 },
    );
  }

  await requestPasswordResetCode(parsed.data.email, "app");

  return NextResponse.json({ success: true, message: RESET_GENERIC_REQUEST_MESSAGE_APP });
}
