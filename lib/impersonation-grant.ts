import crypto from "crypto";

// Grant firmato e a scadenza breve per l'impersonazione backoffice ("Accedi come
// titolare"). Coniato SOLO dopo requireGlobalAdmin e consumato subito dal provider
// NextAuth `impersonation`. Firma HMAC-SHA256 sul secret di sessione (nessuna env
// nuova, nessuna dipendenza esterna) — stesso stile di lib/mobile-auth.ts.

export type ImpersonationGrant = {
  targetUserId: string;
  companyId: string;
  purpose: "impersonation";
  iat: number;
  exp: number;
};

// Volutamente cortissima: il grant viene consumato immediatamente dal signIn.
const GRANT_TTL_SECONDS = 60;

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET mancante: impossibile firmare il grant di impersonazione.");
  }
  return secret;
}

function sign(payload64: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload64).digest("base64url");
}

export function signImpersonationGrant(input: {
  targetUserId: string;
  companyId: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: ImpersonationGrant = {
    targetUserId: input.targetUserId,
    companyId: input.companyId,
    purpose: "impersonation",
    iat: now,
    exp: now + GRANT_TTL_SECONDS,
  };
  const payload64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payload64}.${sign(payload64)}`;
}

export function verifyImpersonationGrant(
  token: string | null | undefined,
): ImpersonationGrant | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload64, sig] = parts;

  // Confronto timing-safe della firma.
  const expected = Buffer.from(sign(payload64));
  const provided = Buffer.from(sig);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  let payload: ImpersonationGrant;
  try {
    payload = JSON.parse(Buffer.from(payload64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.purpose !== "impersonation") return null;
  if (!payload.targetUserId || !payload.companyId) return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}
