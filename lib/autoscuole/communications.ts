"use server";

import { tokenRegex } from "@/components/pages/Workflows/Editor/shared/token-utils";
import { sendDynamicEmail } from "@/email";
import { prisma as defaultPrisma } from "@/db/prisma";
import { sendAutoscuolaWhatsApp } from "@/lib/autoscuole/whatsapp";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";

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

const AUTOSCUOLA_TIMEZONE = "Europe/Rome";

const formatDate = (value?: Date | string | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT", { timeZone: AUTOSCUOLA_TIMEZONE });
};

const formatAutoscuolaDateTime = (value?: Date | string | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const DEADLINE_LABELS: Record<string, string> = {
  PINK_SHEET_EXPIRES: "Foglio rosa",
  MEDICAL_EXPIRES: "Visita medica",
};
const REMINDER_MINUTES = [120, 60, 30, 20, 15] as const;
const DEFAULT_REMINDER_MINUTES = 60;
const DEFAULT_REMINDER_CHANNELS = ["push", "whatsapp", "email"] as const;

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

const parseReminderMinutes = (value: unknown) => {
  if (typeof value !== "number") return DEFAULT_REMINDER_MINUTES;
  const normalized = Math.trunc(value);
  return REMINDER_MINUTES.includes(normalized as (typeof REMINDER_MINUTES)[number])
    ? normalized
    : DEFAULT_REMINDER_MINUTES;
};

const parseReminderChannels = (value: unknown) => {
  if (!Array.isArray(value)) return [...DEFAULT_REMINDER_CHANNELS];
  const channels = value.filter(
    (item): item is "push" | "whatsapp" | "email" =>
      item === "push" || item === "whatsapp" || item === "email",
  );
  const unique = Array.from(new Set(channels));
  return unique.length ? unique : [...DEFAULT_REMINDER_CHANNELS];
};

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();
const normalizeEmail = (value: string | null | undefined) =>
  normalizeText(value).toLowerCase();

const parseNameParts = (name: string | null, email: string) => {
  const cleanName = normalizeText(name).replace(/\s+/g, " ");
  if (cleanName) {
    const [firstName, ...rest] = cleanName.split(" ");
    return {
      firstName: firstName || "Allievo",
      lastName: rest.join(" ").trim() || "Reglo",
    };
  }
  const localPart = email.split("@")[0] || "allievo";
  return {
    firstName: localPart.slice(0, 1).toUpperCase() + localPart.slice(1),
    lastName: "Reglo",
  };
};

const mapStudentFromUser = (user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}) => {
  const email = normalizeEmail(user.email);
  const parts = parseNameParts(user.name, email);
  return {
    id: user.id,
    firstName: parts.firstName,
    lastName: parts.lastName,
    email: email || null,
    phone: user.phone,
  };
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
        await sendAutoscuolaWhatsApp({ to: recipient, body });
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
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        case: true,
      },
    });

    for (const appointment of appointments) {
      const studentProfile = mapStudentFromUser(appointment.student);
      await sendAutoscuolaMessage({
        prisma,
        rule,
        template: rule.template,
        student: {
          firstName: studentProfile.firstName,
          lastName: studentProfile.lastName,
          email: studentProfile.email,
          phone: studentProfile.phone,
        },
        appointment: {
          date: formatAutoscuolaDateTime(appointment.startsAt),
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
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    for (const item of cases) {
      const deadlineDate = item[field];
      const dedupeKey = `${rule.id}:${item.id}:${deadlineKey}:${formatDate(deadlineDate)}`;
      const studentProfile = mapStudentFromUser(item.student);

      await sendAutoscuolaMessage({
        prisma,
        rule,
        template: rule.template,
        student: {
          firstName: studentProfile.firstName,
          lastName: studentProfile.lastName,
          email: studentProfile.email,
          phone: studentProfile.phone,
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

export const processAutoscuolaAutoCompleteCheckedIn = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => {
  const fallbackEnd = new Date(now.getTime() - 30 * 60 * 1000);

  const result = await prisma.autoscuolaAppointment.updateMany({
    where: {
      status: "checked_in",
      OR: [
        { endsAt: { lte: now } },
        {
          endsAt: null,
          startsAt: { lte: fallbackEnd },
        },
      ],
    },
    data: { status: "completed" },
  });

  return { completedCount: result.count };
};

export const processAutoscuolaConfiguredAppointmentReminders = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => {
  const services = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE", status: "ACTIVE" },
    select: { companyId: true, limits: true },
  });

  const activeStatuses = ["scheduled", "confirmed"];

  for (const service of services) {
    const limits = (service.limits ?? {}) as Record<string, unknown>;
    const studentMinutes = parseReminderMinutes(limits.studentReminderMinutes);
    const instructorMinutes = parseReminderMinutes(limits.instructorReminderMinutes);
    const studentChannels = parseReminderChannels(limits.studentReminderChannels);
    const instructorChannels = parseReminderChannels(limits.instructorReminderChannels);

    const targetStudent = new Date(now.getTime() + studentMinutes * 60 * 1000);
    targetStudent.setSeconds(0, 0);
    const targetStudentEnd = new Date(targetStudent.getTime() + 60 * 1000);

    const targetInstructor = new Date(now.getTime() + instructorMinutes * 60 * 1000);
    targetInstructor.setSeconds(0, 0);
    const targetInstructorEnd = new Date(targetInstructor.getTime() + 60 * 1000);

    const [studentAppointments, instructorAppointments] = await Promise.all([
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: service.companyId,
          status: { in: activeStatuses },
          startsAt: { gte: targetStudent, lt: targetStudentEnd },
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          instructor: { include: { user: { select: { id: true, email: true } } } },
          vehicle: true,
        },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: {
          companyId: service.companyId,
          status: { in: activeStatuses },
          startsAt: { gte: targetInstructor, lt: targetInstructorEnd },
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          instructor: { include: { user: { select: { id: true, email: true } } } },
          vehicle: true,
        },
      }),
    ]);

    for (const appointment of studentAppointments) {
      const studentProfile = mapStudentFromUser(appointment.student);
      const startsAtLabel = formatAutoscuolaDateTime(appointment.startsAt);
      const durationMinutes = Math.max(
        30,
        Math.round(
          ((appointment.endsAt?.getTime() ??
            appointment.startsAt.getTime() + 30 * 60 * 1000) -
            appointment.startsAt.getTime()) /
            60000,
        ),
      );
      const body = `Promemoria guida il ${startsAtLabel}. Durata ${durationMinutes} minuti.`;
      if (studentChannels.includes("email") && studentProfile.email) {
        try {
          await sendDynamicEmail({
            to: studentProfile.email,
            subject: "Reglo Autoscuole · Reminder guida",
            body,
          });
        } catch (error) {
          console.error("Student reminder email error", error);
        }
      }
      if (studentChannels.includes("whatsapp") && studentProfile.phone) {
        try {
          await sendAutoscuolaWhatsApp({ to: studentProfile.phone, body });
        } catch (error) {
          console.error("Student reminder WhatsApp error", error);
        }
      }
      if (studentChannels.includes("push")) {
        if (appointment.studentId) {
          try {
            await sendAutoscuolaPushToUsers({
              companyId: service.companyId,
              userIds: [appointment.studentId],
              title: "Reminder guida",
              body,
              data: {
                kind: "appointment_reminder_student",
                appointmentId: appointment.id,
                startsAt: appointment.startsAt.toISOString(),
              },
            });
          } catch (error) {
            console.error("Student reminder push error", error);
          }
        }
      }
    }
    for (const appointment of instructorAppointments) {
      const instructor = appointment.instructor;
      if (!instructor) continue;
      const studentProfile = mapStudentFromUser(appointment.student);
      const startsAtLabel = formatAutoscuolaDateTime(appointment.startsAt);
      const durationMinutes = Math.max(
        30,
        Math.round(
          ((appointment.endsAt?.getTime() ??
            appointment.startsAt.getTime() + 30 * 60 * 1000) -
            appointment.startsAt.getTime()) /
            60000,
        ),
      );
      const studentName = `${studentProfile.firstName} ${studentProfile.lastName}`.trim();
      const body = `Promemoria guida con ${studentName} il ${startsAtLabel}. Durata ${durationMinutes} minuti.`;
      if (instructorChannels.includes("email") && instructor.user?.email) {
        try {
          await sendDynamicEmail({
            to: instructor.user.email,
            subject: "Reglo Autoscuole · Reminder guida",
            body,
          });
        } catch (error) {
          console.error("Instructor reminder email error", error);
        }
      }
      if (instructorChannels.includes("whatsapp") && instructor.phone) {
        try {
          await sendAutoscuolaWhatsApp({ to: instructor.phone, body });
        } catch (error) {
          console.error("Instructor reminder WhatsApp error", error);
        }
      }
      if (instructorChannels.includes("push") && instructor.userId) {
        try {
          await sendAutoscuolaPushToUsers({
            companyId: service.companyId,
            userIds: [instructor.userId],
            title: "Reminder guida",
            body,
            data: {
              kind: "appointment_reminder_instructor",
              appointmentId: appointment.id,
              startsAt: appointment.startsAt.toISOString(),
            },
          });
        } catch (error) {
          console.error("Instructor reminder push error", error);
        }
      }
    }
  }
};
