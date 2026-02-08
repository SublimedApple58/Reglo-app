"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";

const DEFAULT_AVAILABILITY_WEEKS = 4;
const REMINDER_MINUTES = [120, 60, 30, 20, 15] as const;
const DEFAULT_STUDENT_REMINDER_MINUTES = 60;
const DEFAULT_INSTRUCTOR_REMINDER_MINUTES = 60;

const reminderMinutesSchema = z
  .number()
  .int()
  .refine((value) => REMINDER_MINUTES.includes(value as (typeof REMINDER_MINUTES)[number]), {
    message: "Preavviso non valido.",
  });

const autoscuolaSettingsPatchSchema = z
  .object({
    availabilityWeeks: z.number().int().min(1).max(12).optional(),
    studentReminderMinutes: reminderMinutesSchema.optional(),
    instructorReminderMinutes: reminderMinutesSchema.optional(),
  })
  .refine(
    (value) =>
      value.availabilityWeeks !== undefined ||
      value.studentReminderMinutes !== undefined ||
      value.instructorReminderMinutes !== undefined,
    { message: "Nessuna impostazione da aggiornare." },
  );

const canManageSettings = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || autoscuolaRole === "OWNER";

export async function getAutoscuolaSettings() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
    });

    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const availabilityWeeks =
      typeof limits.availabilityWeeks === "number"
        ? limits.availabilityWeeks
        : DEFAULT_AVAILABILITY_WEEKS;
    const studentReminderMinutes =
      typeof limits.studentReminderMinutes === "number"
        ? limits.studentReminderMinutes
        : DEFAULT_STUDENT_REMINDER_MINUTES;
    const instructorReminderMinutes =
      typeof limits.instructorReminderMinutes === "number"
        ? limits.instructorReminderMinutes
        : DEFAULT_INSTRUCTOR_REMINDER_MINUTES;

    return {
      success: true,
      data: {
        availabilityWeeks,
        studentReminderMinutes,
        instructorReminderMinutes,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateAutoscuolaSettings(
  input: z.infer<typeof autoscuolaSettingsPatchSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageSettings(membership.role, membership.autoscuolaRole)) {
      throw new Error("Operazione non consentita.");
    }

    const payload = autoscuolaSettingsPatchSchema.parse(input);

    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
    });

    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const previousAvailabilityWeeks =
      typeof limits.availabilityWeeks === "number"
        ? limits.availabilityWeeks
        : DEFAULT_AVAILABILITY_WEEKS;
    const previousStudentReminderMinutes =
      typeof limits.studentReminderMinutes === "number"
        ? limits.studentReminderMinutes
        : DEFAULT_STUDENT_REMINDER_MINUTES;
    const previousInstructorReminderMinutes =
      typeof limits.instructorReminderMinutes === "number"
        ? limits.instructorReminderMinutes
        : DEFAULT_INSTRUCTOR_REMINDER_MINUTES;

    const nextLimits = {
      ...limits,
      availabilityWeeks: payload.availabilityWeeks ?? previousAvailabilityWeeks,
      studentReminderMinutes:
        payload.studentReminderMinutes ?? previousStudentReminderMinutes,
      instructorReminderMinutes:
        payload.instructorReminderMinutes ?? previousInstructorReminderMinutes,
    };

    if (service) {
      await prisma.companyService.update({
        where: { id: service.id },
        data: { limits: nextLimits },
      });
    } else {
      await prisma.companyService.create({
        data: {
          companyId: membership.companyId,
          serviceKey: "AUTOSCUOLE",
          status: "ACTIVE",
          limits: nextLimits,
        },
      });
    }

    return {
      success: true,
      data: {
        availabilityWeeks: nextLimits.availabilityWeeks,
        studentReminderMinutes: nextLimits.studentReminderMinutes,
        instructorReminderMinutes: nextLimits.instructorReminderMinutes,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
