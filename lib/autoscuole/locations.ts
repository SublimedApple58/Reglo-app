import type { AutoscuolaLocation, Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";

import { isOwner } from "./roles";

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

export type CreateLocationInput = {
  companyId: string;
  createdByUserId: string;
  name: string;
  isPrecise: boolean;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
};

export async function createLocation(input: CreateLocationInput) {
  if (input.isPrecise) {
    if (!input.address || input.latitude == null || input.longitude == null) {
      throw new Error(
        "Una posizione precisa richiede indirizzo, latitudine e longitudine.",
      );
    }
  }

  return prisma.autoscuolaLocation.create({
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

  return prisma.autoscuolaLocation.update({
    where: { id: input.id },
    data,
  });
}

export type UpdateDefaultLocationInput = {
  companyId: string;
  name?: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
};

export async function upsertDefaultLocation(input: UpdateDefaultLocationInput) {
  const existing = await prisma.autoscuolaLocation.findFirst({
    where: { companyId: input.companyId, isDefault: true },
  });

  const trimmedName = input.name?.trim() || DEFAULT_LOCATION_LABEL;

  if (existing) {
    return prisma.autoscuolaLocation.update({
      where: { id: existing.id },
      data: {
        name: trimmedName,
        address: input.address,
        latitude: toPrismaDecimal(input.latitude),
        longitude: toPrismaDecimal(input.longitude),
        placeId: input.placeId ?? null,
        isPrecise: true,
        archivedAt: null,
      },
    });
  }

  return prisma.autoscuolaLocation.create({
    data: {
      companyId: input.companyId,
      name: trimmedName,
      address: input.address,
      latitude: toPrismaDecimal(input.latitude),
      longitude: toPrismaDecimal(input.longitude),
      placeId: input.placeId ?? null,
      isPrecise: true,
      isDefault: true,
    },
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

  return prisma.autoscuolaLocation.update({
    where: { id },
    data: { archivedAt: new Date() },
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
