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
 *
 * Gli acquisti di licenze formazione sono UNA TANTUM e vivono in un registro
 * separato (CompanyLicensePurchase): ogni acquisto è una riga con data,
 * licenze e prezzo per licenza — fuori dal totale ricorrente del piano.
 */

const planInputSchema = z.object({
  companyId: z.string().uuid(),
  billingPeriod: z.enum(["monthly", "annual"]),
  renewsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  instructorSeats: z.number().int().min(0).max(99),
  instructorSeatPriceCents: z.number().int().min(0).max(10_000_000),
  voiceEnabled: z.boolean(),
  voicePriceCents: z.number().int().min(0).max(10_000_000),
});

const licensePurchaseInputSchema = z.object({
  companyId: z.string().uuid(),
  seats: z.number().int().min(1).max(100_000),
  seatPriceCents: z.number().int().min(0).max(10_000_000),
  purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CompanyPlanDto = {
  billingPeriod: "monthly" | "annual";
  renewsAt: string | null;
  instructorSeats: number;
  instructorSeatPriceCents: number;
  voiceEnabled: boolean;
  voicePriceCents: number;
  /** Totale RICORRENTE (€/mese o €/anno): posti istruttore + Segretaria. */
  totalCents: number;
};

export type LicensePurchaseDto = {
  id: string;
  seats: number;
  seatPriceCents: number;
  totalCents: number;
  purchasedAt: string;
};

function toPlanDto(plan: {
  billingPeriod: string;
  renewsAt: Date | null;
  instructorSeats: number;
  instructorSeatPriceCents: number;
  voiceEnabled: boolean;
  voicePriceCents: number;
}): CompanyPlanDto {
  return {
    billingPeriod: plan.billingPeriod === "monthly" ? "monthly" : "annual",
    renewsAt: plan.renewsAt ? plan.renewsAt.toISOString() : null,
    instructorSeats: plan.instructorSeats,
    instructorSeatPriceCents: plan.instructorSeatPriceCents,
    voiceEnabled: plan.voiceEnabled,
    voicePriceCents: plan.voicePriceCents,
    totalCents:
      plan.instructorSeats * plan.instructorSeatPriceCents +
      (plan.voiceEnabled ? plan.voicePriceCents : 0),
  };
}

function toPurchaseDto(purchase: {
  id: string;
  seats: number;
  seatPriceCents: number;
  purchasedAt: Date;
}): LicensePurchaseDto {
  return {
    id: purchase.id,
    seats: purchase.seats,
    seatPriceCents: purchase.seatPriceCents,
    totalCents: purchase.seats * purchase.seatPriceCents,
    purchasedAt: purchase.purchasedAt.toISOString(),
  };
}

// Mezzogiorno UTC: la data resta quella scelta in ogni fuso ragionevole.
function dateAtNoonUtc(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

// ── Lato company (Area personale → Abbonamento, riservato al titolare) ──────

export async function getCompanyPlan() {
  try {
    const context = await requireServiceAccess("AUTOSCUOLE");
    const role = context.membership.autoscuolaRole;
    if (role !== "OWNER" && role !== "INSTRUCTOR_OWNER") {
      throw new Error("Sezione riservata al titolare dell'autoscuola.");
    }
    const [plan, purchases] = await Promise.all([
      prisma.companyPlan.findUnique({
        where: { companyId: context.membership.companyId },
      }),
      prisma.companyLicensePurchase.findMany({
        where: { companyId: context.membership.companyId },
        orderBy: { purchasedAt: "desc" },
      }),
    ]);
    return {
      success: true,
      data: {
        plan: plan ? toPlanDto(plan) : null,
        licensePurchases: purchases.map(toPurchaseDto),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Lato backoffice ──────────────────────────────────────────────────────────

export async function getBackofficeCompanyPlan(companyId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(companyId);
    const [plan, purchases] = await Promise.all([
      prisma.companyPlan.findUnique({ where: { companyId: id } }),
      prisma.companyLicensePurchase.findMany({
        where: { companyId: id },
        orderBy: { purchasedAt: "desc" },
      }),
    ]);
    return {
      success: true,
      data: {
        plan: plan ? toPlanDto(plan) : null,
        licensePurchases: purchases.map(toPurchaseDto),
      },
    };
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
      renewsAt: renewsAt ? dateAtNoonUtc(renewsAt) : null,
    };
    const plan = await prisma.companyPlan.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
    return { success: true, data: { plan: toPlanDto(plan) } };
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

/** Registra un acquisto una tantum di licenze formazione. */
export async function addBackofficeLicensePurchase(
  input: z.infer<typeof licensePurchaseInputSchema>,
) {
  try {
    await requireGlobalAdmin();
    const parsed = licensePurchaseInputSchema.parse(input);
    const purchase = await prisma.companyLicensePurchase.create({
      data: {
        companyId: parsed.companyId,
        seats: parsed.seats,
        seatPriceCents: parsed.seatPriceCents,
        purchasedAt: dateAtNoonUtc(parsed.purchasedAt),
      },
    });
    return { success: true, data: { purchase: toPurchaseDto(purchase) } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteBackofficeLicensePurchase(purchaseId: string) {
  try {
    await requireGlobalAdmin();
    const id = z.string().uuid().parse(purchaseId);
    await prisma.companyLicensePurchase.deleteMany({ where: { id } });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
