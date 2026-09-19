import crypto from "crypto";

import { after } from "next/server";

import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { compare, hash } from "@/lib/encrypt";

/** OTP / reset-code policy (password reset, web + mobile). */
export const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const RESET_CODE_MAX_ATTEMPTS = 5; // wrong verifications before the code is burned
export const RESET_RESEND_COOLDOWN_MS = 60 * 1000; // min gap between "send code" requests
export const RESET_MAX_REQUESTS_WINDOW_MS = 15 * 60 * 1000;
export const RESET_MAX_REQUESTS_PER_WINDOW = 5; // codes a single user can request per window

/** 6-digit numeric code, zero-padded (leading zeros allowed). */
export const generateOtpCode = (): string =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

/**
 * Rate-limit gate for "send a reset code". Returns false when the user has
 * requested too many codes recently, or asked again within the cooldown.
 * Evaluated before generating a new code; callers stay generic to the client.
 */
export async function canRequestResetCode(userId: string): Promise<boolean> {
  const now = Date.now();

  const recent = await prisma.passwordResetCode.findMany({
    where: {
      userId,
      createdAt: { gt: new Date(now - RESET_MAX_REQUESTS_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recent.length >= RESET_MAX_REQUESTS_PER_WINDOW) return false;
  if (recent[0] && now - recent[0].createdAt.getTime() < RESET_RESEND_COOLDOWN_MS) {
    return false;
  }
  return true;
}

/**
 * Invalidate the user's pending codes and create a fresh one. Returns the
 * plaintext code (only used to send the email — never stored in the clear).
 */
export async function createResetCode(userId: string): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await hash(code);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);

  // Burn any still-pending codes so only the latest one is valid.
  await prisma.passwordResetCode.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.passwordResetCode.create({
    data: { userId, codeHash, expiresAt },
  });

  return code;
}

/** Latest non-consumed, non-expired reset code for the user, if any. */
export function findValidResetCode(userId: string) {
  return prisma.passwordResetCode.findFirst({
    where: {
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuore del flusso, condiviso tra le route mobile (`/api/mobile/auth/
// password-reset/*`) e le server action del web (`lib/actions/
// password-reset.actions.ts`). La policy di sicurezza — niente enumerazione
// degli account, codice bruciato dopo N tentativi, sessioni revocate — vive
// qui una volta sola: due copie divergono, e a divergere sarebbe la sicurezza.
// ─────────────────────────────────────────────────────────────────────────────

/** Messaggio unico per codice sbagliato, scaduto o inesistente: non dice quale. */
export const RESET_INVALID_CODE_MESSAGE = "Codice non valido o scaduto.";

/** Risposta di "manda il codice": identica che l'email esista o no. */
export const RESET_GENERIC_REQUEST_MESSAGE =
  "Se l'email è registrata, ti abbiamo inviato un codice.";

/**
 * Manda un codice all'email, se corrisponde a un account e i limiti lo
 * consentono. Non restituisce niente **di proposito**: il chiamante deve
 * rispondere lo stesso identico messaggio in tutti i casi.
 *
 * L'invio va in `after()` così la latenza è uniforme anche quando l'email non
 * esiste (altrimenti il tempo di risposta diventa un oracolo).
 */
export async function requestPasswordResetCode(
  rawEmail: string,
  channel: "app" | "browser",
): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user || !(await canRequestResetCode(user.id))) return;

  const code = await createResetCode(user.id);
  const minutes = Math.round(RESET_CODE_TTL_MS / 60000);
  const name = user.name && user.name !== "NO_NAME" ? user.name : null;
  const where = channel === "app" ? "nell'app" : "nella pagina di recupero";

  after(async () => {
    try {
      await sendDynamicEmail({
        to: email,
        subject: "Il tuo codice per reimpostare la password — Reglo",
        body: [
          name ? `Ciao ${name},` : "Ciao,",
          "",
          `hai richiesto di reimpostare la password del tuo account Reglo. Usa questo codice ${where}:`,
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

type ResetCodeCheck =
  | { ok: true; userId: string; email: string; codeId: string }
  | { ok: false };

/**
 * Verifica il codice **senza consumarlo** (il passo password arriva dopo).
 * Ogni tentativo sbagliato incrementa il contatore e, oltre la soglia, brucia
 * il codice: chi prova a indovinare ha 5 colpi, non infiniti.
 */
export async function checkPasswordResetCode(
  rawEmail: string,
  rawCode: string,
): Promise<ResetCodeCheck> {
  const email = rawEmail.toLowerCase().trim();
  const code = rawCode.trim();

  const user = await prisma.user.findFirst({ where: { email } });
  const record = user ? await findValidResetCode(user.id) : null;

  if (!user || !record) return { ok: false };

  if (!(await compare(code, record.codeHash))) {
    const attempts = record.attempts + 1;
    await prisma.passwordResetCode.update({
      where: { id: record.id },
      data: {
        attempts,
        ...(attempts >= RESET_CODE_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
      },
    });
    return { ok: false };
  }

  return { ok: true, userId: user.id, email, codeId: record.id };
}

/**
 * Applica la nuova password, brucia il codice e revoca **tutte** le sessioni
 * mobile: se qualcuno era entrato con la vecchia password, da qui in poi non
 * c'è più. Le tre scritture stanno in una transazione sola.
 */
export async function applyNewPassword({
  userId,
  codeId,
  password,
}: {
  userId: string;
  codeId: string;
  password: string;
}): Promise<void> {
  const passwordHash = await hash(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password: passwordHash } }),
    prisma.passwordResetCode.update({
      where: { id: codeId },
      data: { consumedAt: new Date() },
    }),
    prisma.mobileAccessToken.deleteMany({ where: { userId } }),
  ]);
}
