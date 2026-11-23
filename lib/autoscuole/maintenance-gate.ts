/**
 * REG-773 — Cancelli degli invii durante la modalità manutenzione.
 *
 * Modulo volutamente leggero (solo Prisma): lo importano `push.ts`,
 * `notify.ts`, `whatsapp-delivery.ts` e i job Trigger.dev, che non devono
 * tirarsi dietro auth/next. Le scritture stanno in `maintenance.ts`.
 */

import { prisma as defaultPrisma } from "@/db/prisma";
import {
  isAudienceSilencedByMaintenance,
  type MaintenanceAudience,
  type MaintenanceScope,
} from "@/lib/maintenance";

type PrismaLike = Pick<typeof defaultPrisma, "company" | "companyMember">;

export async function getCompanyMaintenanceScope(
  companyId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<MaintenanceScope | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { maintenanceScope: true },
  });
  return company?.maintenanceScope ?? null;
}

/**
 * Un messaggio verso questo pubblico, per questa autoscuola, va taciuto?
 * È il cancello degli invii (notify, push, WhatsApp, messaggi a regola).
 */
export async function isAudienceSilenced(
  companyId: string,
  audience: MaintenanceAudience,
  prisma: PrismaLike = defaultPrisma,
): Promise<boolean> {
  const scope = await getCompanyMaintenanceScope(companyId, prisma);
  return isAudienceSilencedByMaintenance(scope, audience);
}

/**
 * Toglie dalla lista gli utenti a cui, per la manutenzione, non si deve
 * scrivere: tutti con EVERYONE, i titolari con OWNER_ONLY. Rete di sicurezza
 * per le push mandate direttamente, fuori da `notifyAutoscuolaUser`.
 */
export async function filterUsersReachableDuringMaintenance(
  companyId: string,
  userIds: string[],
  prisma: PrismaLike = defaultPrisma,
): Promise<string[]> {
  if (!userIds.length) return userIds;
  const scope = await getCompanyMaintenanceScope(companyId, prisma);
  if (!scope) return userIds;
  if (scope === "EVERYONE") return [];
  const owners = await prisma.companyMember.findMany({
    where: {
      companyId,
      userId: { in: userIds },
      autoscuolaRole: { in: ["OWNER", "INSTRUCTOR_OWNER"] },
    },
    select: { userId: true },
  });
  const ownerIds = new Set(owners.map((row) => row.userId));
  return userIds.filter((id) => !ownerIds.has(id));
}

/**
 * Filtro Prisma per i job che scrivono alle persone: esclude le autoscuole in
 * manutenzione per tutti. (`not: "EVERYONE"` scarterebbe anche i NULL.)
 */
export const companyNotClosedToEveryone = {
  OR: [{ maintenanceScope: null }, { maintenanceScope: "OWNER_ONLY" as const }],
};
