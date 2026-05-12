"use server";

import { z } from "zod";

import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  createLocation,
  listLocationsForCompany,
  softDeleteLocation,
  updateLocation,
  upsertDefaultLocation,
  LocationAuthzError,
} from "@/lib/autoscuole/locations";

const locationCoreSchema = z.object({
  name: z.string().min(2).max(80),
  isPrecise: z.boolean(),
  address: z.string().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  placeId: z.string().max(255).nullable().optional(),
});

const createSchema = locationCoreSchema;
const updateSchema = locationCoreSchema.partial().extend({
  id: z.string().uuid(),
});
const deleteSchema = z.object({ id: z.string().uuid() });

const updateDefaultSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  isPrecise: z.boolean(),
  address: z.string().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  placeId: z.string().max(255).nullable().optional(),
});

async function invalidate(companyId: string) {
  await invalidateAutoscuoleCache({
    companyId,
    segments: [
      AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS,
      AUTOSCUOLE_CACHE_SEGMENTS.AGENDA,
    ],
  });
}

export async function getAutoscuolaLocations() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const locations = await listLocationsForCompany(membership.companyId);
    return { success: true, data: locations };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createAutoscuolaLocation(input: z.infer<typeof createSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const parsed = createSchema.parse(input);
    const location = await createLocation({
      companyId: membership.companyId,
      createdByUserId: membership.userId,
      name: parsed.name,
      isPrecise: parsed.isPrecise,
      address: parsed.address ?? null,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      placeId: parsed.placeId ?? null,
    });
    await invalidate(membership.companyId);
    return { success: true, data: location };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaLocation(input: z.infer<typeof updateSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const parsed = updateSchema.parse(input);
    const location = await updateLocation({
      id: parsed.id,
      actor: {
        userId: membership.userId,
        autoscuolaRole: membership.autoscuolaRole,
      },
      name: parsed.name,
      isPrecise: parsed.isPrecise,
      address: parsed.address,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      placeId: parsed.placeId,
    });
    await invalidate(membership.companyId);
    return { success: true, data: location };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteAutoscuolaLocation(input: z.infer<typeof deleteSchema>) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const parsed = deleteSchema.parse(input);
    await softDeleteLocation(parsed.id, {
      userId: membership.userId,
      autoscuolaRole: membership.autoscuolaRole,
    });
    await invalidate(membership.companyId);
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateDefaultAutoscuolaLocation(
  input: z.infer<typeof updateDefaultSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!isOwner(membership.autoscuolaRole)) {
      throw new LocationAuthzError(
        "Solo il titolare può modificare la sede dell'autoscuola.",
      );
    }
    const parsed = updateDefaultSchema.parse(input);
    const location = await upsertDefaultLocation({
      companyId: membership.companyId,
      name: parsed.name,
      isPrecise: parsed.isPrecise,
      address: parsed.address ?? null,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      placeId: parsed.placeId ?? null,
    });
    await invalidate(membership.companyId);
    return { success: true, data: location };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
