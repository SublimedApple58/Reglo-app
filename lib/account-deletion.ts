import { prisma } from "@/db/prisma";

const DELETED_USER_NAME = "Account eliminato";

const buildDeletedEmail = (userId: string) =>
  `deleted+${userId}@deleted.reglo.local`;

/**
 * If `email` is held by an ORPHANED account (zero company memberships — e.g.
 * a member removed from the Directory before deletion started anonymizing, or
 * whose company disappeared), anonymize it so the address becomes reusable.
 * Accounts that still belong to at least one company are left untouched.
 *
 * Returns true when the email is free (no user, or orphan released),
 * false when a real account still owns it.
 */
export async function releaseEmailIfOrphaned(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  if (!existing) return true;

  const memberships = await prisma.companyMember.count({
    where: { userId: existing.id },
  });
  if (memberships > 0) return false;

  await deleteAndAnonymizeUserAccount(existing.id);
  return true;
}

export async function deleteAndAnonymizeUserAccount(userId: string) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!existingUser) {
    throw new Error("Utente non trovato.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.mobileAccessToken.deleteMany({ where: { userId } });
    await tx.mobilePushDevice.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });

    await tx.companyMember.deleteMany({ where: { userId } });

    await tx.companyInvite.updateMany({
      where: {
        email: existingUser.email,
        status: "pending",
      },
      data: {
        status: "cancelled",
      },
    });

    await tx.autoscuolaInstructor.updateMany({
      where: { userId },
      data: {
        userId: null,
        status: "inactive",
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: buildDeletedEmail(userId),
        password: null,
        image: null,
        phone: null,
        paymentMethod: null,
        activeCompanyId: null,
        emailVerified: null,
        role: "deleted",
      },
    });
  });
}
