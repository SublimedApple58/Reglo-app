import { auth } from "@/auth";
import { prisma } from "@/db/prisma";

export const ACTIVE_COMPANY_REQUIRED = "ACTIVE_COMPANY_REQUIRED";
export const NO_COMPANY_FOUND = "NO_COMPANY_FOUND";

export async function getActiveCompanyContext() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("USER_NOT_AUTHENTICATED");
  }

  const [user, memberships] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId },
      select: { activeCompanyId: true },
    }),
    prisma.companyMember.findMany({
      where: { userId },
      include: { company: { include: { services: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!memberships.length) {
    throw new Error(NO_COMPANY_FOUND);
  }

  let activeCompanyId = user?.activeCompanyId ?? null;
  if (!activeCompanyId) {
    if (memberships.length === 1) {
      activeCompanyId = memberships[0].companyId;
      await prisma.user.update({
        where: { id: userId },
        data: { activeCompanyId },
      });
    } else {
      throw new Error(ACTIVE_COMPANY_REQUIRED);
    }
  }

  let membership = memberships.find(
    (entry) => entry.companyId === activeCompanyId,
  );

  if (!membership) {
    if (memberships.length === 1) {
      membership = memberships[0];
      activeCompanyId = membership.companyId;
      await prisma.user.update({
        where: { id: userId },
        data: { activeCompanyId },
      });
    } else {
      throw new Error(ACTIVE_COMPANY_REQUIRED);
    }
  }

  return {
    session,
    membership,
    company: membership.company,
    activeCompanyId,
    memberships,
  };
}
