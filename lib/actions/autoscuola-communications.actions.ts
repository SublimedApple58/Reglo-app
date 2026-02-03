"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";

const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
});

const updateRuleSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  offsetDays: z.number().int().min(0).max(365),
  channel: z.enum(["email", "whatsapp", "sms"]),
  target: z.enum(["student", "staff"]),
  appointmentType: z.string().optional().nullable(),
});

const ensureDefaults = async (companyId: string) => {
  const existingTemplates = await prisma.autoscuolaMessageTemplate.findMany({
    where: { companyId },
  });
  const existingRules = await prisma.autoscuolaMessageRule.findMany({
    where: { companyId },
  });

  if (existingTemplates.length && existingRules.length) {
    return;
  }

  const templateEmailExam = await prisma.autoscuolaMessageTemplate.create({
    data: {
      companyId,
      name: "Esame teorico - email 7 giorni",
      channel: "email",
      subject: "Esame in arrivo",
      body:
        "Ciao {{student.firstName}},\\n" +
        "il tuo esame è previsto per {{appointment.date}}.\\n" +
        "Qui trovi le istruzioni per presentarti in sede.",
    },
  });

  const templateWhatsappExam = await prisma.autoscuolaMessageTemplate.create({
    data: {
      companyId,
      name: "Esame teorico - WhatsApp promemoria",
      channel: "whatsapp",
      body:
        "Promemoria esame il {{appointment.date}}.\\n" +
        "Ci vediamo in autoscuola. - Reglo",
    },
  });

  const templateWhatsappGuide = await prisma.autoscuolaMessageTemplate.create({
    data: {
      companyId,
      name: "Guida - WhatsApp promemoria",
      channel: "whatsapp",
      body:
        "Promemoria guida il {{appointment.date}}.\\n" +
        "A presto! - Reglo",
    },
  });

  const templateCaseStatus = await prisma.autoscuolaMessageTemplate.create({
    data: {
      companyId,
      name: "Aggiornamento pratica",
      channel: "email",
      subject: "Aggiornamento pratica",
      body:
        "Ciao {{student.firstName}},\\n" +
        "la tua pratica è ora nello stato: {{case.status}}.",
    },
  });

  await prisma.autoscuolaMessageRule.createMany({
    data: [
      {
        companyId,
        templateId: templateEmailExam.id,
        type: "APPOINTMENT_BEFORE",
        appointmentType: "esame",
        offsetDays: 7,
        channel: "email",
        target: "student",
        active: true,
      },
      {
        companyId,
        templateId: templateWhatsappExam.id,
        type: "APPOINTMENT_BEFORE",
        appointmentType: "esame",
        offsetDays: 1,
        channel: "whatsapp",
        target: "student",
        active: true,
      },
      {
        companyId,
        templateId: templateWhatsappGuide.id,
        type: "APPOINTMENT_BEFORE",
        appointmentType: "guida",
        offsetDays: 1,
        channel: "whatsapp",
        target: "student",
        active: true,
      },
      {
        companyId,
        templateId: templateCaseStatus.id,
        type: "CASE_STATUS_CHANGED",
        offsetDays: 0,
        channel: "email",
        target: "student",
        active: true,
      },
    ],
  });
};

export async function getAutoscuolaCommunications() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    await ensureDefaults(membership.companyId);

    const [templates, rules] = await Promise.all([
      prisma.autoscuolaMessageTemplate.findMany({
        where: { companyId: membership.companyId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.autoscuolaMessageRule.findMany({
        where: { companyId: membership.companyId },
        include: { template: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const migratedTemplates = templates.map((template) => {
      if (template.channel === "sms") {
        return { ...template, channel: "whatsapp" };
      }
      return template;
    });
    const migratedRules = rules.map((rule) => {
      if (rule.channel === "sms") {
        return { ...rule, channel: "whatsapp" };
      }
      return rule;
    });

    return { success: true, data: { templates: migratedTemplates, rules: migratedRules } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaTemplate(
  input: z.infer<typeof updateTemplateSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateTemplateSchema.parse(input);

    const template = await prisma.autoscuolaMessageTemplate.update({
      where: { id: payload.id, companyId: membership.companyId },
      data: {
        subject: payload.subject ?? null,
        body: payload.body,
      },
    });

    return { success: true, data: template };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaRule(
  input: z.infer<typeof updateRuleSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const payload = updateRuleSchema.parse(input);

    const rule = await prisma.autoscuolaMessageRule.update({
      where: { id: payload.id, companyId: membership.companyId },
      data: {
        active: payload.active,
        offsetDays: payload.offsetDays,
        channel: payload.channel,
        target: payload.target,
        appointmentType: payload.appointmentType ?? null,
      },
    });

    return { success: true, data: rule };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
