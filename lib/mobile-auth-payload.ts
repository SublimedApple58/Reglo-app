import type { User } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { issueMobileToken } from "@/lib/mobile-auth";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import { getOrCreateInstructorForUser } from "@/lib/autoscuole/instructors";
import { isInstructor } from "@/lib/autoscuole/roles";

/**
 * Assembles the full mobile auth payload for a user: resolves memberships,
 * signs company logo URLs, issues a fresh mobile token and resolves the
 * instructor id for the active company. Shared by the login route and the
 * password-reset confirm route (auto-login).
 *
 * Returns `null` when the user has no company membership (caller decides how to
 * surface that — login → 403, reset → "accedi manualmente").
 */
export async function buildMobileAuthPayload(user: User) {
  const memberships = await prisma.companyMember.findMany({
    where: { userId: user.id },
    include: { company: { include: { services: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!memberships.length) return null;

  const companies = await Promise.all(
    memberships.map(async (entry) => {
      let logoUrl: string | null = null;
      if (entry.company.logoKey) {
        try {
          logoUrl = await getSignedAssetUrl(entry.company.logoKey);
        } catch {
          logoUrl = null;
        }
      }

      return {
        id: entry.company.id,
        name: entry.company.name,
        logoKey: entry.company.logoKey,
        logoUrl,
        role: entry.role,
        autoscuolaRole: entry.autoscuolaRole,
        services: entry.company.services,
      };
    }),
  );

  let activeCompanyId = user.activeCompanyId;
  if (!activeCompanyId && memberships.length === 1) {
    activeCompanyId = memberships[0].companyId;
    await prisma.user.update({
      where: { id: user.id },
      data: { activeCompanyId },
    });
  }

  const tokenRes = await issueMobileToken({
    userId: user.id,
    companyId: activeCompanyId ?? null,
  });

  const activeMembership = memberships.find(
    (entry) => entry.companyId === activeCompanyId,
  );

  let instructorId: string | null = null;
  if (activeCompanyId && isInstructor(activeMembership?.autoscuolaRole)) {
    const instructor = await getOrCreateInstructorForUser({
      companyId: activeCompanyId,
      userId: user.id,
      name: user.name ?? user.email.split("@")[0] ?? "Istruttore",
    });
    instructorId = instructor.id;
  }

  return {
    token: tokenRes.token,
    expiresAt: tokenRes.expiresAt,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
    },
    activeCompanyId,
    autoscuolaRole: activeMembership?.autoscuolaRole ?? null,
    instructorId,
    companies,
  };
}
