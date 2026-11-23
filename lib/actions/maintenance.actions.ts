"use server";

import { z } from "zod";

import { activateMaintenanceAsOwner } from "@/lib/autoscuole/maintenance";
import { MAINTENANCE_SCOPES, type MaintenanceScope } from "@/lib/maintenance";
import { formatError } from "@/lib/utils";

const activateSchema = z.object({
  scope: z.enum(MAINTENANCE_SCOPES as [MaintenanceScope, ...MaintenanceScope[]]),
  confirmName: z.string().min(1).max(200),
});

/** REG-773 — il titolare accende la manutenzione dalle Impostazioni (web). */
export async function activateCompanyMaintenance(input: z.infer<typeof activateSchema>) {
  try {
    const payload = activateSchema.parse(input);
    const result = await activateMaintenanceAsOwner(payload);
    return { success: true as const, data: result.state };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
