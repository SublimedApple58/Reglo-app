'use server';

import { prisma } from '@/db/prisma';
import { requireServiceAccess } from '@/lib/service-access';
import { isInstructor, isOwner } from '@/lib/autoscuole/roles';
import { getSignedAssetUrl } from '@/lib/storage/r2';
import { formatError } from '@/lib/utils';

/**
 * Anteprime (URL firmati) di foto profilo e firma di un allievo,
 * per la sezione "Foto e firma" del dettaglio allievo.
 */
export async function getStudentMediaOverview(studentUserId: string) {
  try {
    const { membership } = await requireServiceAccess('AUTOSCUOLE');
    const isStaff =
      membership.role === 'admin' ||
      isOwner(membership.autoscuolaRole) ||
      isInstructor(membership.autoscuolaRole);
    if (!isStaff) {
      return { success: false as const, message: 'Non autorizzato.' };
    }

    const student = await prisma.user.findFirst({
      where: {
        id: studentUserId,
        companyMembers: { some: { companyId: membership.companyId } },
      },
      select: { image: true, signatureKey: true },
    });
    if (!student) {
      return { success: false as const, message: 'Allievo non trovato.' };
    }

    const [photoUrl, signatureUrl] = await Promise.all([
      student.image ? getSignedAssetUrl(student.image).catch(() => null) : null,
      student.signatureKey
        ? getSignedAssetUrl(student.signatureKey).catch(() => null)
        : null,
    ]);

    return {
      success: true as const,
      data: { photoUrl, signatureUrl },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
