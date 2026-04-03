import crypto from "crypto";

import { prisma } from "@/db/prisma";

const TOKEN_TTL_DAYS = Number(process.env.MOBILE_TOKEN_TTL_DAYS ?? "30");

export const hashMobileToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export async function issueMobileToken({
  userId,
  companyId,
}: {
  userId: string;
  companyId?: string | null;
}) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashMobileToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.mobileAccessToken.create({
    data: {
      userId,
      companyId: companyId ?? null,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function revokeMobileToken(token: string) {
  const tokenHash = hashMobileToken(token);
  await prisma.mobileAccessToken.deleteMany({ where: { tokenHash } });
}

export async function getMobileToken(token: string) {
  const tokenHash = hashMobileToken(token);
  const now = new Date();
  const record = await prisma.mobileAccessToken.findFirst({
    where: { tokenHash, expiresAt: { gt: now } },
  });
  if (!record) return null;

  // Sliding expiration: extend token TTL on each use so active users
  // are never logged out. Only extend when less than half the TTL remains
  // to avoid writing on every single request.
  const halfTtlMs = (TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) / 2;
  const remainingMs = record.expiresAt.getTime() - now.getTime();
  const newExpiresAt = remainingMs < halfTtlMs
    ? new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
    : undefined;

  await prisma.mobileAccessToken.update({
    where: { id: record.id },
    data: {
      lastUsedAt: now,
      ...(newExpiresAt ? { expiresAt: newExpiresAt } : {}),
    },
  });
  return record;
}

export const parseBearerToken = (header: string | null) => {
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token.trim();
};
