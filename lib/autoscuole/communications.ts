"use server";

import { tokenRegex } from "@/components/shared/token-input/token-utils";
import { sendDynamicEmail } from "@/email";
import { prisma as defaultPrisma } from "@/db/prisma";
import { sendAutoscuolaWhatsApp } from "@/lib/autoscuole/whatsapp";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  processAutoscuolaInvoiceFinalization as processAutoscuolaInvoiceFinalizationJob,
  processAutoscuolaLessonSettlement as processAutoscuolaLessonSettlementJob,
  processAutoscuolaPaymentRetries as processAutoscuolaPaymentRetriesJob,
  processAutoscuolaPenaltyCharges as processAutoscuolaPenaltyChargesJob,
} from "@/lib/autoscuole/payments";
import { buildAvailabilityResolver } from "@/lib/actions/autoscuole-availability.actions";
import {
  resolveEffectiveSettingsForInstructor,
  buildCompanyBookingDefaults,
} from "@/lib/autoscuole/instructor-clusters";
import {
  parseFollowCarRulesFromLimits,
  bookableLicenseKeysAtSlot,
  type FollowCarRules,
} from "@/lib/autoscuole/follow-car";

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

export async function processAutoscuolaAutoCheckin({ prisma = defaultPrisma }: { prisma?: PrismaClientLike }) {
  // Find all companies with autoCheckinEnabled
  const services = await prisma.companyService.findMany({
    where: {
      serviceKey: "AUTOSCUOLE",
      status: "ACTIVE",
    },
    select: { companyId: true, limits: true },
  });

  const now = new Date();
  let totalUpdated = 0;

  for (const svc of services) {
    const limits = (svc.limits ?? {}) as Record<string, unknown>;
    if (limits.autoCheckinEnabled !== true) continue;

    // Find scheduled/confirmed appointments where startsAt <= now
    const eligible = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: svc.companyId,
        status: { in: ["scheduled", "confirmed"] },
        startsAt: { lte: now },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    if (!eligible.length) continue;

    for (const appt of eligible) {
      const endTime = appt.endsAt ?? new Date(appt.startsAt.getTime() + 60 * 60 * 1000);
      const nextStatus = now >= endTime ? "completed" : "checked_in";

      await prisma.autoscuolaAppointment.update({
        where: { id: appt.id },
        data: { status: nextStatus },
      });
      totalUpdated++;
    }
  }

  return { updated: totalUpdated };
}

export const processAutoscuolaAutoPendingReview = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => {
  const fallbackEnd = new Date(now.getTime() - 30 * 60 * 1000);

  const result = await prisma.autoscuolaAppointment.updateMany({
    where: {
      status: { in: ["scheduled", "confirmed"] },
      OR: [
        { endsAt: { lte: now } },
        {
          endsAt: null,
          startsAt: { lte: fallbackEnd },
        },
      ],
    },
    data: { status: "pending_review" },
  });

  return { pendingReviewCount: result.count };
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
    // "Non inviare" nelle impostazioni promemoria: default true se assente.
    const instructorReminderEnabled = limits.instructorReminderEnabled !== false;

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
      instructorReminderEnabled
        ? prisma.autoscuolaAppointment.findMany({
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
          })
        : Promise.resolve([]),
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

/**
 * Morning-of-day reminder: at the configured time, send reminders for all
 * appointments of the CURRENT day (scheduled/confirmed).
 * Deduplicates via AutoscuolaMessageLog with a date-specific key.
 */
export const processAutoscuolaMorningReminders = async ({
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

  const tz = "Europe/Rome";
  const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const currentHH = String(nowInTz.getHours()).padStart(2, "0");
  const currentMM = String(nowInTz.getMinutes()).padStart(2, "0");
  const currentTime = `${currentHH}:${currentMM}`;
  const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, "0")}-${String(nowInTz.getDate()).padStart(2, "0")}`;

  const activeStatuses = ["scheduled", "confirmed"];

  for (const service of services) {
    const limits = (service.limits ?? {}) as Record<string, unknown>;
    const enabled = limits.studentReminderMorningEnabled === true;
    if (!enabled) continue;

    const reminderTime = typeof limits.studentReminderMorningTime === "string"
      ? limits.studentReminderMorningTime
      : "08:00";

    // Only fire at the configured time (within a 1-min window)
    if (currentTime !== reminderTime) continue;

    const studentChannels = parseReminderChannels(limits.studentReminderChannels);

    // Get today's appointments (in Europe/Rome timezone)
    const dayStart = new Date(`${todayStr}T00:00:00+02:00`);
    const dayEnd = new Date(`${todayStr}T23:59:59+02:00`);

    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: service.companyId,
        status: { in: activeStatuses },
        startsAt: { gte: dayStart, lt: dayEnd },
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
      },
    });

    for (const appointment of appointments) {
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
      const body = `Buongiorno! Hai una guida oggi alle ${startsAtLabel.split(" alle ")[1] ?? startsAtLabel}. Durata ${durationMinutes} minuti.`;

      if (studentChannels.includes("push") && appointment.studentId) {
        try {
          await sendAutoscuolaPushToUsers({
            companyId: service.companyId,
            userIds: [appointment.studentId],
            title: "Guida oggi",
            body,
            data: {
              kind: "morning_reminder_student",
              appointmentId: appointment.id,
              startsAt: appointment.startsAt.toISOString(),
            },
          });
        } catch (error) {
          console.error("Morning reminder push error", error);
        }
      }

      if (studentChannels.includes("whatsapp") && studentProfile.phone) {
        try {
          await sendAutoscuolaWhatsApp({ to: studentProfile.phone, body });
        } catch (error) {
          console.error("Morning reminder WhatsApp error", error);
        }
      }

      if (studentChannels.includes("email") && studentProfile.email) {
        try {
          await sendDynamicEmail({
            to: studentProfile.email,
            subject: "Reglo Autoscuole · Guida oggi",
            body,
          });
        } catch (error) {
          console.error("Morning reminder email error", error);
        }
      }
    }
  }
};

/**
 * Day-before reminder: at the configured (evening) time, send reminders for
 * all appointments of TOMORROW (scheduled/confirmed). Same fire-once model as
 * the morning reminder: the cron runs every minute and this only fires when
 * the current minute matches the configured time exactly.
 */
export const processAutoscuolaDayBeforeReminders = async ({
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

  const tz = "Europe/Rome";
  const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const currentHH = String(nowInTz.getHours()).padStart(2, "0");
  const currentMM = String(nowInTz.getMinutes()).padStart(2, "0");
  const currentTime = `${currentHH}:${currentMM}`;
  const tomorrowInTz = new Date(nowInTz);
  tomorrowInTz.setDate(tomorrowInTz.getDate() + 1);
  const tomorrowStr = `${tomorrowInTz.getFullYear()}-${String(tomorrowInTz.getMonth() + 1).padStart(2, "0")}-${String(tomorrowInTz.getDate()).padStart(2, "0")}`;

  const activeStatuses = ["scheduled", "confirmed"];

  for (const service of services) {
    const limits = (service.limits ?? {}) as Record<string, unknown>;
    const enabled = limits.studentReminderDayBeforeEnabled === true;
    if (!enabled) continue;

    const reminderTime = typeof limits.studentReminderDayBeforeTime === "string"
      ? limits.studentReminderDayBeforeTime
      : "19:00";

    // Only fire at the configured time (within a 1-min window)
    if (currentTime !== reminderTime) continue;

    const studentChannels = parseReminderChannels(limits.studentReminderChannels);

    // Get tomorrow's appointments (in Europe/Rome timezone)
    const dayStart = new Date(`${tomorrowStr}T00:00:00+02:00`);
    const dayEnd = new Date(`${tomorrowStr}T23:59:59+02:00`);

    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: service.companyId,
        status: { in: activeStatuses },
        startsAt: { gte: dayStart, lt: dayEnd },
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
      },
    });

    for (const appointment of appointments) {
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
      const timeLabel = startsAtLabel.split(" alle ")[1] ?? startsAtLabel;
      const body = `Promemoria: domani hai una guida alle ${timeLabel}. Durata ${durationMinutes} minuti.`;

      if (studentChannels.includes("push") && appointment.studentId) {
        try {
          await sendAutoscuolaPushToUsers({
            companyId: service.companyId,
            userIds: [appointment.studentId],
            title: "Guida domani",
            body,
            data: {
              kind: "day_before_reminder_student",
              appointmentId: appointment.id,
              startsAt: appointment.startsAt.toISOString(),
            },
          });
        } catch (error) {
          console.error("Day-before reminder push error", error);
        }
      }

      if (studentChannels.includes("whatsapp") && studentProfile.phone) {
        try {
          await sendAutoscuolaWhatsApp({ to: studentProfile.phone, body });
        } catch (error) {
          console.error("Day-before reminder WhatsApp error", error);
        }
      }

      if (studentChannels.includes("email") && studentProfile.email) {
        try {
          await sendDynamicEmail({
            to: studentProfile.email,
            subject: "Reglo Autoscuole · Guida domani",
            body,
          });
        } catch (error) {
          console.error("Day-before reminder email error", error);
        }
      }
    }
  }
};

export const processAutoscuolaPenaltyCharges = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => processAutoscuolaPenaltyChargesJob({ prisma, now });

export const processAutoscuolaLessonSettlement = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => processAutoscuolaLessonSettlementJob({ prisma, now });

export const processAutoscuolaPaymentRetries = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => processAutoscuolaPaymentRetriesJob({ prisma, now });

export const processAutoscuolaInvoiceFinalization = async ({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) => processAutoscuolaInvoiceFinalizationJob({ prisma, now });

// ── Empty slot notifications ─────────────────────────────

const EMPTY_SLOT_MINUTES = 30;

const emptySlotZonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

type EmptySlotDateParts = { year: number; month: number; day: number };

const emptySlotGetZonedParts = (date: Date) => {
  const parts = emptySlotZonedFormatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(readPart("year")),
    month: Number(readPart("month")),
    day: Number(readPart("day")),
    weekday: readPart("weekday"),
    hour: Number(readPart("hour")),
    minute: Number(readPart("minute")),
  };
};

const emptySlotGetOffsetMinutes = (date: Date) => {
  const parts = emptySlotGetZonedParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return (asUtc - date.getTime()) / 60000;
};

const emptySlotToTimeZoneDate = (
  parts: EmptySlotDateParts,
  hours: number,
  minutes: number,
) => {
  // Probe at noon UTC on the target date to get a stable timezone offset
  // (avoids DST ambiguity that can occur around midnight)
  const probeUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const probeZoned = emptySlotGetZonedParts(new Date(probeUtc));
  const offsetMs =
    Date.UTC(probeZoned.year, probeZoned.month - 1, probeZoned.day, probeZoned.hour, probeZoned.minute, 0) - probeUtc;
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0) - offsetMs,
  );
};

type EmptySlotTimeRange = { startMinutes: number; endMinutes: number };
type EmptySlotAvailability = { daysOfWeek: number[]; ranges: EmptySlotTimeRange[] };

const emptySlotParseRanges = (raw: unknown): EmptySlotTimeRange[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is EmptySlotTimeRange =>
      typeof e === "object" && e !== null &&
      typeof e.startMinutes === "number" && typeof e.endMinutes === "number",
  );
};

const emptySlotDefaultToRecord = (record: {
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
  startMinutes2?: number | null;
  endMinutes2?: number | null;
  ranges?: unknown;
}): EmptySlotAvailability => {
  const ranges = record.ranges ? emptySlotParseRanges(record.ranges) : [];
  if (!ranges.length) {
    ranges.push({ startMinutes: record.startMinutes, endMinutes: record.endMinutes });
    if (record.startMinutes2 != null && record.endMinutes2 != null && record.endMinutes2 > record.startMinutes2) {
      ranges.push({ startMinutes: record.startMinutes2, endMinutes: record.endMinutes2 });
    }
  }
  return { daysOfWeek: record.daysOfWeek, ranges };
};

/**
 * Check if at least 1 slot is free tomorrow for a company.
 * Replicates the core logic of getAllAvailableSlots, but short-circuits on
 * the first available slot and does not require auth context.
 */
/** Build the canonical "category|transmission" license key. */
const licenseKey = (
  licenseCategory?: string | null,
  transmission?: string | null,
) => `${licenseCategory ?? ""}|${transmission ?? ""}`;

/**
 * Scan tomorrow for bookable slots.
 * Returns `{ hasFree, vehicleKeys }`:
 *  - when `vehiclesEnabled`, `vehicleKeys` is the SET of license keys
 *    (`category|transmission`) that have at least one free instructor + free
 *    matching vehicle — so recipients can be filtered by their pursued license;
 *  - when vehicles are disabled, `vehicleKeys` is `null` (no license restriction)
 *    and `hasFree` keeps the legacy "any instructor + any vehicle free" meaning.
 */
const freeSlotLicenseKeysTomorrow = async ({
  prisma,
  companyId,
  vehiclesEnabled,
  followCarRules,
  tomorrowParts,
  tomorrowDow,
  rangeStart,
  rangeEnd,
  durationMinutes,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  vehiclesEnabled: boolean;
  followCarRules: FollowCarRules;
  tomorrowParts: EmptySlotDateParts;
  tomorrowDow: number;
  rangeStart: Date;
  rangeEnd: Date;
  durationMinutes: number;
}): Promise<{ hasFree: boolean; vehicleKeys: Set<string> | null }> => {
  const empty = { hasFree: false, vehicleKeys: vehiclesEnabled ? new Set<string>() : null };
  const durationSlots = durationMinutes / EMPTY_SLOT_MINUTES;
  if (!Number.isInteger(durationSlots) || durationSlots < 1) return empty;

  const [activeInstructors, activeVehicles] = await Promise.all([
    prisma.autoscuolaInstructor.findMany({
      where: { companyId, status: { not: "inactive" } },
      select: { id: true },
    }),
    prisma.autoscuolaVehicle.findMany({
      where: { companyId, status: { not: "inactive" } },
      select: { id: true, licenseCategory: true, transmission: true },
    }),
  ]);

  const instructorIds = activeInstructors.map((i: { id: string }) => i.id);
  const vehicleIds = activeVehicles.map((v: { id: string }) => v.id);
  const vehicleKeyById = new Map<string, string>(
    (activeVehicles as Array<{ id: string; licenseCategory: string | null; transmission: string | null }>).map(
      (v) => [v.id, licenseKey(v.licenseCategory, v.transmission)],
    ),
  );
  const vehicleCategoryById = new Map<string, string>(
    (activeVehicles as Array<{ id: string; licenseCategory: string | null }>).map(
      (v) => [v.id, v.licenseCategory ?? ""],
    ),
  );
  console.log(`[empty-slot] hasFree: instructors=${instructorIds.length}, vehicles=${vehicleIds.length}`);
  if (!instructorIds.length || !vehicleIds.length) return empty;

  // Fetch availability for instructors & vehicles
  const [instructorDefaults, vehicleDefaults, instructorOverrides, vehicleOverrides] =
    await Promise.all([
      prisma.autoscuolaWeeklyAvailability.findMany({
        where: { companyId, ownerType: "instructor", ownerId: { in: instructorIds } },
      }),
      prisma.autoscuolaWeeklyAvailability.findMany({
        where: { companyId, ownerType: "vehicle", ownerId: { in: vehicleIds } },
      }),
      prisma.autoscuolaDailyAvailabilityOverride.findMany({
        where: { companyId, ownerType: "instructor", ownerId: { in: instructorIds }, date: { gte: rangeStart, lte: rangeEnd } },
      }),
      prisma.autoscuolaDailyAvailabilityOverride.findMany({
        where: { companyId, ownerType: "vehicle", ownerId: { in: vehicleIds }, date: { gte: rangeStart, lte: rangeEnd } },
      }),
    ]);

  const dateISO = `${tomorrowParts.year}-${String(tomorrowParts.month).padStart(2, "0")}-${String(tomorrowParts.day).padStart(2, "0")}`;

  const buildResolver = (
    defaults: Array<{ ownerId: string; daysOfWeek: number[]; startMinutes: number; endMinutes: number; startMinutes2?: number | null; endMinutes2?: number | null; ranges?: unknown }>,
    overrides: Array<{ ownerId: string; date: Date; ranges: unknown }>,
  ) => {
    const overrideMap = new Map<string, EmptySlotTimeRange[]>();
    for (const o of overrides) {
      const d = new Date(o.date);
      const oDateISO = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      overrideMap.set(`${o.ownerId}:${oDateISO}`, emptySlotParseRanges(o.ranges));
    }
    const defaultMap = new Map<string, EmptySlotAvailability>();
    for (const d of defaults) {
      defaultMap.set(d.ownerId, emptySlotDefaultToRecord(d));
    }
    return (ownerId: string): EmptySlotAvailability | null => {
      const overrideRanges = overrideMap.get(`${ownerId}:${dateISO}`);
      if (overrideRanges !== undefined) {
        return { daysOfWeek: [tomorrowDow], ranges: overrideRanges };
      }
      return defaultMap.get(ownerId) ?? null;
    };
  };

  const resolveInstructor = buildResolver(
    instructorDefaults as Array<{ ownerId: string; daysOfWeek: number[]; startMinutes: number; endMinutes: number; startMinutes2?: number | null; endMinutes2?: number | null; ranges?: unknown }>,
    instructorOverrides as Array<{ ownerId: string; date: Date; ranges: unknown }>,
  );
  const resolveVehicle = buildResolver(
    vehicleDefaults as Array<{ ownerId: string; daysOfWeek: number[]; startMinutes: number; endMinutes: number; startMinutes2?: number | null; endMinutes2?: number | null; ranges?: unknown }>,
    vehicleOverrides as Array<{ ownerId: string; date: Date; ranges: unknown }>,
  );

  // Fetch appointments for tomorrow
  const appointmentScanStart = new Date(rangeStart.getTime() - 60 * 60 * 1000);
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      status: { notIn: ["cancelled"] },
      startsAt: { gte: appointmentScanStart, lt: rangeEnd },
    },
    include: { appointmentVehicles: { select: { vehicleId: true } } },
  });

  console.log(`[empty-slot] hasFree: instrDefaults=${(instructorDefaults as unknown[]).length}, vehDefaults=${(vehicleDefaults as unknown[]).length}, appointments=${appointments.length}`);

  const intervals = new Map<string, Array<{ start: number; end: number }>>();
  for (const appt of appointments as Array<{
    startsAt: Date;
    endsAt: Date | null;
    instructorId: string | null;
    vehicleId: string | null;
    appointmentVehicles: Array<{ vehicleId: string }>;
  }>) {
    const start = appt.startsAt.getTime();
    const end = appt.endsAt?.getTime() ?? start + EMPTY_SLOT_MINUTES * 60 * 1000;
    const addInterval = (ownerId: string) => {
      const list = intervals.get(ownerId) ?? [];
      list.push({ start, end });
      intervals.set(ownerId, list);
    };
    if (appt.instructorId) addInterval(appt.instructorId);
    if (appt.vehicleId) addInterval(appt.vehicleId);
    // Also reserve every vehicle on the join (primary + follow car) so a car
    // used as an auto al seguito is correctly seen as busy.
    for (const av of appt.appointmentVehicles) addInterval(av.vehicleId);
  }

  const overlaps = (
    ownerIntervals: Array<{ start: number; end: number }> | undefined,
    start: number,
    end: number,
  ) => {
    if (!ownerIntervals?.length) return false;
    return ownerIntervals.some((i) => start < i.end && end > i.start);
  };

  const isAvailable = (
    avail: EmptySlotAvailability | null,
    dow: number,
    startMin: number,
    endMin: number,
  ) => {
    if (!avail) return false;
    if (!avail.daysOfWeek.includes(dow)) return false;
    return avail.ranges.some(
      (r) => r.endMinutes > r.startMinutes && startMin >= r.startMinutes && endMin <= r.endMinutes,
    );
  };

  // Scan the day. When vehicles are enabled we accumulate the license keys of
  // every free vehicle paired with a free instructor; otherwise we early-exit on
  // the first instructor+vehicle free slot (legacy behaviour).
  const collectedKeys = new Set<string>();
  const dayLastStart = 1440 - durationMinutes;
  for (let minutes = 0; minutes <= dayLastStart; minutes += EMPTY_SLOT_MINUTES) {
    const startDate = emptySlotToTimeZoneDate(tomorrowParts, Math.floor(minutes / 60), minutes % 60);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
    const startMs = startDate.getTime();
    if (startDate < rangeStart || endDate > rangeEnd) continue;

    const candidateEndMin = minutes + durationMinutes;

    let hasInstructor = false;
    for (const id of instructorIds) {
      if (!isAvailable(resolveInstructor(id), tomorrowDow, minutes, candidateEndMin)) continue;
      if (overlaps(intervals.get(id), startMs, endDate.getTime())) continue;
      hasInstructor = true;
      break;
    }
    if (!hasInstructor) continue;

    if (!vehiclesEnabled) {
      // Legacy path: any free vehicle is enough, no license restriction.
      for (const id of vehicleIds) {
        if (!isAvailable(resolveVehicle(id), tomorrowDow, minutes, candidateEndMin)) continue;
        if (overlaps(intervals.get(id), startMs, endDate.getTime())) continue;
        console.log(`[empty-slot] hasFree: found free slot at minute=${minutes}`);
        return { hasFree: true, vehicleKeys: null };
      }
      continue;
    }

    // Vehicles enabled: record the license key of every free vehicle at this slot,
    // applying the follow-car rule via the shared helper (a moto needing an auto
    // al seguito is only bookable when a free category-B car also exists here).
    const freeVehicles: Array<{ category: string | null; licenseKey: string }> = [];
    for (const id of vehicleIds) {
      if (!isAvailable(resolveVehicle(id), tomorrowDow, minutes, candidateEndMin)) continue;
      if (overlaps(intervals.get(id), startMs, endDate.getTime())) continue;
      const licenseKey = vehicleKeyById.get(id);
      if (!licenseKey) continue;
      freeVehicles.push({ category: vehicleCategoryById.get(id) ?? null, licenseKey });
    }
    for (const key of bookableLicenseKeysAtSlot({ freeVehicles, followCarRules })) {
      collectedKeys.add(key);
    }
  }

  if (vehiclesEnabled) {
    console.log(`[empty-slot] hasFree: license keys with free slots = ${collectedKeys.size}`);
    return { hasFree: collectedKeys.size > 0, vehicleKeys: collectedKeys };
  }
  console.log(`[empty-slot] hasFree: no free slots found after scanning all minutes`);
  return { hasFree: false, vehicleKeys: null };
};

export const processEmptySlotNotifications = async ({
  prisma = defaultPrisma,
  companyId: filterCompanyId,
}: {
  prisma?: PrismaClientLike;
  companyId?: string;
}) => {
  const now = new Date();
  const zonedNow = emptySlotGetZonedParts(now);
  const currentTimeHHMM = `${String(zonedNow.hour).padStart(2, "0")}:${String(zonedNow.minute).padStart(2, "0")}`;
  const tomorrowParts: EmptySlotDateParts = (() => {
    const d = new Date(Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day));
    d.setUTCDate(d.getUTCDate() + 1);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  })();
  const tomorrowDateStr = `${tomorrowParts.year}-${String(tomorrowParts.month).padStart(2, "0")}-${String(tomorrowParts.day).padStart(2, "0")}`;
  const tomorrowDow = new Date(Date.UTC(tomorrowParts.year, tomorrowParts.month - 1, tomorrowParts.day)).getUTCDay();
  const rangeStart = emptySlotToTimeZoneDate(tomorrowParts, 0, 0);
  const nextDayParts: EmptySlotDateParts = (() => {
    const d = new Date(Date.UTC(tomorrowParts.year, tomorrowParts.month - 1, tomorrowParts.day));
    d.setUTCDate(d.getUTCDate() + 1);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  })();
  const rangeEnd = emptySlotToTimeZoneDate(nextDayParts, 0, 0);

  // Find all active autoscuole with the feature enabled
  const services = await prisma.companyService.findMany({
    where: {
      serviceKey: "AUTOSCUOLE",
      status: "ACTIVE",
      ...(filterCompanyId ? { companyId: filterCompanyId } : {}),
    },
  });

  let totalNotified = 0;

  for (const service of services) {

    const limits = (service.limits ?? {}) as Record<string, unknown>;
    const companyId = service.companyId;
    const companyDefaults = buildCompanyBookingDefaults(limits);

    // Per-cluster cascade: the empty-slot settings (enabled / times / target)
    // and governance (appBookingActors, manual_full) come from each student's
    // assigned autonomous instructor when set, otherwise from the company.
    // Eligibility is therefore evaluated per student, not gated on the company
    // defaults — so a cluster that enables the feature while the company has it
    // off is honoured, and vice versa.
    const studentMembers = await prisma.companyMember.findMany({
      where: { companyId, autoscuolaRole: "STUDENT" },
      select: { userId: true, assignedInstructorId: true, licenseCategory: true, transmission: true },
    });
    if (!studentMembers.length) continue;
    const vehiclesEnabled = limits.vehiclesEnabled !== false;

    // Resolve effective settings once per distinct cluster (assigned instructor).
    const distinctInstructorIds = Array.from(
      new Set(
        studentMembers
          .map((m: { assignedInstructorId: string | null }) => m.assignedInstructorId)
          .filter((id: string | null): id is string => !!id),
      ),
    );
    const clusterSettingsById = new Map<
      string,
      Awaited<ReturnType<typeof resolveEffectiveSettingsForInstructor>>
    >();
    await Promise.all(
      distinctInstructorIds.map(async (instructorId) => {
        clusterSettingsById.set(
          instructorId,
          await resolveEffectiveSettingsForInstructor(companyId, instructorId, companyDefaults),
        );
      }),
    );
    const effectiveFor = (assignedInstructorId: string | null) =>
      (assignedInstructorId ? clusterSettingsById.get(assignedInstructorId) : undefined) ??
      companyDefaults;

    // Keep students whose effective settings enable the notification at this
    // tick and allow students to book, excluding manual_full clusters.
    const candidates: {
      userId: string;
      target: "all" | "availability_matching";
      licenseCategory: string | null;
      transmission: string | null;
    }[] = [];
    for (const m of studentMembers) {
      const eff = effectiveFor(m.assignedInstructorId);
      if (!eff.emptySlotNotificationEnabled) continue;
      // Cron invocation (no companyId filter): only at the cluster's configured times.
      if (!filterCompanyId && !eff.emptySlotNotificationTimes.includes(currentTimeHHMM)) continue;
      if (eff.appBookingActors !== "students" && eff.appBookingActors !== "both") continue;
      if (eff.instructorBookingMode === "manual_full") continue;
      candidates.push({
        userId: m.userId,
        target: eff.emptySlotNotificationTarget,
        licenseCategory: m.licenseCategory,
        transmission: m.transmission,
      });
    }
    if (!candidates.length) continue;

    // Quick-check: which license paths have a free slot tomorrow? (company-wide)
    const checkDuration = companyDefaults.bookingSlotDurations[0] ?? 60;
    const { hasFree, vehicleKeys } = await freeSlotLicenseKeysTomorrow({
      prisma,
      companyId,
      vehiclesEnabled,
      followCarRules: parseFollowCarRulesFromLimits(limits),
      tomorrowParts,
      tomorrowDow,
      rangeStart,
      rangeEnd,
      durationMinutes: checkDuration,
    });
    console.log(`[empty-slot] Company ${companyId}: candidates=${candidates.length}, hasFree=${hasFree}`);
    if (!hasFree) continue;

    // License gate (Vehicles module): drop candidates whose pursued license has
    // no free matching vehicle tomorrow — they'd be notified for nothing.
    // `vehicleKeys === null` means no restriction (module off). A student with an
    // incomplete license (null parts) is kept (permissive).
    const eligibleCandidates =
      vehicleKeys === null
        ? candidates
        : candidates.filter((c) => {
            if (!c.licenseCategory || !c.transmission) return true;
            return vehicleKeys.has(licenseKey(c.licenseCategory, c.transmission));
          });
    if (!eligibleCandidates.length) continue;

    // Apply per-student target: "availability_matching" requires the student to
    // be available tomorrow; "all" is included unconditionally.
    const matchingIds = eligibleCandidates.filter((c) => c.target === "availability_matching").map((c) => c.userId);
    let targetUserIds: string[] = eligibleCandidates.filter((c) => c.target === "all").map((c) => c.userId);
    if (matchingIds.length) {
      const studentAvailabilities = await prisma.autoscuolaWeeklyAvailability.findMany({
        where: { companyId, ownerType: "student", ownerId: { in: matchingIds } },
      });
      const availableTomorrow = new Set<string>();
      for (const avail of studentAvailabilities) {
        const record = emptySlotDefaultToRecord(avail as { daysOfWeek: number[]; startMinutes: number; endMinutes: number; startMinutes2?: number | null; endMinutes2?: number | null; ranges?: unknown });
        if (record.daysOfWeek.includes(tomorrowDow)) availableTomorrow.add(avail.ownerId);
      }
      targetUserIds = [...targetUserIds, ...matchingIds.filter((id) => availableTomorrow.has(id))];
    }

    if (!targetUserIds.length) continue;

    // Exclude students who already have an appointment tomorrow
    const existingAppointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        studentId: { in: targetUserIds },
        status: { notIn: ["cancelled"] },
        startsAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: { studentId: true },
    });
    const bookedStudentIds = new Set(existingAppointments.map((a: { studentId: string }) => a.studentId));
    targetUserIds = targetUserIds.filter((id) => !bookedStudentIds.has(id));

    if (!targetUserIds.length) continue;

    // Exclude students without push tokens
    const devicesWithToken = await prisma.mobilePushDevice.findMany({
      where: { userId: { in: targetUserIds }, disabledAt: null },
      select: { userId: true },
    });
    const usersWithToken = new Set(devicesWithToken.map((d: { userId: string }) => d.userId));
    targetUserIds = targetUserIds.filter((id) => usersWithToken.has(id));

    if (!targetUserIds.length) continue;

    // Send push notifications
    try {
      await sendAutoscuolaPushToUsers({
        prisma,
        companyId,
        userIds: targetUserIds,
        title: "Guide disponibili domani!",
        body: "Ci sono posti liberi per domani. Apri Reglo per prenotare.",
        data: {
          kind: "available_slots",
          date: tomorrowDateStr,
        },
      });
      totalNotified += targetUserIds.length;
    } catch (error) {
      console.error(`Empty slot notification push error for company ${companyId}`, error);
    }
  }

  return { notified: totalNotified };
};
