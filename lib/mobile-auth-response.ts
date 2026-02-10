import { prisma } from "@/db/prisma";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import { getOrCreateInstructorForUser } from "@/lib/autoscuole/instructors";

export async function buildMobileAuthPayload({
  userId,
  activeCompanyId,
}: {
  userId: string;
  activeCompanyId?: string | null;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("Utente non trovato.");
  }

  const memberships = await prisma.companyMember.findMany({
    where: { userId },
    include: { company: { include: { services: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!memberships.length) {
    throw new Error("Nessuna company associata.");
  }

  let resolvedCompanyId =
    activeCompanyId ?? user.activeCompanyId ?? (memberships.length === 1 ? memberships[0].companyId : null);

  if (!resolvedCompanyId) {
    throw new Error("Selezione company richiesta.");
  }

  let activeMembership = memberships.find(
    (entry) => entry.companyId === resolvedCompanyId,
  );

  if (!activeMembership) {
    if (memberships.length === 1) {
      activeMembership = memberships[0];
      resolvedCompanyId = activeMembership.companyId;
    } else {
      throw new Error("Company non valida per questo utente.");
    }
  }

  if (user.activeCompanyId !== resolvedCompanyId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeCompanyId: resolvedCompanyId },
    });
  }

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

  let instructorId: string | null = null;
  if (resolvedCompanyId && activeMembership?.autoscuolaRole === "INSTRUCTOR") {
    const instructor = await getOrCreateInstructorForUser({
      companyId: resolvedCompanyId,
      userId: user.id,
      name: user.name ?? user.email.split("@")[0] ?? "Istruttore",
    });
    instructorId = instructor.id;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    activeCompanyId: resolvedCompanyId,
    autoscuolaRole: activeMembership?.autoscuolaRole ?? null,
    instructorId,
    companies,
  };
}
