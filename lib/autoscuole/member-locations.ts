/**
 * Luoghi degli allievi (REG-705) — unico punto di lettura e scrittura di
 * `CompanyMemberLocation`.
 *
 * Tiene l'invariante con il luogo principale (REG-392): se l'allievo ha dei
 * luoghi, `CompanyMember.defaultLocationId` è uno di questi. Chi scrive i luoghi
 * di un allievo o il suo luogo di default passa da qui, mai da un `create`/
 * `update` diretto.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";

import { getCachedCompanyServiceLimits } from "./cached-service";
import {
  availabilityByLocationEnabled,
  normalizeMemberLocations,
  readLocationAvailabilitySettings,
  type LocationAvailabilitySettings,
} from "./location-availability";

type Db = Prisma.TransactionClient | typeof prisma;

/** Id dei luoghi attivi, nell'ordine dei resolver (sede prima, poi nome). */
async function orderedActiveLocationIds(db: Db, companyId: string) {
  const rows = await db.autoscuolaLocation.findMany({
    where: { companyId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Stato effettivo della disponibilità per luogo per l'autoscuola, più i
 * setting della pausa. Una query leggera sui luoghi + i limits in cache.
 */
export async function getLocationAvailabilityState(companyId: string): Promise<
  LocationAvailabilitySettings & { enabled: boolean; activeLocationCount: number }
> {
  const [limits, activeLocationCount] = await Promise.all([
    getCachedCompanyServiceLimits(companyId),
    prisma.autoscuolaLocation.count({ where: { companyId, archivedAt: null } }),
  ]);
  const settings = readLocationAvailabilitySettings(limits);
  return {
    ...settings,
    activeLocationCount,
    enabled: availabilityByLocationEnabled(
      settings.availabilityByLocation,
      activeLocationCount,
    ),
  };
}

/**
 * Luoghi attivi assegnati a ciascun allievo richiesto. Gli allievi senza
 * luoghi non compaiono nella mappa (= tutti i luoghi).
 */
export async function getMemberLocationIds(
  companyId: string,
  userIds: readonly string[],
  db: Db = prisma,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (userIds.length === 0) return out;
  const rows = await db.companyMemberLocation.findMany({
    where: {
      companyId,
      userId: { in: Array.from(new Set(userIds)) },
      location: { archivedAt: null },
    },
    orderBy: [{ location: { isDefault: "desc" } }, { location: { name: "asc" } }],
    select: { userId: true, locationId: true },
  });
  for (const row of rows) {
    const list = out.get(row.userId);
    if (list) list.push(row.locationId);
    else out.set(row.userId, [row.locationId]);
  }
  return out;
}

export class MemberLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberLocationError";
  }
}

/**
 * Sostituisce i luoghi di un allievo. Lista vuota = tutti i luoghi.
 * Riallinea il luogo principale se non è più tra quelli scelti.
 */
export async function setStudentLocations(params: {
  companyId: string;
  userId: string;
  locationIds: readonly string[];
}): Promise<{ locationIds: string[]; defaultLocationId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const member = await tx.companyMember.findFirst({
      where: {
        companyId: params.companyId,
        userId: params.userId,
        autoscuolaRole: "STUDENT",
      },
      select: { defaultLocationId: true },
    });
    if (!member) throw new MemberLocationError("Allievo non trovato.");

    const active = await orderedActiveLocationIds(tx, params.companyId);
    const unknown = params.locationIds.filter((id) => !active.includes(id));
    if (unknown.length > 0) throw new MemberLocationError("Luogo non trovato.");

    const next = normalizeMemberLocations({
      locationIds: params.locationIds,
      preferredDefaultId: member.defaultLocationId,
      orderedActiveIds: active,
    });

    await tx.companyMemberLocation.deleteMany({
      where: {
        companyId: params.companyId,
        userId: params.userId,
        locationId: { notIn: next.locationIds },
      },
    });
    if (next.locationIds.length > 0) {
      await tx.companyMemberLocation.createMany({
        data: next.locationIds.map((locationId) => ({
          companyId: params.companyId,
          userId: params.userId,
          locationId,
        })),
        skipDuplicates: true,
      });
    }
    if (next.defaultLocationId !== member.defaultLocationId) {
      await tx.companyMember.update({
        where: {
          companyId_userId: { companyId: params.companyId, userId: params.userId },
        },
        data: { defaultLocationId: next.defaultLocationId },
      });
    }
    return next;
  });
}

/**
 * Imposta il luogo principale (REG-392). Se l'allievo ha dei luoghi e quello
 * nuovo non è tra questi, lo aggiunge: scegliere il principale non deve mai
 * togliere all'allievo il luogo dove va davvero. Allievo senza luoghi = resta
 * senza (vede tutto; il principale serve solo a precompilare).
 */
export async function setStudentDefaultLocationKeepingInvariant(params: {
  companyId: string;
  userId: string;
  locationId: string | null;
}): Promise<{ locationIds: string[]; defaultLocationId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const current = await getMemberLocationIds(params.companyId, [params.userId], tx);
    let assigned = current.get(params.userId) ?? [];

    if (params.locationId && assigned.length > 0 && !assigned.includes(params.locationId)) {
      await tx.companyMemberLocation.create({
        data: {
          companyId: params.companyId,
          userId: params.userId,
          locationId: params.locationId,
        },
      });
      // Riletti per restare nell'ordine dei luoghi (sede prima, poi nome).
      const refreshed = await getMemberLocationIds(params.companyId, [params.userId], tx);
      assigned = refreshed.get(params.userId) ?? [];
    }

    let defaultLocationId = params.locationId;
    // Azzerare il principale con dei luoghi assegnati romperebbe l'invariante:
    // il primo dei suoi luoghi diventa il principale.
    if (!defaultLocationId && assigned.length > 0) {
      const active = await orderedActiveLocationIds(tx, params.companyId);
      defaultLocationId = active.find((id) => assigned.includes(id)) ?? null;
    }

    await tx.companyMember.updateMany({
      where: {
        companyId: params.companyId,
        userId: params.userId,
        autoscuolaRole: "STUDENT",
      },
      data: { defaultLocationId },
    });
    return { locationIds: assigned, defaultLocationId };
  });
}

/**
 * Pulizia all'archiviazione di un luogo: via dai luoghi degli allievi, e chi
 * lo aveva come principale passa al primo dei suoi luoghi rimasti (o a nessuno).
 * Va chiamata nella stessa transazione che archivia il luogo.
 */
export async function detachArchivedLocationFromMembers(
  tx: Prisma.TransactionClient,
  params: { companyId: string; locationId: string },
) {
  await tx.companyMemberLocation.deleteMany({
    where: { companyId: params.companyId, locationId: params.locationId },
  });
  const orphans = await tx.companyMember.findMany({
    where: { companyId: params.companyId, defaultLocationId: params.locationId },
    select: { userId: true },
  });
  if (orphans.length === 0) return;

  const remaining = await getMemberLocationIds(
    params.companyId,
    orphans.map((o) => o.userId),
    tx,
  );
  const byNewDefault = new Map<string | null, string[]>();
  for (const { userId } of orphans) {
    const next = remaining.get(userId)?.[0] ?? null;
    const list = byNewDefault.get(next);
    if (list) list.push(userId);
    else byNewDefault.set(next, [userId]);
  }
  for (const [defaultLocationId, userIds] of byNewDefault) {
    await tx.companyMember.updateMany({
      where: { companyId: params.companyId, userId: { in: userIds } },
      data: { defaultLocationId },
    });
  }
}
