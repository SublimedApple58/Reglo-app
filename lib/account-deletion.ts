import { prisma } from "@/db/prisma";

const DELETED_USER_NAME = "Account eliminato";

const buildDeletedEmail = (userId: string) =>
  `deleted+${userId}@deleted.reglo.local`;

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
