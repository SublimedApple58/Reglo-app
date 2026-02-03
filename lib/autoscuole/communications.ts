"use server";

import { tokenRegex } from "@/components/pages/Workflows/Editor/shared/token-utils";
import { sendDynamicEmail } from "@/email";
import { prisma as defaultPrisma } from "@/db/prisma";

type PrismaClientLike = typeof defaultPrisma;

type AutoscuolaContext = {
  student?: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  };
  appointment?: {
    date?: string;
    type?: string;
  };
  case?: {
    status?: string;
    category?: string | null;
    deadlineLabel?: string;
    deadlineDate?: string;
    pinkSheetExpiresAt?: string;
    medicalExpiresAt?: string;
  };
};

const formatDate = (value?: Date | string | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT");
};

const DEADLINE_LABELS: Record<string, string> = {
  PINK_SHEET_EXPIRES: "Foglio rosa",
  MEDICAL_EXPIRES: "Visita medica",
};

const renderTemplate = (template: string, context: AutoscuolaContext) => {
  const safe = (template ?? "").replace(/\\n/g, "\n");
  return safe.replace(tokenRegex, (_, token: string) => {
    const path = token.trim().split(".");
    let current: unknown = context;
    for (const segment of path) {
      if (current && typeof current === "object" && segment in current) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        current = "";
        break;
      }
    }
    return current == null ? "" : String(current);
  });
};

const normalizeWhatsapp = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
};

const sendWhatsApp = async ({ to, body }: { to: string; body: string }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    throw new Error("TWILIO_* env non configurate (WhatsApp)");
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: normalizeWhatsapp(from),
      To: normalizeWhatsapp(to),
      Body: body,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio error: ${res.status} ${text.slice(0, 120)}`);
  }
};

const resolveRecipients = async ({
  prisma,
  companyId,
  target,
  channel,
  student,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  target: "student" | "staff";
  channel: "email" | "whatsapp" | "sms";
  student?: { email?: string | null; phone?: string | null };
}) => {
  if (target === "student") {
    if (channel === "email") {
      return student?.email ? [student.email] : [];
    }
    return student?.phone ? [student.phone] : [];
  }

  if (channel !== "email") return [];

  const admins = await prisma.companyMember.findMany({
    where: { companyId, role: "admin" },
    include: { user: { select: { email: true } } },
  });
  return admins.map((entry) => entry.user.email).filter(Boolean);
};

export const sendAutoscuolaMessage = async ({
  prisma = defaultPrisma,
  rule,
  template,
  student,
  appointment,
  caseData,
  appointmentId,
  studentId,
  dedupeKey,
}: {
  prisma?: PrismaClientLike;
  rule: {
    id: string;
    companyId: string;
    channel: string;
    target: string;
  };
  template: {
    id: string;
    subject?: string | null;
    body: string;
  };
  student?: { firstName: string; lastName: string; email?: string | null; phone?: string | null };
  appointment?: { date?: string; type?: string };
  caseData?: {
    status?: string;
    category?: string | null;
    deadlineLabel?: string;
    deadlineDate?: string;
    pinkSheetExpiresAt?: string;
    medicalExpiresAt?: string;
  };
  appointmentId?: string | null;
  studentId?: string | null;
  dedupeKey?: string;
}) => {
  const context: AutoscuolaContext = {
    student,
    appointment,
    case: caseData,
  };

  const body = renderTemplate(template.body, context);
  const subject = template.subject ? renderTemplate(template.subject, context) : undefined;

  const channel = rule.channel as "email" | "sms" | "whatsapp";
  const target = rule.target as "student" | "staff";
  const normalizedChannel = channel === "sms" ? "whatsapp" : channel;

  const recipients = await resolveRecipients({
    prisma,
    companyId: rule.companyId,
    target,
    channel: normalizedChannel,
    student,
  });

  if (recipients.length === 0) {
    await prisma.autoscuolaMessageLog.create({
      data: {
        companyId: rule.companyId,
        ruleId: rule.id,
        templateId: template.id,
        appointmentId: appointmentId ?? null,
        studentId: studentId ?? null,
        channel: normalizedChannel,
        recipient: "-",
        status: "skipped",
        error: "Nessun destinatario disponibile.",
        payload: {
          subject,
          body,
        },
      },
    });
    return;
  }

  for (const recipient of recipients) {
    const existing = dedupeKey
      ? await prisma.autoscuolaMessageLog.findFirst({
          where: {
            ruleId: rule.id,
            recipient,
            channel: normalizedChannel,
            payload: {
              path: ["dedupeKey"],
              equals: dedupeKey,
            },
          },
        })
      : appointmentId
        ? await prisma.autoscuolaMessageLog.findFirst({
            where: {
              ruleId: rule.id,
              appointmentId,
              recipient,
              channel: normalizedChannel,
            },
          })
        : null;
    if (existing) continue;

    try {
      if (normalizedChannel === "email") {
        await sendDynamicEmail({
          to: recipient,
          subject: subject ?? "Reglo Autoscuole",
          body,
        });
      } else {
        await sendWhatsApp({ to: recipient, body });
      }

      await prisma.autoscuolaMessageLog.create({
        data: {
          companyId: rule.companyId,
          ruleId: rule.id,
          templateId: template.id,
          appointmentId: appointmentId ?? null,
          studentId: studentId ?? null,
          channel: normalizedChannel,
          recipient,
          status: "sent",
          payload: {
            subject,
            body,
            ...(dedupeKey ? { dedupeKey } : {}),
          },
        },
      });
    } catch (error) {
      await prisma.autoscuolaMessageLog.create({
        data: {
          companyId: rule.companyId,
          ruleId: rule.id,
          templateId: template.id,
          appointmentId: appointmentId ?? null,
          studentId: studentId ?? null,
          channel: normalizedChannel,
          recipient,
          status: "failed",
          error: error instanceof Error ? error.message : "Errore invio",
          payload: {
            subject,
            body,
            ...(dedupeKey ? { dedupeKey } : {}),
          },
        },
      });
    }
  }
};

export const processAutoscuolaAppointmentReminders = async ({
  prisma = defaultPrisma,
  now = new Date(),
  windowMinutes = 5,
}: {
  prisma?: PrismaClientLike;
  now?: Date;
  windowMinutes?: number;
}) => {
  const rules = await prisma.autoscuolaMessageRule.findMany({
    where: { active: true, type: "APPOINTMENT_BEFORE" },
    include: { template: true },
  });

  for (const rule of rules) {
    const offsetDays = Number(rule.offsetDays ?? 0);
    const targetTime = new Date(now);
    targetTime.setDate(targetTime.getDate() + offsetDays);

    const start = new Date(targetTime.getTime() - windowMinutes * 60 * 1000);
    const end = new Date(targetTime.getTime() + windowMinutes * 60 * 1000);

    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: rule.companyId,
        ...(rule.appointmentType ? { type: rule.appointmentType } : {}),
        startsAt: { gte: start, lte: end },
      },
      include: {
        student: true,
        case: true,
      },
    });

    for (const appointment of appointments) {
      await sendAutoscuolaMessage({
        prisma,
        rule,
        template: rule.template,
        student: {
          firstName: appointment.student.firstName,
          lastName: appointment.student.lastName,
          email: appointment.student.email,
          phone: appointment.student.phone,
        },
        appointment: {
          date: appointment.startsAt.toLocaleString("it-IT"),
          type: appointment.type,
        },
        caseData: appointment.case
          ? {
              status: appointment.case.status,
              category: appointment.case.category,
            }
          : undefined,
        appointmentId: appointment.id,
        studentId: appointment.studentId,
      });
    }
  }
};

export const notifyAutoscuolaCaseStatusChange = async ({
  prisma = defaultPrisma,
  companyId,
  caseId,
  status,
  student,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  caseId: string;
  status: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  };
}) => {
  const rules = await prisma.autoscuolaMessageRule.findMany({
    where: { active: true, type: "CASE_STATUS_CHANGED", companyId },
    include: { template: true },
  });

  for (const rule of rules) {
    await sendAutoscuolaMessage({
      prisma,
      rule,
      template: rule.template,
      student,
      caseData: { status },
      studentId: student.id,
      appointmentId: null,
    });
  }
};

export const processAutoscuolaCaseDeadlines = async ({
  prisma = defaultPrisma,
  now = new Date(),
  windowMinutes = 5,
}: {
  prisma?: PrismaClientLike;
  now?: Date;
  windowMinutes?: number;
}) => {
  const rules = await prisma.autoscuolaMessageRule.findMany({
    where: { active: true, type: "CASE_DEADLINE_BEFORE" },
    include: { template: true },
  });

  const deadlineFieldMap: Record<string, "pinkSheetExpiresAt" | "medicalExpiresAt"> = {
    PINK_SHEET_EXPIRES: "pinkSheetExpiresAt",
    MEDICAL_EXPIRES: "medicalExpiresAt",
  };

  for (const rule of rules) {
    const deadlineKey = rule.deadlineType ?? "";
    const field = deadlineFieldMap[deadlineKey];
    if (!field) continue;

    const offsetDays = Number(rule.offsetDays ?? 0);
    const targetTime = new Date(now);
    targetTime.setDate(targetTime.getDate() + offsetDays);

    const start = new Date(targetTime.getTime() - windowMinutes * 60 * 1000);
    const end = new Date(targetTime.getTime() + windowMinutes * 60 * 1000);

    const cases = await prisma.autoscuolaCase.findMany({
      where: {
        companyId: rule.companyId,
        [field]: { gte: start, lte: end },
      },
      include: { student: true },
    });

    for (const item of cases) {
      const deadlineDate = item[field];
      const dedupeKey = `${rule.id}:${item.id}:${deadlineKey}:${formatDate(deadlineDate)}`;

      await sendAutoscuolaMessage({
        prisma,
        rule,
        template: rule.template,
        student: {
          firstName: item.student.firstName,
          lastName: item.student.lastName,
          email: item.student.email,
          phone: item.student.phone,
        },
        caseData: {
          status: item.status,
          category: item.category,
          deadlineLabel: DEADLINE_LABELS[deadlineKey] ?? "Scadenza",
          deadlineDate: formatDate(deadlineDate),
          pinkSheetExpiresAt: formatDate(item.pinkSheetExpiresAt),
          medicalExpiresAt: formatDate(item.medicalExpiresAt),
        },
        studentId: item.studentId,
        appointmentId: null,
        dedupeKey,
      });
    }
  }
};
