import type { AutoscuolaLocation, Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";

import { isOwner } from "./roles";
import { resolvePrefilledLocationId } from "./location-for-license";

export const DEFAULT_LOCATION_LABEL = "Sede dell'autoscuola";

export type LocationActor = {
  userId: string;
  autoscuolaRole: string;
};

export class LocationAuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationAuthzError";
  }
}

export function assertCanManageLocation(
  actor: LocationActor,
  location: Pick<AutoscuolaLocation, "isDefault" | "createdByUserId">,
) {
  if (isOwner(actor.autoscuolaRole)) return;
  if (location.isDefault) {
    throw new LocationAuthzError(
      "Solo il titolare può modificare la sede dell'autoscuola.",
    );
  }
  if (location.createdByUserId !== actor.userId) {
    throw new LocationAuthzError(
      "Puoi modificare solo i luoghi che hai creato tu.",
    );
  }
}

/**
 * Assegna a un luogo i tipi di patente (REG-409) TOGLIENDOLI agli altri luoghi
 * della stessa company: una categoria appartiene a un solo luogo, altrimenti il
 * precompile del campo "Luogo" in creazione guida sarebbe ambiguo.
 * Le categorie sono normalizzate (trim + maiuscolo) e deduplicate.
 */
export async function setLocationLicenseCategories(
  tx: Prisma.TransactionClient,
  params: { companyId: string; locationId: string; categories: string[] },
) {
  const categories = Array.from(
    new Set(
      params.categories
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length > 0),
    ),
  );

  if (categories.length) {
    // Le categorie rubate agli altri luoghi: Postgres non ha un "array remove
    // many", quindi si rilegge e riscrive solo chi è davvero toccato.
    const siblings = await tx.autoscuolaLocation.findMany({
      where: {
        companyId: params.companyId,
        id: { not: params.locationId },
        licenseCategories: { hasSome: categories },
      },
      select: { id: true, licenseCategories: true },
    });
    for (const sibling of siblings) {
      await tx.autoscuolaLocation.update({
        where: { id: sibling.id },
        data: {
          licenseCategories: sibling.licenseCategories.filter(
            (c) => !categories.includes(c),
          ),
        },
      });
    }
  }

  return tx.autoscuolaLocation.update({
    where: { id: params.locationId },
    data: { licenseCategories: categories },
  });
}

export async function listLocationsForCompany(companyId: string) {
  return prisma.autoscuolaLocation.findMany({
    where: { companyId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function getDefaultLocation(companyId: string) {
  return prisma.autoscuolaLocation.findFirst({
    where: { companyId, isDefault: true, archivedAt: null },
  });
}

export async function getDefaultLocationId(companyId: string): Promise<string | null> {
  const loc = await prisma.autoscuolaLocation.findFirst({
    where: { companyId, isDefault: true, archivedAt: null },
    select: { id: true },
  });
  return loc?.id ?? null;
}

/**
 * Luogo di una prenotazione fatta DALL'ALLIEVO dall'app (REG-409 follow-up).
 *
 * Applica la stessa precedenza del campo "Luogo" in creazione guida dal web
 * (`resolvePrefilledLocationId`): default dell'allievo → luogo della patente
 * della guida → sede. Prima di questo helper le prenotazioni self-service
 * finivano SEMPRE in sede, ignorando sia REG-392 sia REG-409.
 *
 * `vehicleLicenseCategory` è la categoria del veicolo assegnato dal matcher
 * (è il veicolo a definire che guida è); `null` quando la guida non ha veicolo
 * o il modulo Veicoli è spento → si ricade sul percorso dell'allievo.
 */
export async function resolveStudentBookingLocationId(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    studentId: string;
    vehicleLicenseCategory?: string | null;
  },
): Promise<string | null> {
  const [locations, member] = await Promise.all([
    tx.autoscuolaLocation.findMany({
      where: { companyId: params.companyId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, isDefault: true, licenseCategories: true },
    }),
    tx.companyMember.findFirst({
      where: { companyId: params.companyId, userId: params.studentId },
      select: { defaultLocationId: true, licenseCategory: true },
    }),
  ]);

  return resolvePrefilledLocationId({
    locations,
    studentDefaultLocationId: member?.defaultLocationId ?? null,
    student: { licenseCategory: member?.licenseCategory ?? null },
    vehicle: { licenseCategory: params.vehicleLicenseCategory ?? null },
  });
}

export type CreateLocationInput = {
  companyId: string;
  createdByUserId: string;
  name: string;
  isPrecise: boolean;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  licenseCategories?: string[];
};

export async function createLocation(input: CreateLocationInput) {
  if (input.isPrecise) {
    if (!input.address || input.latitude == null || input.longitude == null) {
      throw new Error(
        "Una posizione precisa richiede indirizzo, latitudine e longitudine.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.autoscuolaLocation.create({
      data: {
        companyId: input.companyId,
        createdByUserId: input.createdByUserId,
        name: input.name.trim(),
        isPrecise: input.isPrecise,
        isDefault: false,
        address: input.isPrecise ? input.address ?? null : null,
        latitude: input.isPrecise ? toPrismaDecimal(input.latitude) : null,
        longitude: input.isPrecise ? toPrismaDecimal(input.longitude) : null,
        placeId: input.isPrecise ? input.placeId ?? null : null,
      },
    });
    if (!input.licenseCategories?.length) return created;
    return setLocationLicenseCategories(tx, {
      companyId: input.companyId,
      locationId: created.id,
      categories: input.licenseCategories,
    });
  });
}

export type UpdateLocationInput = {
  id: string;
  actor: LocationActor;
  name?: string;
  isPrecise?: boolean;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  licenseCategories?: string[];
};

export async function updateLocation(input: UpdateLocationInput) {
  const existing = await prisma.autoscuolaLocation.findUnique({
    where: { id: input.id },
  });
  if (!existing || existing.archivedAt) {
    throw new Error("Luogo non trovato.");
  }

  assertCanManageLocation(input.actor, existing);

  const willBePrecise = input.isPrecise ?? existing.isPrecise;
  const nextAddress = input.address !== undefined ? input.address : existing.address;
  const nextLat = input.latitude !== undefined ? input.latitude : existing.latitude;
  const nextLng = input.longitude !== undefined ? input.longitude : existing.longitude;

  if (willBePrecise) {
    if (!nextAddress || nextLat == null || nextLng == null) {
      throw new Error(
        "Una posizione precisa richiede indirizzo, latitudine e longitudine.",
      );
    }
  }

  const data: Prisma.AutoscuolaLocationUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.isPrecise !== undefined) data.isPrecise = input.isPrecise;
  if (input.address !== undefined) {
    data.address = willBePrecise ? input.address : null;
  }
  if (input.latitude !== undefined) {
    data.latitude = willBePrecise ? toPrismaDecimal(input.latitude) : null;
  }
  if (input.longitude !== undefined) {
    data.longitude = willBePrecise ? toPrismaDecimal(input.longitude) : null;
  }
  if (input.placeId !== undefined) {
    data.placeId = willBePrecise ? input.placeId : null;
  }
  // Coerce non-precise state if the toggle moved to false
  if (input.isPrecise === false) {
    data.address = null;
    data.latitude = null;
    data.longitude = null;
    data.placeId = null;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.autoscuolaLocation.update({
      where: { id: input.id },
      data,
    });
    if (input.licenseCategories === undefined) return updated;
    return setLocationLicenseCategories(tx, {
      companyId: existing.companyId,
      locationId: input.id,
      categories: input.licenseCategories,
    });
  });
}

export type UpdateDefaultLocationInput = {
  companyId: string;
  name?: string;
  isPrecise: boolean;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  licenseCategories?: string[];
};

export async function upsertDefaultLocation(input: UpdateDefaultLocationInput) {
  const existing = await prisma.autoscuolaLocation.findFirst({
    where: { companyId: input.companyId, isDefault: true },
  });

  const trimmedName = input.name?.trim() || DEFAULT_LOCATION_LABEL;

  if (input.isPrecise) {
    if (!input.address || input.latitude == null || input.longitude == null) {
      throw new Error(
        "Una sede precisa richiede indirizzo, latitudine e longitudine.",
      );
    }
  }

  const data = {
    name: trimmedName,
    isPrecise: input.isPrecise,
    address: input.isPrecise ? input.address ?? null : null,
    latitude: input.isPrecise ? toPrismaDecimal(input.latitude) : null,
    longitude: input.isPrecise ? toPrismaDecimal(input.longitude) : null,
    placeId: input.isPrecise ? input.placeId ?? null : null,
    archivedAt: null,
  };

  return prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.autoscuolaLocation.update({ where: { id: existing.id }, data })
      : await tx.autoscuolaLocation.create({
          data: { companyId: input.companyId, isDefault: true, ...data },
        });
    if (input.licenseCategories === undefined) return saved;
    return setLocationLicenseCategories(tx, {
      companyId: input.companyId,
      locationId: saved.id,
      categories: input.licenseCategories,
    });
  });
}

export async function softDeleteLocation(id: string, actor: LocationActor) {
  const existing = await prisma.autoscuolaLocation.findUnique({ where: { id } });
  if (!existing || existing.archivedAt) {
    throw new Error("Luogo non trovato.");
  }
  if (existing.isDefault) {
    throw new LocationAuthzError(
      "La sede dell'autoscuola non può essere eliminata.",
    );
  }
  assertCanManageLocation(actor, existing);

  // Le patenti assegnate si liberano con l'archiviazione: altrimenti un luogo
  // eliminato terrebbe in ostaggio la categoria e il precompile ricadrebbe in
  // silenzio sulla sede senza poterla riassegnare altrove (REG-409).
  return prisma.autoscuolaLocation.update({
    where: { id },
    data: { archivedAt: new Date(), licenseCategories: [] },
  });
}

export function resolveAppointmentLocationLabel(
  location: Pick<AutoscuolaLocation, "name"> | null | undefined,
): string {
  return location?.name ?? DEFAULT_LOCATION_LABEL;
}

function toPrismaDecimal(value: number | null | undefined) {
  if (value == null) return null;
  return value as unknown as Prisma.Decimal;
}
