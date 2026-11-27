"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import { isInstructor, isOwner } from "@/lib/autoscuole/roles";
import { getStudentAvailability } from "@/lib/autoscuole/student-availability-store";

/**
 * REG-802 — disponibilità a fasce di un allievo, per lo staff (sola lettura):
 * titolare, istruttori e admin della stessa autoscuola. La usano il dettaglio
 * allievo dell'app (GET /api/autoscuole/students/:id/availability) e il drawer
 * allievo della web app. L'allievo legge le sue da `me/availability`.
 */
const schema = z.object({ studentId: z.string().uuid() });

export async function getStudentAvailabilityForStaff(input: z.infer<typeof schema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const { studentId } = schema.parse(input);
    const staff =
      membership.role === "admin" || isOwner(membership.autoscuolaRole) || isInstructor(membership.autoscuolaRole);
    if (!staff) {
      return { success: false as const, message: "Non puoi vedere questa disponibilità." };
    }
    const student = await prisma.companyMember.findFirst({
      where: { companyId: membership.companyId, userId: studentId, autoscuolaRole: "STUDENT" },
      select: { userId: true },
    });
    if (!student) return { success: false as const, message: "Allievo non trovato." };
    const data = await getStudentAvailability(membership.companyId, studentId);
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
