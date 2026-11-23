import { NextResponse } from "next/server";
import { z } from "zod";

import { activateMaintenanceAsOwner } from "@/lib/autoscuole/maintenance";
import { MAINTENANCE_SCOPES, type MaintenanceScope } from "@/lib/maintenance";
import { formatError } from "@/lib/utils";

const activateSchema = z.object({
  scope: z.enum(MAINTENANCE_SCOPES as [MaintenanceScope, ...MaintenanceScope[]]),
  confirmName: z.string().min(1).max(200),
});

/**
 * REG-773 — il titolare accende la manutenzione dall'app mobile.
 * Lo spegnimento non esiste qui: solo il backoffice.
 */
export async function POST(request: Request) {
  try {
    const payload = activateSchema.parse(await request.json());
    const result = await activateMaintenanceAsOwner(payload);
    return NextResponse.json({ success: true, data: result.state });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
