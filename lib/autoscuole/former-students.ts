/**
 * Ex allievi (REG-629).
 *
 * Quando un allievo lascia l'autoscuola — cancella l'account dall'app oppure
 * l'ufficio lo rimuove dalla Directory — il legame `CompanyMember` sparisce
 * come prima, ma prima di toglierlo scriviamo una riga
 * `AutoscuolaFormerStudent`: nome, motivo, data, percorso patente. Basta questo
 * perché l'ufficio continui a vedere scheda, storico guide e saldo (le guide e i
 * pagamenti sono già legati allo userId, che non cambia).
 *
 * Il nome NON resta su User: l'account resta «Account eliminato» per tutti, il
 * nome lo vede solo l'autoscuola di provenienza.
 */

import type { Prisma } from "@prisma/client";

export const FORMER_STUDENT_REASONS = ["self_delete", "office_removed", "unknown"] as const;
export type FormerStudentReason = (typeof FORMER_STUDENT_REASONS)[number];

export const FORMER_STUDENT_REASON_LABELS: Record<FormerStudentReason, string> = {
  self_delete: "Ha eliminato l'account",
  office_removed: "Rimosso dall'ufficio",
  unknown: "Uscita non registrata",
};

/** Nome che `deleteAndAnonymizeUserAccount` scrive su User: non è un nome. */
export const DELETED_USER_NAME = "Account eliminato";

export const FORMER_STUDENT_NAME_MAX_LENGTH = 80;

export function asFormerStudentReason(value: string | null | undefined): FormerStudentReason {
  return (FORMER_STUDENT_REASONS as readonly string[]).includes(value ?? "")
    ? (value as FormerStudentReason)
    : "unknown";
}

/** Un nome vero, oppure null se è il segnaposto dell'anonimizzazione o è vuoto. */
export function realStudentName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed === DELETED_USER_NAME || trimmed === "NO_NAME") return null;
  return trimmed;
}

/**
 * Archivia come ex allievo ogni iscrizione da ALLIEVO dell'utente (limitata a
 * `companyIds` se passato). Va chiamata PRIMA di cancellare le CompanyMember,
 * dentro la stessa transazione. Idempotente: se l'allievo era già ex (è
 * rientrato ed è uscito di nuovo) la riga si aggiorna, non si duplica.
 */
export async function archiveFormerStudentMemberships(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    reason: FormerStudentReason;
    actorUserId?: string | null;
    companyIds?: string[];
    leftAt?: Date;
  },
): Promise<number> {
  const memberships = await tx.companyMember.findMany({
    where: {
      userId: params.userId,
      autoscuolaRole: "STUDENT",
      ...(params.companyIds ? { companyId: { in: params.companyIds } } : {}),
    },
    select: {
      companyId: true,
      createdAt: true,
      licenseCategory: true,
      transmission: true,
      user: { select: { name: true } },
    },
  });
  const leftAt = params.leftAt ?? new Date();
  for (const m of memberships) {
    const name = realStudentName(m.user.name);
    const data = {
      reason: params.reason,
      leftAt,
      actorUserId: params.actorUserId ?? null,
      joinedAt: m.createdAt,
      licenseCategory: m.licenseCategory ?? null,
      transmission: m.transmission ?? null,
    };
    await tx.autoscuolaFormerStudent.upsert({
      where: { companyId_userId: { companyId: m.companyId, userId: params.userId } },
      create: { companyId: m.companyId, userId: params.userId, name, ...data },
      // Un nome assegnato a mano dall'ufficio non va perso se manca quello vero.
      update: { ...data, ...(name ? { name, nameAssignedBy: null } : {}) },
    });
  }
  return memberships.length;
}
