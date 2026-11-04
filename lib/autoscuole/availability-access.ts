/**
 * REG-717 — chi può scrivere una disponibilità (settimana tipo, override,
 * fasce), oltre a `requireServiceAccess` che controlla solo il servizio.
 *
 * - Titolare, istruttore titolare e admin: tutto, nella propria autoscuola.
 * - Istruttore: le proprie fasce e i veicoli (l'app istruttore li gestisce
 *   dalla scheda «Gestione»).
 * - Allievo: solo le proprie preferenze (`ownerType: "student"`, l'id è il suo
 *   utente), come da Impostazioni dell'app.
 * - Nessun altro.
 *
 * La regola è pura (`canWriteAvailability`); `assertCanWriteAvailability` la
 * applica caricando, solo quando serve, il profilo istruttore di chi scrive.
 */

import { prisma } from "@/db/prisma";
import { isOwner } from "@/lib/autoscuole/roles";

export const AVAILABILITY_WRITE_FORBIDDEN = "Non puoi modificare questa disponibilità.";

export type AvailabilityWriter = {
  role: string;
  autoscuolaRole: string | null;
  userId: string;
  companyId: string;
};

export type AvailabilityOwnerType = "instructor" | "vehicle" | "student";

export const isAvailabilityManager = (m: Pick<AvailabilityWriter, "role" | "autoscuolaRole">) =>
  m.role === "admin" || isOwner(m.autoscuolaRole);

/** Pura: `ownInstructorId` è il profilo istruttore di chi scrive (o null). */
export function canWriteAvailability(
  m: Pick<AvailabilityWriter, "role" | "autoscuolaRole" | "userId">,
  ownerType: AvailabilityOwnerType,
  ownerId: string,
  ownInstructorId: string | null,
): boolean {
  if (isAvailabilityManager(m)) return true;
  if (m.autoscuolaRole === "INSTRUCTOR") {
    if (ownerType === "vehicle") return true;
    if (ownerType === "instructor") return ownInstructorId !== null && ownerId === ownInstructorId;
    return false;
  }
  if (m.autoscuolaRole === "STUDENT") {
    return ownerType === "student" && ownerId === m.userId;
  }
  return false;
}

/** `null` se può scrivere, altrimenti il messaggio d'errore. */
export async function assertCanWriteAvailability(
  m: AvailabilityWriter,
  ownerType: AvailabilityOwnerType,
  ownerId: string,
): Promise<string | null> {
  let ownInstructorId: string | null = null;
  if (!isAvailabilityManager(m) && m.autoscuolaRole === "INSTRUCTOR" && ownerType === "instructor") {
    const own = await prisma.autoscuolaInstructor.findFirst({
      where: { companyId: m.companyId, userId: m.userId },
      select: { id: true },
    });
    ownInstructorId = own?.id ?? null;
  }
  return canWriteAvailability(m, ownerType, ownerId, ownInstructorId) ? null : AVAILABILITY_WRITE_FORBIDDEN;
}

/** Guide fuori disponibilità: le approva lo staff, mai un allievo. */
export const canApproveAvailabilityOverride = (m: Pick<AvailabilityWriter, "role" | "autoscuolaRole">) =>
  isAvailabilityManager(m) || m.autoscuolaRole === "INSTRUCTOR";
