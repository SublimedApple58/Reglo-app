"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { normalizeCompanyServices, type ServiceKey } from "@/lib/services";
import { getTwilioClient, VOICE_WEBHOOK_BASE_URL } from "@/lib/twilio";
import { telnyxFetch, TELNYX_WEBHOOK_BASE_URL } from "@/lib/telnyx";
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from "@/lib/constants";
import { setBackofficeCookie, clearBackofficeCookie } from "@/lib/backoffice-auth";

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
  routingMode: z.enum(["twilio", "sip", "telnyx"]).default("telnyx"),
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
      voiceDisplayNumber: payload.displayNumber,
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

// ─── Auto-provision: buy Telnyx local number (pending regulatory approval) ───

const provisionAutoscuolaVoiceLineSchema = z.object({
  companyId: z.string().uuid(),
});

export async function provisionAutoscuolaVoiceLine(
  input: z.infer<typeof provisionAutoscuolaVoiceLineSchema>,
) {
  try {
    await requireGlobalAdmin();
    const { companyId } = provisionAutoscuolaVoiceLineSchema.parse(input);

    // Check the company doesn't already have a ready or pending voice line
    const existingService = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const currentLimits = (existingService?.limits ?? {}) as Record<string, unknown>;
    if (currentLimits.voiceProvisioningStatus === "ready") {
      return { success: false, message: "Questa autoscuola ha già una linea vocale attiva." };
    }
    if (currentLimits.voiceProvisioningStatus === "pending_approval") {
      return { success: false, message: "C'è già un numero in attesa di approvazione per questa autoscuola." };
    }

    // 1. Search for available Italian local numbers on Telnyx
    const searchRes = await telnyxFetch(
      "/available_phone_numbers?filter[country_code]=IT&filter[phone_number_type]=local&filter[limit]=3",
    );
    if (!searchRes.ok) {
      const err = await searchRes.text();
      return { success: false, message: `Ricerca numeri Telnyx fallita: ${err}` };
    }
    const { data: candidates } = await searchRes.json();

    if (!candidates?.length) {
      return { success: false, message: "Nessun numero locale italiano disponibile su Telnyx." };
    }

    // 2. Buy the first available number
    const telnyxAppId = process.env.TELNYX_TEXML_APP_ID;
    const requirementGroupId = process.env.TELNYX_IT_REQUIREMENT_GROUP_ID;

    let purchased: { phone_number: string; id: string; orderId: string } | null = null;
    let lastError = "";

    for (const candidate of candidates) {
      try {
        const orderRes = await telnyxFetch("/number_orders", {
          method: "POST",
          body: JSON.stringify({
            phone_numbers: [{ phone_number: candidate.phone_number }],
            connection_id: telnyxAppId,
            messaging_profile_id: null,
            ...(requirementGroupId ? { requirement_group_id: requirementGroupId } : {}),
          }),
        });
        if (!orderRes.ok) {
          lastError = await orderRes.text();
          continue;
        }
        const { data: order } = await orderRes.json();
        const phoneNumbers = order?.phone_numbers ?? [];
        if (phoneNumbers.length > 0) {
          purchased = {
            phone_number: phoneNumbers[0].phone_number,
            id: phoneNumbers[0].id ?? order.id ?? "",
            orderId: order.id ?? "",
          };
          break;
        }
        lastError = "Order returned no phone numbers";
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (!purchased) {
      return {
        success: false,
        message: `Acquisto Telnyx fallito. Numeri provati: ${candidates.length}. Errore: ${lastError}`,
      };
    }

    // 3. Format display number: +390212345678 → +39 02 12345678
    const raw = purchased.phone_number;
    const withoutPrefix = raw.replace(/^\+39/, "");
    const displayNumber =
      withoutPrefix.length >= 6
        ? `+39 ${withoutPrefix.slice(0, 3)} ${withoutPrefix.slice(3)}`
        : raw;

    // 4. Save as pending_approval — Italian numbers require regulatory approval on Telnyx
    await prisma.companyService.updateMany({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      data: {
        limits: {
          ...currentLimits,
          voiceProvisioningStatus: "pending_approval",
          voiceDisplayNumber: displayNumber,
          voicePendingOrderId: purchased.orderId,
          voicePendingPhoneNumber: purchased.phone_number,
          voicePendingPhoneSid: purchased.id,
        } as Prisma.JsonObject,
      },
    });

    return {
      success: true,
      data: {
        phoneNumber: purchased.phone_number,
        displayNumber,
        status: "pending_approval" as const,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ─── Check Telnyx number approval status + finalize if ready ─────────────────

const checkVoiceLineStatusSchema = z.object({
  companyId: z.string().uuid(),
});

export async function checkVoiceLineStatus(
  input: z.infer<typeof checkVoiceLineStatusSchema>,
) {
  try {
    await requireGlobalAdmin();
    const { companyId } = checkVoiceLineStatusSchema.parse(input);

    const existingService = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const currentLimits = (existingService?.limits ?? {}) as Record<string, unknown>;

    if (currentLimits.voiceProvisioningStatus !== "pending_approval") {
      return { success: false, message: "Nessun numero in attesa di approvazione." };
    }

    const phoneSid = currentLimits.voicePendingPhoneSid as string | undefined;
    const phoneNumber = currentLimits.voicePendingPhoneNumber as string | undefined;

    if (!phoneSid || !phoneNumber) {
      return { success: false, message: "Dati del numero pendente mancanti. Usa l'assegnazione manuale." };
    }

    // Check number status on Telnyx
    const res = await telnyxFetch(`/phone_numbers/${phoneSid}`);
    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: `Errore Telnyx: ${err}` };
    }
    const { data: numberData } = await res.json();
    const telnyxStatus = numberData?.status as string | undefined;

    // Telnyx number statuses: "active", "pending", "deleted", etc.
    if (telnyxStatus !== "active") {
      return {
        success: true,
        data: {
          status: "still_pending" as const,
          telnyxStatus: telnyxStatus ?? "unknown",
          phoneNumber,
          displayNumber: currentLimits.voiceDisplayNumber as string,
        },
      };
    }

    // Number is active — finalize: create voice line + update limits
    const displayNumber = (currentLimits.voiceDisplayNumber as string) ?? phoneNumber;
    const result = await assignAutoscuolaVoiceLine({
      companyId,
      displayNumber,
      twilioNumber: phoneNumber,
      twilioPhoneSid: phoneSid,
      routingMode: "telnyx",
    });

    if (!result.success) {
      return result;
    }

    // Clean up pending fields
    const freshService = await prisma.companyService.findFirst({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const freshLimits = (freshService?.limits ?? {}) as Record<string, unknown>;
    delete freshLimits.voicePendingOrderId;
    delete freshLimits.voicePendingPhoneNumber;
    delete freshLimits.voicePendingPhoneSid;
    await prisma.companyService.updateMany({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      data: { limits: freshLimits as Prisma.JsonObject },
    });

    return {
      success: true,
      data: {
        status: "activated" as const,
        lineId: result.data!.lineId,
        phoneNumber,
        displayNumber,
      },
    };
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

export async function backofficeSignOut() {
  await clearBackofficeCookie();
}

export async function getVoiceLineDisplayNumber(lineId: string) {
  try {
    await requireGlobalAdmin();
    const line = await prisma.autoscuolaVoiceLine.findUnique({
      where: { id: lineId },
      select: { displayNumber: true },
    });
    return { success: true as const, displayNumber: line?.displayNumber ?? null };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
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
