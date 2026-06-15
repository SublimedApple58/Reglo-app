import crypto from "crypto";

import { prisma } from "@/db/prisma";
import { hash } from "@/lib/encrypt";

/** OTP / reset-code policy (mobile password reset). */
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
