import nodeCrypto from "node:crypto";

import { prisma } from "@/db/prisma";

/**
 * Per-instructor invite codes.
 *
 * A student registering with an instructor code joins the school AND is
 * assigned to that instructor (`CompanyMember.assignedInstructorId`). The code
 * is accepted only while the instructor is `status=active` + `autonomousMode`.
 *
 * The signup field is shared with `Company.inviteCode` (lookup is
 * company-first), so uniqueness must hold ACROSS the two tables: generation
 * checks both, and `getCompanyInviteCode` does the mirror check.
 *
 * Charset: no 0/O/1/I to keep the code easy to read aloud and retype.
 */
export const INSTRUCTOR_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateInstructorInviteCode(): string {
  const bytes = nodeCrypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => INSTRUCTOR_CODE_CHARSET[b % INSTRUCTOR_CODE_CHARSET.length])
    .join("");
}

/**
 * Return the instructor's invite code, lazily generating one if missing
 * (legacy rows created before the backfill, or new rows from older code
 * paths). Race-safe: `updateMany` guarded on `inviteCode: null` + retry on
 * P2002, same pattern as `getCompanyInviteCode`.
 */
export async function ensureInstructorInviteCode(
  instructorId: string,
): Promise<string | null> {
  const existing = await prisma.autoscuolaInstructor.findUnique({
    where: { id: instructorId },
    select: { inviteCode: true },
  });
  if (existing?.inviteCode) return existing.inviteCode;
  if (!existing) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateInstructorInviteCode();
    // Cross-table check: a code matching an existing COMPANY code would be
    // shadowed forever (company-first lookup at signup) — skip it.
    const companyClash = await prisma.company.findUnique({
      where: { inviteCode: candidate },
      select: { id: true },
    });
    if (companyClash) continue;
    try {
      const result = await prisma.autoscuolaInstructor.updateMany({
        where: { id: instructorId, inviteCode: null },
        data: { inviteCode: candidate },
      });
      if (result.count > 0) return candidate;
      // A concurrent request won the race — return the winner's code.
      const fresh = await prisma.autoscuolaInstructor.findUnique({
        where: { id: instructorId },
        select: { inviteCode: true },
      });
      return fresh?.inviteCode ?? null;
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") continue;
      throw err;
    }
  }
  return null;
}
