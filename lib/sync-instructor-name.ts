import { prisma } from '@/db/prisma';

/**
 * Keep the denormalized `AutoscuolaInstructor.name` in sync with `User.name`.
 *
 * Instructor lists & selectors across the app read `AutoscuolaInstructor.name`
 * (a copy), NOT `User.name`. Without this sync, editing your profile name fixes
 * Account Settings but leaves the old name everywhere instructors are listed.
 *
 * A user can be an instructor in multiple companies (unique companyId+userId),
 * so we update every linked row. No-op for users who are not instructors.
 */
export async function syncInstructorName(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.autoscuolaInstructor.updateMany({
    where: { userId },
    data: { name: trimmed },
  });
}
