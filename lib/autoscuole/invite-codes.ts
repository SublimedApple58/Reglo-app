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
 * REG-706: un codice è già usato da un'autoscuola, un istruttore o un luogo?
 * Il campo della registrazione è unico per i tre tipi di codice, quindi un
 * codice nuovo non deve mai coincidere con uno esistente di un'altra tabella.
 */
export async function isSignupCodeTaken(candidate: string): Promise<boolean> {
  const [company, instructor, location] = await Promise.all([
    prisma.company.findUnique({ where: { inviteCode: candidate }, select: { id: true } }),
    prisma.autoscuolaInstructor.findUnique({ where: { inviteCode: candidate }, select: { id: true } }),
    prisma.autoscuolaLocation.findUnique({ where: { inviteCode: candidate }, select: { id: true } }),
  ]);
  return Boolean(company || instructor || location);
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
    // Cross-table check: a code matching an existing COMPANY (or location,
    // REG-706) code would be shadowed at signup — skip it.
    if (await isSignupCodeTaken(candidate)) continue;
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

/**
 * REG-706: codice di invito del luogo, generato alla prima richiesta (stesso
 * alfabeto e stesso schema race-safe dei codici istruttore). `null` se il
 * luogo non esiste o è archiviato.
 */
export async function ensureLocationInviteCode(locationId: string): Promise<string | null> {
  const existing = await prisma.autoscuolaLocation.findUnique({
    where: { id: locationId },
    select: { inviteCode: true, archivedAt: true },
  });
  if (!existing || existing.archivedAt) return null;
  if (existing.inviteCode) return existing.inviteCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateInstructorInviteCode();
    if (await isSignupCodeTaken(candidate)) continue;
    try {
      const result = await prisma.autoscuolaLocation.updateMany({
        where: { id: locationId, inviteCode: null },
        data: { inviteCode: candidate },
      });
      if (result.count > 0) return candidate;
      const fresh = await prisma.autoscuolaLocation.findUnique({
        where: { id: locationId },
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
