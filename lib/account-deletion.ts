import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/db/prisma";
import { cancelOpenLessonsForDeletedStudent } from "@/lib/autoscuole/operational-cancellation";
import {
  archiveFormerStudentMemberships,
  DELETED_USER_NAME,
  type FormerStudentReason,
} from "@/lib/autoscuole/former-students";
import { getR2Bucket, getR2Client } from "@/lib/storage/r2";

const FORMER_STUDENT_REASON_BY_TRIGGER: Record<string, FormerStudentReason> = {
  self_delete: "self_delete",
  directory_removal: "office_removed",
};

/** Chi/cosa ha innescato la cancellazione — per l'audit e la diagnostica. */
export type AccountDeletionContext = {
  trigger?: "self_delete" | "directory_removal" | "orphan_release";
  actorUserId?: string | null;
  companyId?: string | null;
};

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

  await deleteAndAnonymizeUserAccount(existing.id, { trigger: "orphan_release" });
  return true;
}

export async function deleteAndAnonymizeUserAccount(
  userId: string,
  context?: AccountDeletionContext,
) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      image: true,
      signatureKey: true,
    },
  });

  if (!existingUser) {
    throw new Error("Utente non trovato.");
  }

  // Annulla le guide ancora aperte dell'allievo PRIMA di svuotare l'account, così
  // nessuna guida (futura o "da confermare") resta appesa a "Account eliminato" e
  // gli slot futuri tornano liberi. Best-effort: non deve bloccare la cancellazione.
  let lessonsCancelled = 0;
  try {
    const res = await cancelOpenLessonsForDeletedStudent({
      studentId: userId,
      actorUserId: context?.actorUserId ?? null,
    });
    lessonsCancelled = res.cancelled;
  } catch (error) {
    console.error("Account deletion: cancellazione guide fallita", error);
  }

  await prisma.$transaction(async (tx) => {
    await tx.mobileAccessToken.deleteMany({ where: { userId } });
    await tx.mobilePushDevice.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });

    // REG-629: prima di togliere il legame, l'allievo diventa «ex allievo» di
    // ogni autoscuola in cui era iscritto, così l'ufficio ne vede ancora nome,
    // scheda, storico guide e saldo.
    await archiveFormerStudentMemberships(tx, {
      userId,
      reason: FORMER_STUDENT_REASON_BY_TRIGGER[context?.trigger ?? ""] ?? "unknown",
      actorUserId: context?.actorUserId ?? null,
    });

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
        imageAvatar: null,
        signatureKey: null,
        phone: null,
        paymentMethod: null,
        activeCompanyId: null,
        emailVerified: null,
        role: "deleted",
      },
    });
  });

  // Foto e firma si cancellano davvero (REG-629), non solo il riferimento.
  // Best-effort: un oggetto orfano su R2 non deve far fallire la cancellazione.
  for (const key of [existingUser.image, existingUser.signatureKey]) {
    if (!key || /^https?:\/\//.test(key)) continue;
    try {
      await getR2Client().send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    } catch (error) {
      console.error("Account deletion: cancellazione file R2 fallita", error);
    }
  }

  // Audit best-effort: chi ha innescato la cancellazione e quante guide ha
  // annullato. Serve a scoprire la fonte reale delle "Account eliminato".
  try {
    await prisma.accountDeletionAudit.create({
      data: {
        deletedUserId: userId,
        trigger: context?.trigger ?? "unknown",
        actorUserId: context?.actorUserId ?? null,
        companyId: context?.companyId ?? null,
        lessonsCancelled,
      },
    });
  } catch (error) {
    console.error("Account deletion: scrittura audit fallita", error);
  }
}
