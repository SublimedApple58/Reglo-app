"use server";

import { requireGlobalAdmin } from "@/lib/auth-guard";
import { computeKpis } from "@/lib/backoffice/kpi-compute";

/**
 * KPI del backoffice. Il calcolo vive in `lib/backoffice/kpi-compute.ts`
 * (condiviso con la pagina investor a token): qui c'è solo la guardia.
 */
export async function getBackofficeKpis(input: { from: string; to: string }) {
  try {
    await requireGlobalAdmin();
    return await computeKpis(input);
  } catch (error) {
    return { success: false as const, message: (error as Error).message };
  }
}
