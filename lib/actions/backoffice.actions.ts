"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { normalizeCompanyServices, type ServiceKey } from "@/lib/services";
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from "@/lib/constants";
import { setBackofficeCookie } from "@/lib/backoffice-auth";

const updateCompanyServiceSchema = z.object({
  companyId: z.string().min(1),
  serviceKey: z.enum(["AUTOSCUOLE"]),
  status: z.enum(["active", "disabled"]),
  limits: z
    .record(
      z.string(),
      z.union([
        z.number(),
        z.string(),
        z.boolean(),
        z.null(),
        z.array(z.string()),
        z.array(z.number()),
        z.record(z.string(), z.any()),
      ]),
    )
    .optional(),
});

const assignAutoscuolaVoiceLineSchema = z.object({
  companyId: z.string().uuid(),
  displayNumber: z.string().trim().min(5),
  twilioNumber: z.string().trim().min(5),
  // For SIP mode (e.g. Messagenet) there is no Twilio SID — auto-generated as "sip:{number}"
  twilioPhoneSid: z.string().trim().min(1).optional(),
  routingMode: z.enum(["twilio", "sip"]).default("twilio"),
});

const unassignAutoscuolaVoiceLineSchema = z.object({
  companyId: z.string().uuid(),
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
  androidStudents: number;
  iosStudents: number;
};

export async function getBackofficeCompanies() {
  try {
    await requireGlobalAdmin();

    const [companies, platformCounts] = await Promise.all([
      prisma.company.findMany({
        include: { services: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.companyInvite.groupBy({
        by: ["companyId", "platform"],
        where: { role: "member" },
        _count: { id: true },
      }),
    ]);

    const platformMap = new Map<string, { android: number; ios: number }>();
    for (const row of platformCounts) {
      const entry = platformMap.get(row.companyId) ?? { android: 0, ios: 0 };
      if (row.platform === "android") entry.android = row._count.id;
      if (row.platform === "ios") entry.ios = row._count.id;
      platformMap.set(row.companyId, entry);
    }

    return {
      success: true,
      data: companies.map((company) => {
        const counts = platformMap.get(company.id) ?? { android: 0, ios: 0 };
        return {
          id: company.id,
          name: company.name,
          createdAt: company.createdAt.toISOString(),
          services: normalizeCompanyServices(company.services),
          androidStudents: counts.android,
          iosStudents: counts.ios,
        };
      }) satisfies BackofficeCompany[],
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
          limits:
            ((payload.limits ?? (existing.limits as Record<string, unknown> | null) ?? undefined) ??
            undefined) as Prisma.InputJsonValue | undefined,
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

export async function assignAutoscuolaVoiceLine(
  input: z.infer<typeof assignAutoscuolaVoiceLineSchema>,
) {
  try {
    await requireGlobalAdmin();
    const payload = assignAutoscuolaVoiceLineSchema.parse(input);
    // For SIP mode (Messagenet/third-party) there is no Twilio SID.
    // Use a synthetic "sip:{number}" identifier so the unique constraint is satisfied.
    const effectiveSid = payload.twilioPhoneSid || `sip:${payload.twilioNumber}`;

    const line = await prisma.autoscuolaVoiceLine.upsert({
      where: { twilioPhoneSid: effectiveSid },
      update: {
        companyId: payload.companyId,
        displayNumber: payload.displayNumber,
        twilioNumber: payload.twilioNumber,
        status: "ready",
        routingMode: payload.routingMode,
      },
      create: {
        companyId: payload.companyId,
        displayNumber: payload.displayNumber,
        twilioNumber: payload.twilioNumber,
        twilioPhoneSid: effectiveSid,
        status: "ready",
        routingMode: payload.routingMode,
      },
    });

    const existingService = await prisma.companyService.findFirst({
      where: { companyId: payload.companyId, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true },
    });
    const currentLimits = (existingService?.limits ?? {}) as Record<string, unknown>;
    const nextLimits = {
      ...currentLimits,
      voiceFeatureEnabled: true,
      voiceProvisioningStatus: "ready",
      voiceLineRef: line.id,
    };

    if (existingService) {
      await prisma.companyService.update({
        where: { id: existingService.id },
        data: { limits: nextLimits, status: "ACTIVE" },
      });
    } else {
      await prisma.companyService.create({
        data: {
          companyId: payload.companyId,
          serviceKey: "AUTOSCUOLE",
          status: "ACTIVE",
          limits: nextLimits,
        },
      });
    }

    return { success: true, data: { lineId: line.id } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function unassignAutoscuolaVoiceLine(
  input: z.infer<typeof unassignAutoscuolaVoiceLineSchema>,
) {
  try {
    await requireGlobalAdmin();
    const payload = unassignAutoscuolaVoiceLineSchema.parse(input);

    const existingService = await prisma.companyService.findFirst({
      where: { companyId: payload.companyId, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true },
    });
    if (!existingService) {
      return { success: true };
    }

    const currentLimits = (existingService.limits ?? {}) as Record<string, unknown>;
    const lineId =
      typeof currentLimits.voiceLineRef === "string" ? currentLimits.voiceLineRef : null;

    if (lineId) {
      await prisma.autoscuolaVoiceLine.updateMany({
        where: { id: lineId, companyId: payload.companyId },
        data: { status: "inactive" },
      });
    }

    const nextLimits = {
      ...currentLimits,
      voiceFeatureEnabled: false,
      voiceProvisioningStatus: "not_started",
      voiceLineRef: null,
      voiceAssistantEnabled: false,
      voiceBookingEnabled: false,
    };

    await prisma.companyService.update({
      where: { id: existingService.id },
      data: { limits: nextLimits },
    });

    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCompanyStudentPlatforms(companyId: string) {
  try {
    await requireGlobalAdmin();
    const invites = await prisma.companyInvite.findMany({
      where: { companyId, role: "member" },
      select: {
        id: true,
        email: true,
        platform: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true as const, data: invites };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
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

export async function deleteCompany(companyId: string) {
  try {
    await requireGlobalAdmin();

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return { success: false as const, message: "Company non trovata." };
    }

    await prisma.company.delete({ where: { id: companyId } });

    return { success: true as const, data: { name: company.name } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
