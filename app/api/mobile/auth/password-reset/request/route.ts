import { after, NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { passwordResetRequestSchema } from "@/lib/validators";
import {
  canRequestResetCode,
  createResetCode,
  RESET_CODE_TTL_MS,
} from "@/lib/auth/password-reset";

// Always returns the same generic success — never reveals whether the email
// exists (no account enumeration).
const GENERIC_MESSAGE =
  "Se l'email è registrata, ti abbiamo inviato un codice.";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Email non valida." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findFirst({ where: { email } });

  // Only do work for a real account, and only when within rate limits. Both the
  // lookup miss and the throttle return the same generic success below.
  if (user && (await canRequestResetCode(user.id))) {
    const code = await createResetCode(user.id);
    const minutes = Math.round(RESET_CODE_TTL_MS / 60000);
    const name = user.name && user.name !== "NO_NAME" ? user.name : null;

    // Send the email off the response path: keeps latency uniform (no timing
    // oracle) and the response fast.
    after(async () => {
      try {
        await sendDynamicEmail({
          to: email,
          subject: "Il tuo codice per reimpostare la password — Reglo",
          body: [
            name ? `Ciao ${name},` : "Ciao,",
            "",
            "hai richiesto di reimpostare la password del tuo account Reglo. Usa questo codice nell'app:",
            "",
            code,
            "",
            `Il codice scade tra ${minutes} minuti.`,
            "Se non hai richiesto tu il reset, ignora questa email: la password resta invariata.",
          ].join("\n"),
        });
      } catch (err) {
        console.error("[password-reset] email send failed", err);
      }
    });
  }

  return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
}
