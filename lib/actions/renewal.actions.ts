"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireRenewalOwner } from "@/lib/renewal/access";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import { SERVER_URL } from "@/lib/constants";
import {
  RENEWAL_REQUEST_STATUSES,
  RENEWAL_DOCUMENT_LABELS,
  RENEWAL_RESUME_TOKEN_DAYS,
  type RenewalDocumentType,
} from "@/lib/renewal/constants";
import { sendRenewalIntegrationEmail } from "@/lib/renewal/notifications";

/**
 * Rinnovo Patenti — owner-side management actions.
 * Gate: requireRenewalOwner (AUTOSCUOLE + licenseRenewalEnabled + OWNER).
 * See docs/features/rinnovo-patenti.md.
 */

// ── Public slug ───────────────────────────────────────────────────────────────

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Solo lettere minuscole, numeri e trattini.");

export async function getRenewalSettings() {
  try {
    const { company } = await requireRenewalOwner();
    const [row, limits] = await Promise.all([
      prisma.company.findUnique({
        where: { id: company.id },
        select: { renewalPublicSlug: true },
      }),
      getCompanyLimits(company.id),
    ]);
    return {
      success: true,
      data: {
        publicSlug: row?.renewalPublicSlug ?? null,
        // undefined = attivo (default friendly)
        publicActive: limits.licenseRenewalPublicActive !== false,
        anamnesticRequired: Boolean(limits.licenseRenewalAnamnesticRequired),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Read the AUTOSCUOLE limits JSON for a company. */
async function getCompanyLimits(companyId: string): Promise<Record<string, unknown>> {
  const service = await prisma.companyService.findFirst({
    where: { companyId, serviceKey: "AUTOSCUOLE" },
    select: { limits: true },
  });
  return (service?.limits ?? {}) as Record<string, unknown>;
}

const renewalSettingsSchema = z.object({
  publicActive: z.boolean().optional(),
  anamnesticRequired: z.boolean().optional(),
});

/**
 * Owner-side settings: suspend/resume the public link and decide whether the
 * anamnestic certificate is mandatory. Merges into CompanyService.limits (same
 * pattern as setAutoAssignQuizOnSignup).
 */
export async function updateRenewalSettings(
  input: z.infer<typeof renewalSettingsSchema>,
) {
  try {
    const { company } = await requireRenewalOwner();
    const payload = renewalSettingsSchema.parse(input);

    const service = await prisma.companyService.findFirst({
      where: { companyId: company.id, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true },
    });
    if (!service) {
      return { success: false, message: "Servizio AUTOSCUOLE non configurato." };
    }

    const current = (service.limits ?? {}) as Record<string, unknown>;
    await prisma.companyService.update({
      where: { id: service.id },
      data: {
        limits: {
          ...current,
          ...(payload.publicActive !== undefined
            ? { licenseRenewalPublicActive: payload.publicActive }
            : {}),
          ...(payload.anamnesticRequired !== undefined
            ? { licenseRenewalAnamnesticRequired: payload.anamnesticRequired }
            : {}),
        } as Prisma.InputJsonValue,
      },
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function setRenewalPublicSlug(input: { slug: string }) {
  try {
    const { company } = await requireRenewalOwner();
    const slug = slugSchema.parse(input.slug);

    const taken = await prisma.company.findFirst({
      where: { renewalPublicSlug: slug, NOT: { id: company.id } },
      select: { id: true },
    });
    if (taken) {
      return { success: false, message: "Questo indirizzo è già in uso da un'altra autoscuola." };
    }

    await prisma.company.update({
      where: { id: company.id },
      data: { renewalPublicSlug: slug },
    });
    return { success: true, data: { publicSlug: slug } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Medici + disponibilità ────────────────────────────────────────────────────

const availabilityWindowSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(1).max(1440),
  })
  .refine((w) => w.endMinutes > w.startMinutes, {
    message: "L'orario di fine deve essere dopo l'inizio.",
  });

const medicoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable(),
  visitDurationMinutes: z.number().int().min(5).max(120),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function listRenewalMedici() {
  try {
    const { company } = await requireRenewalOwner();
    const medici = await prisma.renewalMedico.findMany({
      where: { companyId: company.id },
      include: { availabilities: true },
      orderBy: { createdAt: "asc" },
    });
    return { success: true, data: medici };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createRenewalMedico(input: z.infer<typeof medicoSchema>) {
  try {
    const { company } = await requireRenewalOwner();
    const payload = medicoSchema.parse(input);
    const medico = await prisma.renewalMedico.create({
      data: {
        companyId: company.id,
        name: payload.name,
        phone: payload.phone || null,
        email: payload.email || null,
        visitDurationMinutes: payload.visitDurationMinutes,
        status: payload.status,
      },
    });
    return { success: true, data: medico };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateRenewalMedico(
  input: z.infer<typeof medicoSchema> & { id: string },
) {
  try {
    const { company } = await requireRenewalOwner();
    const { id, ...rest } = input;
    const payload = medicoSchema.parse(rest);
    const existing = await prisma.renewalMedico.findFirst({
      where: { id, companyId: company.id },
      select: { id: true },
    });
    if (!existing) return { success: false, message: "Medico non trovato." };

    const medico = await prisma.renewalMedico.update({
      where: { id },
      data: {
        name: payload.name,
        phone: payload.phone || null,
        email: payload.email || null,
        visitDurationMinutes: payload.visitDurationMinutes,
        status: payload.status,
      },
    });
    return { success: true, data: medico };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteRenewalMedico(input: { id: string }) {
  try {
    const { company } = await requireRenewalOwner();
    const existing = await prisma.renewalMedico.findFirst({
      where: { id: input.id, companyId: company.id },
      select: { id: true },
    });
    if (!existing) return { success: false, message: "Medico non trovato." };

    // Guard: a medico with confirmed future bookings must not vanish silently.
    const futureBookings = await prisma.renewalVisitBooking.count({
      where: {
        medicoId: input.id,
        status: "confirmed",
        startAt: { gte: new Date() },
      },
    });
    if (futureBookings > 0) {
      return {
        success: false,
        message: "Il medico ha visite future confermate: annullale prima di eliminarlo.",
      };
    }

    await prisma.renewalMedico.delete({ where: { id: input.id } });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/** Replace the full set of weekly windows for a medico. */
export async function setMedicoAvailability(input: {
  medicoId: string;
  windows: z.infer<typeof availabilityWindowSchema>[];
}) {
  try {
    const { company } = await requireRenewalOwner();
    const windows = z.array(availabilityWindowSchema).max(20).parse(input.windows);

    const medico = await prisma.renewalMedico.findFirst({
      where: { id: input.medicoId, companyId: company.id },
      select: { id: true },
    });
    if (!medico) return { success: false, message: "Medico non trovato." };

    await prisma.$transaction([
      prisma.renewalMedicoAvailability.deleteMany({ where: { medicoId: input.medicoId } }),
      prisma.renewalMedicoAvailability.createMany({
        data: windows.map((w) => ({
          companyId: company.id,
          medicoId: input.medicoId,
          daysOfWeek: w.daysOfWeek,
          startMinutes: w.startMinutes,
          endMinutes: w.endMinutes,
        })),
      }),
    ]);
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── FAQ (knowledge base del chatbot) ──────────────────────────────────────────

const faqSchema = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(4000),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export async function listRenewalFaqs() {
  try {
    const { company } = await requireRenewalOwner();
    const faqs = await prisma.renewalFaq.findMany({
      where: { companyId: company.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { success: true, data: faqs };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createRenewalFaq(input: z.infer<typeof faqSchema>) {
  try {
    const { company } = await requireRenewalOwner();
    const payload = faqSchema.parse(input);
    const faq = await prisma.renewalFaq.create({
      data: { companyId: company.id, ...payload },
    });
    return { success: true, data: faq };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateRenewalFaq(input: z.infer<typeof faqSchema> & { id: string }) {
  try {
    const { company } = await requireRenewalOwner();
    const { id, ...rest } = input;
    const payload = faqSchema.parse(rest);
    const existing = await prisma.renewalFaq.findFirst({
      where: { id, companyId: company.id },
      select: { id: true },
    });
    if (!existing) return { success: false, message: "FAQ non trovata." };
    const faq = await prisma.renewalFaq.update({ where: { id }, data: payload });
    return { success: true, data: faq };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteRenewalFaq(input: { id: string }) {
  try {
    const { company } = await requireRenewalOwner();
    const existing = await prisma.renewalFaq.findFirst({
      where: { id: input.id, companyId: company.id },
      select: { id: true },
    });
    if (!existing) return { success: false, message: "FAQ non trovata." };
    await prisma.renewalFaq.delete({ where: { id: input.id } });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// ── Richieste (revisione) ─────────────────────────────────────────────────────

export async function listRenewalRequests(input?: { status?: string }) {
  try {
    const { company } = await requireRenewalOwner();
    const requests = await prisma.renewalRequest.findMany({
      where: {
        companyId: company.id,
        ...(input?.status ? { status: input.status } : {}),
      },
      include: {
        booking: { include: { medico: { select: { id: true, name: true } } } },
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { success: true, data: requests };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getRenewalRequest(input: { id: string }) {
  try {
    const { company } = await requireRenewalOwner();
    const request = await prisma.renewalRequest.findFirst({
      where: { id: input.id, companyId: company.id },
      include: {
        documents: { orderBy: { createdAt: "asc" } },
        booking: { include: { medico: { select: { id: true, name: true } } } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!request) return { success: false, message: "Richiesta non trovata." };

    // Sign document URLs for viewing.
    const documents = await Promise.all(
      request.documents.map(async (doc) => ({
        ...doc,
        url: await getSignedAssetUrl(doc.fileKey),
      })),
    );
    return { success: true, data: { ...request, documents } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const requestStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(RENEWAL_REQUEST_STATUSES),
  reviewNotes: z.string().trim().max(2000).optional(),
});

export async function updateRenewalRequestStatus(
  input: z.infer<typeof requestStatusSchema>,
) {
  try {
    const { company } = await requireRenewalOwner();
    const payload = requestStatusSchema.parse(input);
    const existing = await prisma.renewalRequest.findFirst({
      where: { id: payload.id, companyId: company.id },
      select: { id: true },
    });
    if (!existing) return { success: false, message: "Richiesta non trovata." };

    await prisma.$transaction(async (tx) => {
      await tx.renewalRequest.update({
        where: { id: payload.id },
        data: {
          status: payload.status,
          ...(payload.reviewNotes !== undefined ? { reviewNotes: payload.reviewNotes } : {}),
        },
      });
      // When the request is cancelled/rejected, cancel its visit too.
      if (payload.status === "cancelled" || payload.status === "rejected") {
        await tx.renewalVisitBooking.updateMany({
          where: { requestId: payload.id, status: "confirmed" },
          data: { status: "cancelled" },
        });
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const integrationSchema = z.object({
  id: z.string().uuid(),
  /** Document types the citizen must re-upload. */
  missingTypes: z.array(z.string()).max(6).default([]),
  message: z.string().trim().max(1000).optional(),
});

/**
 * "Ricontatto automatico": flags the request as awaiting documents, mints a
 * resume token and emails the citizen a link that reopens their request.
 */
export async function requestDocumentIntegration(
  input: z.infer<typeof integrationSchema>,
) {
  try {
    const { company } = await requireRenewalOwner();
    const payload = integrationSchema.parse(input);

    const request = await prisma.renewalRequest.findFirst({
      where: { id: payload.id, companyId: company.id },
      select: { id: true, email: true },
    });
    if (!request) return { success: false, message: "Richiesta non trovata." };
    if (!request.email) {
      return {
        success: false,
        message: "Nessuna email registrata per questo cittadino: ricontattalo manualmente.",
      };
    }

    const slugRow = await prisma.company.findUnique({
      where: { id: company.id },
      select: { renewalPublicSlug: true },
    });
    if (!slugRow?.renewalPublicSlug) {
      return { success: false, message: "Imposta prima il link pubblico." };
    }

    const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
    const expiresAt = new Date(
      Date.now() + RENEWAL_RESUME_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    await prisma.renewalRequest.update({
      where: { id: payload.id },
      data: {
        status: "awaiting_documents",
        resumeToken: token,
        resumeTokenExpiresAt: expiresAt,
      },
    });

    const base = (SERVER_URL || "https://app.reglo.it").replace(/\/$/, "");
    const resumeUrl = `${base}/rinnovo/${slugRow.renewalPublicSlug}/riprendi/${token}`;
    const missingLabels = payload.missingTypes.map(
      (t) => RENEWAL_DOCUMENT_LABELS[t as RenewalDocumentType] ?? t,
    );

    await sendRenewalIntegrationEmail({
      requestId: payload.id,
      missingLabels,
      resumeUrl,
      customMessage: payload.message,
    });

    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const documentStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["uploaded", "approved", "rejected"]),
});

export async function updateRenewalDocumentStatus(
  input: z.infer<typeof documentStatusSchema>,
) {
  try {
    const { company } = await requireRenewalOwner();
    const payload = documentStatusSchema.parse(input);
    // Ensure the document belongs to a request of this company.
    const doc = await prisma.renewalDocument.findFirst({
      where: { id: payload.id, request: { companyId: company.id } },
      select: { id: true },
    });
    if (!doc) return { success: false, message: "Documento non trovato." };
    await prisma.renewalDocument.update({
      where: { id: payload.id },
      data: { status: payload.status },
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
