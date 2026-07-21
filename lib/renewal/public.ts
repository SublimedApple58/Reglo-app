import "server-only";

import { prisma } from "@/db/prisma";
import { getRedis } from "@/lib/cache/redis";
import { getServiceLimits, normalizeCompanyServices } from "@/lib/services";

/**
 * Rinnovo Patenti — public (no-auth) helpers used by /api/renewal/* route
 * handlers. These run OUTSIDE the auth middleware (api paths bypass it), so the
 * only trust anchor is a valid, renewal-enabled company slug plus rate limiting.
 */

export type ResolvedRenewalCompany = {
  id: string;
  name: string;
  slug: string;
  /** Whether this autoscuola requires the anamnestic certificate. */
  anamnesticRequired: boolean;
};

/**
 * Resolve a public slug to a company whose renewal flow is reachable.
 * Two gates: `licenseRenewalEnabled` (commercial, backoffice) AND
 * `licenseRenewalPublicActive` (owner switch; undefined = active).
 */
export async function resolveRenewalCompany(
  slug: string,
): Promise<ResolvedRenewalCompany | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const company = await prisma.company.findUnique({
    where: { renewalPublicSlug: normalized },
    include: { services: true },
  });
  if (!company) return null;
  const limits = getServiceLimits(normalizeCompanyServices(company.services), "AUTOSCUOLE");
  if (!limits.licenseRenewalEnabled) return null;
  if (limits.licenseRenewalPublicActive === false) return null;
  return {
    id: company.id,
    name: company.name,
    slug: normalized,
    anamnesticRequired: Boolean(limits.licenseRenewalAnamnesticRequired),
  };
}

/**
 * Resolve a resume token (from the "ricontatto automatico" email) to the
 * request it reopens. Rejects unknown, expired, or cross-company tokens.
 */
export async function resolveResumeToken(
  slug: string,
  token: string,
): Promise<{ company: ResolvedRenewalCompany; requestId: string } | null> {
  const company = await resolveRenewalCompany(slug);
  if (!company) return null;
  if (!token || token.length < 16) return null;

  const request = await prisma.renewalRequest.findUnique({
    where: { resumeToken: token },
    select: { id: true, companyId: true, resumeTokenExpiresAt: true },
  });
  if (!request || request.companyId !== company.id) return null;
  if (!request.resumeTokenExpiresAt || request.resumeTokenExpiresAt < new Date()) {
    return null;
  }
  return { company, requestId: request.id };
}

/**
 * Fixed-window rate limiter backed by Upstash Redis. Fails OPEN when Redis is
 * not configured (dev) so local work is never blocked. Returns whether the call
 * is allowed and how many remain in the window.
 */
export async function renewalRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number }> {
  const redis = getRedis();
  if (!redis) return { ok: true, remaining: limit };
  const key = `renewal:rl:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  const remaining = Math.max(0, limit - count);
  return { ok: count <= limit, remaining };
}

/** Best-effort client IP from standard proxy headers. */
export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
