"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { requireServiceAccess } from "@/lib/service-access";

/**
 * Piano/abbonamento dell'autoscuola (vedi docs/features/company-plan.md).
 * Il team Reglo lo assegna dal backoffice; il titolare lo vede in Area
 * personale → Abbonamento. È la composizione COMMERCIALE (prezzi, periodo):
 * l'attivazione operativa di teoria/segretaria resta nei CompanyService
 * limits gestiti dal drawer "Gestisci" del backoffice.
 */

const planInputSchema = z.object({
  companyId: z.string().uuid(),
  billingPeriod: z.enum(["monthly", "annual"]),
  renewsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  instructorSeats: z.number().int().min(0).max(99),
  instructorSeatPriceCents: z.number().int().min(0).max(10_000_000),
  teoriaEnabled: z.boolean(),
  teoriaSeats: z.number().int().min(0).max(100_000),
  teoriaPriceCents: z.number().int().min(0).max(10_000_000),
  voiceEnabled: z.boolean(),
  voicePriceCents: z.number().int().min(0).max(10_000_000),
});

export type CompanyPlanDto = {
  billingPeriod: "monthly" | "annual";
  renewsAt: string | null;
  instructorSeats: number;
  instructorSeatPriceCents: number;
  teoriaEnabled: boolean;
  teoriaSeats: number;
  teoriaPriceCents: number;
  voiceEnabled: boolean;
  voicePriceCents: number;
  totalCents: number;
};

function toDto(plan: {
  billingPeriod: string;
  renewsAt: Date | null;
  instructorSeats: number;
  instructorSeatPriceCents: number;
  teoriaEnabled: boolean;
  teoriaSeats: number;
  teoriaPriceCents: number;
  voiceEnabled: boolean;
  voicePriceCents: number;
}): CompanyPlanDto {
  return {
    billingPeriod: plan.billingPeriod === "monthly" ? "monthly" : "annual",
    renewsAt: plan.renewsAt ? plan.renewsAt.toISOString() : null,
    instructorSeats: plan.instructorSeats,
    instructorSeatPriceCents: plan.instructorSeatPriceCents,
    teoriaEnabled: plan.teoriaEnabled,
    teoriaSeats: plan.teoriaSeats,
    teoriaPriceCents: plan.teoriaPriceCents,
    voiceEnabled: plan.voiceEnabled,
    voicePriceCents: plan.voicePriceCents,
    totalCents:
      plan.instructorSeats * plan.instructorSeatPriceCents +
      (plan.teoriaEnabled ? plan.teoriaPriceCents : 0) +
      (plan.voiceEnabled ? plan.voicePriceCents : 0),
  };
}

// ── Lato company (Area personale → Abbonamento, riservato al titolare) ──────

export async function getCompanyPlan() {
  try {
    const context = await requireServiceAccess("AUTOSCUOLE");
    const role = context.membership.autoscuolaRole;
    if (role !== "OWNER" && role !== "INSTRUCTOR_OWNER") {
      throw new Error("Sezione riservata al titolare dell'autoscuola.");
    }
    const plan = await prisma.companyPlan.findUnique({
      where: { companyId: context.membership.companyId },
    });
    return { success: true, data: { plan: plan ? toDto(plan) : null } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Lato backoffice ──────────────────────────────────────────────────────────

export async function getBackofficeCompanyPlan(companyId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(companyId);
    const plan = await prisma.companyPlan.findUnique({ where: { companyId: id } });
    return { success: true, data: { plan: plan ? toDto(plan) : null } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function saveBackofficeCompanyPlan(input: z.infer<typeof planInputSchema>) {
  try {
    await requireGlobalAdmin();
    const parsed = planInputSchema.parse(input);
    const { companyId, renewsAt, ...fields } = parsed;
    const data = {
      ...fields,
      // Mezzogiorno UTC: la data resta quella scelta in ogni fuso ragionevole.
      renewsAt: renewsAt ? new Date(`${renewsAt}T12:00:00.000Z`) : null,
    };
    const plan = await prisma.companyPlan.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
    return { success: true, data: { plan: toDto(plan) } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteBackofficeCompanyPlan(companyId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(companyId);
    await prisma.companyPlan.deleteMany({ where: { companyId: id } });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
