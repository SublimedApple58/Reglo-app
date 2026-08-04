'use server';

import { prisma } from '@/db/prisma';
import { requireServiceAccess } from '@/lib/service-access';
import { getSignedAssetUrl } from '@/lib/storage/r2';
import { formatError } from '@/lib/utils';

const MAX_IDS = 500;

export type UserPhotoUrlsResult = {
  /** userId → URL foto (assente/null = nessuna foto) */
  users: Record<string, string | null>;
  /** AutoscuolaInstructor.id → URL foto dell'utente collegato */
  instructors: Record<string, string | null>;
};

/**
 * Risoluzione batched delle foto profilo per gli avatar di liste/agenda.
 * Company-scoped: risolve solo utenti membri (e istruttori) dell'autoscuola
 * attiva del chiamante. Funziona sia da web (sessione) sia da mobile (Bearer),
 * via getActiveCompanyContext.
 */
export async function getUserPhotoUrls(input: {
  userIds?: string[];
  instructorIds?: string[];
}) {
  try {
    const { membership } = await requireServiceAccess('AUTOSCUOLE');
    const companyId = membership.companyId;

    const userIds = [...new Set(input.userIds ?? [])].slice(0, MAX_IDS);
    const instructorIds = [...new Set(input.instructorIds ?? [])].slice(0, MAX_IDS);

    const [users, instructors] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({
            where: {
              id: { in: userIds },
              image: { not: null },
              companyMembers: { some: { companyId } },
            },
            select: { id: true, image: true },
          })
        : [],
      instructorIds.length
        ? prisma.autoscuolaInstructor.findMany({
            where: { id: { in: instructorIds }, companyId },
            select: { id: true, user: { select: { image: true } } },
          })
        : [],
    ]);

    const result: UserPhotoUrlsResult = { users: {}, instructors: {} };

    await Promise.all([
      ...users.map(async (user) => {
        try {
          result.users[user.id] = await getSignedAssetUrl(user.image as string);
        } catch {
          result.users[user.id] = null;
        }
      }),
      ...instructors.map(async (instructor) => {
        const image = instructor.user?.image;
        if (!image) {
          result.instructors[instructor.id] = null;
          return;
        }
        try {
          result.instructors[instructor.id] = await getSignedAssetUrl(image);
        } catch {
          result.instructors[instructor.id] = null;
        }
      }),
    ]);

    return { success: true as const, data: result };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
