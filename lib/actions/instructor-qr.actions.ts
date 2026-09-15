"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner, isStudent } from "@/lib/autoscuole/roles";
import { ensureInstructorInviteCode } from "@/lib/autoscuole/invite-codes";

/**
 * REG-451 — dati della "Card QR da stampare" (scheda Codice dell'istruttore):
 * nome, autoscuola e codice (generato al volo se l'istruttore non ne ha ancora
 * uno). Il personale vede la card di ogni istruttore; un istruttore solo la sua.
 */
export async function getInstructorQrCard(input: { instructorId: string }) {
  try {
    const { instructorId } = z.object({ instructorId: z.string().uuid() }).parse(input);
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (isStudent(membership.autoscuolaRole)) {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: { id: instructorId, companyId: membership.companyId },
      select: { id: true, name: true, userId: true, inviteCode: true, company: { select: { name: true } } },
    });
    if (!instructor) return { success: false as const, message: "Istruttore non trovato." };
    if (!isOwner(membership.autoscuolaRole) && instructor.userId !== membership.userId) {
      return { success: false as const, message: "Operazione non consentita." };
    }

    const code = instructor.inviteCode ?? (await ensureInstructorInviteCode(instructor.id));
    if (!code) return { success: false as const, message: "Impossibile generare il codice." };

    return {
      success: true as const,
      data: { code, instructorName: instructor.name, companyName: instructor.company.name },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
