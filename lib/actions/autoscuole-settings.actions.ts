"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";

const DEFAULT_AVAILABILITY_WEEKS = 4;
const availabilitySchema = z.object({
  availabilityWeeks: z.number().int().min(1).max(12),
});

const canManageSettings = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || autoscuolaRole === "OWNER";

export async function getAutoscuolaSettings() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
    });

    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const availabilityWeeks =
      typeof limits.availabilityWeeks === "number"
        ? limits.availabilityWeeks
        : DEFAULT_AVAILABILITY_WEEKS;

    return { success: true, data: { availabilityWeeks } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaSettings(
  input: z.infer<typeof availabilitySchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageSettings(membership.role, membership.autoscuolaRole)) {
      throw new Error("Operazione non consentita.");
    }

    const payload = availabilitySchema.parse(input);

    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
    });

    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const nextLimits = {
      ...limits,
      availabilityWeeks: payload.availabilityWeeks,
    };

    if (service) {
      await prisma.companyService.update({
        where: { id: service.id },
        data: { limits: nextLimits },
      });
    } else {
      await prisma.companyService.create({
        data: {
          companyId: membership.companyId,
          serviceKey: "AUTOSCUOLE",
          status: "ACTIVE",
          limits: nextLimits,
        },
      });
    }

    return { success: true, data: { availabilityWeeks: payload.availabilityWeeks } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
