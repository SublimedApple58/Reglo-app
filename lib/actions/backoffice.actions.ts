"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { normalizeCompanyServices, type ServiceKey } from "@/lib/services";
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from "@/lib/constants";
import { setBackofficeCookie } from "@/lib/backoffice-auth";

const updateCompanyServiceSchema = z.object({
  companyId: z.string().min(1),
  serviceKey: z.enum(["DOC_MANAGER", "WORKFLOWS", "AI_ASSISTANT", "AUTOSCUOLE"]),
  status: z.enum(["active", "disabled"]),
  limits: z.record(z.string(), z.number().nullable()).optional(),
});

const backofficeSignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type BackofficeCompany = {
  id: string;
  name: string;
  createdAt: string;
  services: ReturnType<typeof normalizeCompanyServices>;
};

export async function getBackofficeCompanies() {
  try {
    await requireGlobalAdmin();

    const companies = await prisma.company.findMany({
      include: { services: true },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: companies.map((company) => ({
        id: company.id,
        name: company.name,
        createdAt: company.createdAt.toISOString(),
        services: normalizeCompanyServices(company.services),
      })) satisfies BackofficeCompany[],
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateCompanyService(input: z.infer<typeof updateCompanyServiceSchema>) {
  try {
    await requireGlobalAdmin();
    const payload = updateCompanyServiceSchema.parse(input);

    const status = payload.status === "active" ? "ACTIVE" : "DISABLED";

    const existing = await prisma.companyService.findFirst({
      where: { companyId: payload.companyId, serviceKey: payload.serviceKey as ServiceKey },
    });

    if (existing) {
      await prisma.companyService.update({
        where: { id: existing.id },
        data: {
          status,
          limits: (payload.limits ?? existing.limits ?? undefined) as
            | Record<string, number | null>
            | undefined,
        },
      });
    } else {
      await prisma.companyService.create({
        data: {
          companyId: payload.companyId,
          serviceKey: payload.serviceKey as ServiceKey,
          status,
          limits: payload.limits ?? {},
        },
      });
    }

    if (payload.serviceKey === "AUTOSCUOLE" && status === "ACTIVE") {
      await prisma.companyMember.updateMany({
        where: { companyId: payload.companyId, role: "admin" },
        data: { autoscuolaRole: "OWNER" },
      });
      await prisma.companyMember.updateMany({
        where: { companyId: payload.companyId, role: { not: "admin" } },
        data: { autoscuolaRole: "STUDENT" },
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function backofficeSignIn(input: z.infer<typeof backofficeSignInSchema>) {
  try {
    const payload = backofficeSignInSchema.parse(input);
    const isValid =
      payload.email === GLOBAL_ADMIN_EMAIL &&
      payload.password === GLOBAL_ADMIN_PASSWORD;

    if (!isValid) {
      return { success: false, message: "Credenziali non valide." };
    }

    await setBackofficeCookie();
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
