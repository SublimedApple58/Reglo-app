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
  deadlineType: z.string().optional().nullable(),
});

const ensureDefaults = async (companyId: string) => {
  const existingTemplates = await prisma.autoscuolaMessageTemplate.findMany({
    where: { companyId },
  });
  const existingRules = await prisma.autoscuolaMessageRule.findMany({
    where: { companyId },
  });

  const templateByName = (name: string) =>
    existingTemplates.find((template) => template.name === name);

  const ensureTemplate = async (data: {
    name: string;
    channel: string;
    subject?: string;
    body: string;
  }) => {
    const existing = templateByName(data.name);
    if (existing) return existing;
    const created = await prisma.autoscuolaMessageTemplate.create({
      data: {
        companyId,
        name: data.name,
        channel: data.channel,
        subject: data.subject ?? null,
        body: data.body,
      },
    });
    existingTemplates.push(created);
    return created;
  };

  const templateEmailExam = await ensureTemplate({
    name: "Esame teorico - email 7 giorni",
    channel: "email",
    subject: "Esame in arrivo",
    body:
      "Ciao {{student.firstName}},\\n" +
      "il tuo esame è previsto per {{appointment.date}}.\\n" +
      "Qui trovi le istruzioni per presentarti in sede.",
  });

  const templateWhatsappExam = await ensureTemplate({
    name: "Esame teorico - WhatsApp promemoria",
    channel: "whatsapp",
    body:
      "Promemoria esame il {{appointment.date}}.\\n" +
      "Ci vediamo in autoscuola. - Reglo",
  });

  const templateWhatsappGuide = await ensureTemplate({
    name: "Guida - WhatsApp promemoria",
    channel: "whatsapp",
    body:
      "Promemoria guida il {{appointment.date}}.\\n" +
      "A presto! - Reglo",
  });

  const templateCaseStatus = await ensureTemplate({
    name: "Aggiornamento pratica",
    channel: "email",
    subject: "Aggiornamento pratica",
    body:
      "Ciao {{student.firstName}},\\n" +
      "la tua pratica è ora nello stato: {{case.status}}.",
  });

  const templatePinkSheet = await ensureTemplate({
    name: "Scadenza foglio rosa",
    channel: "email",
    subject: "Scadenza foglio rosa",
    body:
      "Il foglio rosa di {{student.firstName}} {{student.lastName}} scade il {{case.deadlineDate}}.\\n" +
      "Intervenire per evitare ritardi.",
  });

  const templateMedical = await ensureTemplate({
    name: "Scadenza visita medica",
    channel: "email",
    subject: "Scadenza visita medica",
    body:
      "La visita medica di {{student.firstName}} {{student.lastName}} scade il {{case.deadlineDate}}.\\n" +
      "Contattare l'allievo per rinnovo.",
  });

  const existingRule = (where: { type: string; appointmentType?: string | null; deadlineType?: string | null }) =>
    existingRules.find(
      (rule) =>
        rule.type === where.type &&
        (where.appointmentType ?? null) === (rule.appointmentType ?? null) &&
        (where.deadlineType ?? null) === (rule.deadlineType ?? null),
    );

  const rulesToCreate = [
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
    {
      companyId,
      templateId: templatePinkSheet.id,
      type: "CASE_DEADLINE_BEFORE",
      deadlineType: "PINK_SHEET_EXPIRES",
      offsetDays: 30,
      channel: "email",
      target: "staff",
      active: true,
    },
    {
      companyId,
      templateId: templateMedical.id,
      type: "CASE_DEADLINE_BEFORE",
      deadlineType: "MEDICAL_EXPIRES",
      offsetDays: 30,
      channel: "email",
      target: "staff",
      active: true,
    },
  ].filter((rule) => !existingRule(rule));

  if (rulesToCreate.length) {
    await prisma.autoscuolaMessageRule.createMany({ data: rulesToCreate });
  }
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
        deadlineType: payload.deadlineType ?? null,
      },
    });

    return { success: true, data: rule };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
