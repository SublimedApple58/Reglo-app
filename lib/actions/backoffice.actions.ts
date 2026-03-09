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
  twilioPhoneSid: z.string().trim().min(6),
  routingMode: z.enum(["twilio", "sip"]).default("twilio"),
});

const unassignAutoscuolaVoiceLineSchema = z.object({
  companyId: z.string().uuid(),
});

const provisionAutoscuolaVoiceLineSchema = z.object({
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
          limits:
            (payload.limits ?? (existing.limits as Record<string, unknown> | null) ?? undefined) ??
            undefined,
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

    const line = await prisma.autoscuolaVoiceLine.upsert({
      where: { twilioPhoneSid: payload.twilioPhoneSid },
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
        twilioPhoneSid: payload.twilioPhoneSid,
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

export async function provisionAutoscuolaVoiceLine(
  input: z.infer<typeof provisionAutoscuolaVoiceLineSchema>,
) {
  try {
    await requireGlobalAdmin();
    const payload = provisionAutoscuolaVoiceLineSchema.parse(input);

    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const appUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim().replace(/\/$/, "");

    if (!sid || !token) {
      throw new Error("TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN non configurati.");
    }
    if (!appUrl) {
      throw new Error("NEXT_PUBLIC_SERVER_URL non configurato — impossibile impostare i webhook Twilio.");
    }

    const authHeader = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;

    // Mark as "provisioning" immediately so the UI shows progress
    const existingService = await prisma.companyService.findFirst({
      where: { companyId: payload.companyId, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true },
    });
    const currentLimits = (existingService?.limits ?? {}) as Record<string, unknown>;
    if (existingService) {
      await prisma.companyService.update({
        where: { id: existingService.id },
        data: {
          limits: {
            ...currentLimits,
            voiceFeatureEnabled: true,
            voiceProvisioningStatus: "provisioning",
          },
        },
      });
    }

    // Step 1 — search for an available Italian mobile/local number
    const searchRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/IT/Local.json?VoiceEnabled=true&PageSize=5`,
      { headers: { Authorization: authHeader } },
    );
    if (!searchRes.ok) {
      const text = await searchRes.text();
      throw new Error(`Twilio (ricerca numeri): ${searchRes.status} — ${text.slice(0, 200)}`);
    }
    const searchData = (await searchRes.json()) as {
      available_phone_numbers?: Array<{ phone_number: string; friendly_name: string }>;
    };
    const available = searchData.available_phone_numbers ?? [];
    if (available.length === 0) {
      throw new Error("Nessun numero italiano disponibile su Twilio al momento. Riprova più tardi.");
    }
    const chosen = available[0];

    // Step 2 — purchase the number and configure webhooks
    const purchaseBody = new URLSearchParams({
      PhoneNumber: chosen.phone_number,
      VoiceUrl: `${appUrl}/api/voice/twilio/incoming`,
      VoiceMethod: "POST",
      StatusCallback: `${appUrl}/api/voice/twilio/status`,
      StatusCallbackMethod: "POST",
      RecordingStatusCallback: `${appUrl}/api/voice/twilio/recording`,
      RecordingStatusCallbackMethod: "POST",
    });
    const purchaseRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`,
      {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
        body: purchaseBody,
      },
    );
    if (!purchaseRes.ok) {
      const text = await purchaseRes.text();
      throw new Error(`Twilio (acquisto numero): ${purchaseRes.status} — ${text.slice(0, 200)}`);
    }
    const purchased = (await purchaseRes.json()) as {
      sid: string;
      phone_number: string;
      friendly_name: string;
    };

    // Step 3 — record the line in DB and flip provisioning status to "ready"
    const line = await prisma.autoscuolaVoiceLine.upsert({
      where: { twilioPhoneSid: purchased.sid },
      update: {
        companyId: payload.companyId,
        displayNumber: purchased.friendly_name ?? purchased.phone_number,
        twilioNumber: purchased.phone_number,
        status: "ready",
        routingMode: "twilio",
      },
      create: {
        companyId: payload.companyId,
        displayNumber: purchased.friendly_name ?? purchased.phone_number,
        twilioNumber: purchased.phone_number,
        twilioPhoneSid: purchased.sid,
        status: "ready",
        routingMode: "twilio",
      },
    });

    const freshService = await prisma.companyService.findFirst({
      where: { companyId: payload.companyId, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true },
    });
    const freshLimits = (freshService?.limits ?? {}) as Record<string, unknown>;
    const nextLimits = {
      ...freshLimits,
      voiceFeatureEnabled: true,
      voiceProvisioningStatus: "ready",
      voiceLineRef: line.id,
    };

    if (freshService) {
      await prisma.companyService.update({
        where: { id: freshService.id },
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

    return {
      success: true as const,
      data: {
        lineId: line.id,
        phoneNumber: purchased.phone_number,
        displayNumber: purchased.friendly_name ?? purchased.phone_number,
        twilioPhoneSid: purchased.sid,
      },
    };
  } catch (error) {
    // Best-effort: flip status to "error" so the UI shows a recoverable state
    try {
      const parsed = provisionAutoscuolaVoiceLineSchema.safeParse(input);
      if (parsed.success) {
        const svc = await prisma.companyService.findFirst({
          where: { companyId: parsed.data.companyId, serviceKey: "AUTOSCUOLE" },
          select: { id: true, limits: true },
        });
        if (svc) {
          const lim = (svc.limits ?? {}) as Record<string, unknown>;
          await prisma.companyService.update({
            where: { id: svc.id },
            data: { limits: { ...lim, voiceProvisioningStatus: "error" } },
          });
        }
      }
    } catch {
      // Ignore secondary failure
    }
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
