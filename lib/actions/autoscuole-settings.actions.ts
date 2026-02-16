"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isAutoscuolaStripeConnectReady } from "@/lib/autoscuole/stripe-connect";

const DEFAULT_AVAILABILITY_WEEKS = 4;
const REMINDER_MINUTES = [120, 60, 30, 20, 15] as const;
const DEFAULT_STUDENT_REMINDER_MINUTES = 60;
const DEFAULT_INSTRUCTOR_REMINDER_MINUTES = 60;
const CHANNELS = ["push", "whatsapp", "email"] as const;
const DEFAULT_SLOT_FILL_CHANNELS = ["push", "whatsapp", "email"] as const;
const DEFAULT_STUDENT_REMINDER_CHANNELS = ["push", "whatsapp", "email"] as const;
const DEFAULT_INSTRUCTOR_REMINDER_CHANNELS = ["push", "whatsapp", "email"] as const;
const PAYMENT_CUTOFF_PRESETS = [1, 2, 4, 6, 12, 24, 48] as const;
const PAYMENT_PENALTY_PRESETS = [25, 50, 75, 100] as const;
const PAYMENT_NOTIFICATION_CHANNELS = ["push", "email"] as const;
const DEFAULT_AUTO_PAYMENTS_ENABLED = false;
const DEFAULT_LESSON_PRICE_30 = 25;
const DEFAULT_LESSON_PRICE_60 = 50;
const DEFAULT_PENALTY_CUTOFF_HOURS = 24;
const DEFAULT_PENALTY_PERCENT = 50;
const DEFAULT_PAYMENT_NOTIFICATION_CHANNELS = ["push", "email"] as const;
const STRIPE_CONNECTED_ACCOUNT_ID_REGEX = /^acct_[A-Za-z0-9]+$/;

const reminderMinutesSchema = z
  .number()
  .int()
  .refine((value) => REMINDER_MINUTES.includes(value as (typeof REMINDER_MINUTES)[number]), {
    message: "Preavviso non valido.",
  });

const channelSchema = z.enum(CHANNELS);
const channelListSchema = z
  .array(channelSchema)
  .min(1, "Seleziona almeno un canale.")
  .max(CHANNELS.length)
  .transform((channels) => Array.from(new Set(channels)));
const paymentChannelSchema = z.enum(PAYMENT_NOTIFICATION_CHANNELS);
const paymentChannelListSchema = z
  .array(paymentChannelSchema)
  .min(1, "Seleziona almeno un canale.")
  .max(PAYMENT_NOTIFICATION_CHANNELS.length)
  .transform((channels) => Array.from(new Set(channels)));
const optionalNullableIdSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return value;
  },
  z.string().trim().min(1).optional().nullable(),
);

const autoscuolaSettingsPatchSchema = z
  .object({
    availabilityWeeks: z.number().int().min(1).max(12).optional(),
    studentReminderMinutes: reminderMinutesSchema.optional(),
    instructorReminderMinutes: reminderMinutesSchema.optional(),
    slotFillChannels: channelListSchema.optional(),
    studentReminderChannels: channelListSchema.optional(),
    instructorReminderChannels: channelListSchema.optional(),
    autoPaymentsEnabled: z.boolean().optional(),
    lessonPrice30: z.number().positive().max(999).optional(),
    lessonPrice60: z.number().positive().max(999).optional(),
    penaltyCutoffHoursPreset: z
      .number()
      .int()
      .refine(
        (value) =>
          PAYMENT_CUTOFF_PRESETS.includes(
            value as (typeof PAYMENT_CUTOFF_PRESETS)[number],
          ),
        {
          message: "Preset cutoff non valido.",
        },
      )
      .optional(),
    penaltyPercentPreset: z
      .number()
      .int()
      .refine(
        (value) =>
          PAYMENT_PENALTY_PRESETS.includes(
            value as (typeof PAYMENT_PENALTY_PRESETS)[number],
          ),
        {
          message: "Preset penale non valido.",
        },
      )
      .optional(),
    paymentNotificationChannels: paymentChannelListSchema.optional(),
    ficVatTypeId: optionalNullableIdSchema,
    ficPaymentMethodId: optionalNullableIdSchema,
    stripeConnectedAccountId: z.string().trim().min(1).optional().nullable(),
  })
  .refine(
    (value) =>
      value.availabilityWeeks !== undefined ||
      value.studentReminderMinutes !== undefined ||
      value.instructorReminderMinutes !== undefined ||
      value.slotFillChannels !== undefined ||
      value.studentReminderChannels !== undefined ||
      value.instructorReminderChannels !== undefined ||
      value.autoPaymentsEnabled !== undefined ||
      value.lessonPrice30 !== undefined ||
      value.lessonPrice60 !== undefined ||
      value.penaltyCutoffHoursPreset !== undefined ||
      value.penaltyPercentPreset !== undefined ||
      value.paymentNotificationChannels !== undefined ||
      value.ficVatTypeId !== undefined ||
      value.ficPaymentMethodId !== undefined ||
      value.stripeConnectedAccountId !== undefined,
    { message: "Nessuna impostazione da aggiornare." },
  )
  .superRefine((value, ctx) => {
    const stripeConnectedAccountId = (value.stripeConnectedAccountId ?? "").trim();
    if (stripeConnectedAccountId && !STRIPE_CONNECTED_ACCOUNT_ID_REGEX.test(stripeConnectedAccountId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stripeConnectedAccountId"],
        message: "Stripe Connected Account non valido (atteso formato acct_xxx).",
      });
    }
  });

const canManageSettings = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || autoscuolaRole === "OWNER";

const asChannelList = (
  value: unknown,
  fallback: readonly (typeof CHANNELS)[number][],
) => {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value.filter((item): item is (typeof CHANNELS)[number] =>
    typeof item === "string" && (CHANNELS as readonly string[]).includes(item),
  );
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : [...fallback];
};

const asPaymentChannelList = (
  value: unknown,
  fallback: readonly (typeof PAYMENT_NOTIFICATION_CHANNELS)[number][],
) => {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value.filter(
    (item): item is (typeof PAYMENT_NOTIFICATION_CHANNELS)[number] =>
      typeof item === "string" &&
      (PAYMENT_NOTIFICATION_CHANNELS as readonly string[]).includes(item),
  );
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : [...fallback];
};

const asPreset = <T extends readonly number[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
) => {
  if (typeof value !== "number") return fallback;
  const normalized = Math.trunc(value);
  return allowed.includes(normalized as T[number])
    ? (normalized as T[number])
    : fallback;
};

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
    const slotFillChannels = asChannelList(
      limits.slotFillChannels,
      DEFAULT_SLOT_FILL_CHANNELS,
    );
    const studentReminderChannels = asChannelList(
      limits.studentReminderChannels,
      DEFAULT_STUDENT_REMINDER_CHANNELS,
    );
    const instructorReminderChannels = asChannelList(
      limits.instructorReminderChannels,
      DEFAULT_INSTRUCTOR_REMINDER_CHANNELS,
    );
    const autoPaymentsEnabled =
      typeof limits.autoPaymentsEnabled === "boolean"
        ? limits.autoPaymentsEnabled
        : DEFAULT_AUTO_PAYMENTS_ENABLED;
    const lessonPrice30 =
      typeof limits.lessonPrice30 === "number"
        ? limits.lessonPrice30
        : DEFAULT_LESSON_PRICE_30;
    const lessonPrice60 =
      typeof limits.lessonPrice60 === "number"
        ? limits.lessonPrice60
        : DEFAULT_LESSON_PRICE_60;
    const penaltyCutoffHoursPreset = asPreset(
      limits.penaltyCutoffHoursPreset,
      PAYMENT_CUTOFF_PRESETS,
      DEFAULT_PENALTY_CUTOFF_HOURS,
    );
    const penaltyPercentPreset = asPreset(
      limits.penaltyPercentPreset,
      PAYMENT_PENALTY_PRESETS,
      DEFAULT_PENALTY_PERCENT,
    );
    const paymentNotificationChannels = asPaymentChannelList(
      limits.paymentNotificationChannels,
      DEFAULT_PAYMENT_NOTIFICATION_CHANNELS,
    );
    const ficVatTypeId =
      typeof limits.ficVatTypeId === "string" && limits.ficVatTypeId.trim().length
        ? limits.ficVatTypeId.trim()
        : null;
    const ficPaymentMethodId =
      typeof limits.ficPaymentMethodId === "string" &&
      limits.ficPaymentMethodId.trim().length
        ? limits.ficPaymentMethodId.trim()
        : null;
    const stripeConnectedAccountId =
      typeof limits.stripeConnectedAccountId === "string" &&
      limits.stripeConnectedAccountId.trim().length
        ? limits.stripeConnectedAccountId.trim()
        : null;

    return {
      success: true,
      data: {
        availabilityWeeks,
        studentReminderMinutes,
        instructorReminderMinutes,
        slotFillChannels,
        studentReminderChannels,
        instructorReminderChannels,
        autoPaymentsEnabled,
        lessonPrice30,
        lessonPrice60,
        penaltyCutoffHoursPreset,
        penaltyPercentPreset,
        paymentNotificationChannels,
        ficVatTypeId,
        ficPaymentMethodId,
        stripeConnectedAccountId,
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
    const previousSlotFillChannels = asChannelList(
      limits.slotFillChannels,
      DEFAULT_SLOT_FILL_CHANNELS,
    );
    const previousStudentReminderChannels = asChannelList(
      limits.studentReminderChannels,
      DEFAULT_STUDENT_REMINDER_CHANNELS,
    );
    const previousInstructorReminderChannels = asChannelList(
      limits.instructorReminderChannels,
      DEFAULT_INSTRUCTOR_REMINDER_CHANNELS,
    );
    const previousAutoPaymentsEnabled =
      typeof limits.autoPaymentsEnabled === "boolean"
        ? limits.autoPaymentsEnabled
        : DEFAULT_AUTO_PAYMENTS_ENABLED;
    const previousLessonPrice30 =
      typeof limits.lessonPrice30 === "number"
        ? limits.lessonPrice30
        : DEFAULT_LESSON_PRICE_30;
    const previousLessonPrice60 =
      typeof limits.lessonPrice60 === "number"
        ? limits.lessonPrice60
        : DEFAULT_LESSON_PRICE_60;
    const previousPenaltyCutoffHoursPreset = asPreset(
      limits.penaltyCutoffHoursPreset,
      PAYMENT_CUTOFF_PRESETS,
      DEFAULT_PENALTY_CUTOFF_HOURS,
    );
    const previousPenaltyPercentPreset = asPreset(
      limits.penaltyPercentPreset,
      PAYMENT_PENALTY_PRESETS,
      DEFAULT_PENALTY_PERCENT,
    );
    const previousPaymentNotificationChannels = asPaymentChannelList(
      limits.paymentNotificationChannels,
      DEFAULT_PAYMENT_NOTIFICATION_CHANNELS,
    );
    const previousFicVatTypeId =
      typeof limits.ficVatTypeId === "string" && limits.ficVatTypeId.trim().length
        ? limits.ficVatTypeId.trim()
        : null;
    const previousFicPaymentMethodId =
      typeof limits.ficPaymentMethodId === "string" &&
      limits.ficPaymentMethodId.trim().length
        ? limits.ficPaymentMethodId.trim()
        : null;

    const nextAutoPaymentsEnabled =
      payload.autoPaymentsEnabled ?? previousAutoPaymentsEnabled;
    const nextLessonPrice30 = payload.lessonPrice30 ?? previousLessonPrice30;
    const nextLessonPrice60 = payload.lessonPrice60 ?? previousLessonPrice60;
    const nextPenaltyCutoffHoursPreset =
      payload.penaltyCutoffHoursPreset ?? previousPenaltyCutoffHoursPreset;
    const nextPenaltyPercentPreset =
      payload.penaltyPercentPreset ?? previousPenaltyPercentPreset;
    const nextPaymentNotificationChannels =
      payload.paymentNotificationChannels ?? previousPaymentNotificationChannels;
    const nextFicVatTypeId =
      payload.ficVatTypeId !== undefined
        ? payload.ficVatTypeId
        : previousFicVatTypeId;
    const nextFicPaymentMethodId =
      payload.ficPaymentMethodId !== undefined
        ? payload.ficPaymentMethodId
        : previousFicPaymentMethodId;

    if (nextAutoPaymentsEnabled) {
      const stripe = await isAutoscuolaStripeConnectReady({
        companyId: membership.companyId,
      });
      if (!stripe.ready) {
        throw new Error(
          "Completa onboarding Stripe (termini, IBAN, P.IVA e documenti) prima di attivare i pagamenti automatici.",
        );
      }
    }

    const nextLimits = {
      ...limits,
      availabilityWeeks: payload.availabilityWeeks ?? previousAvailabilityWeeks,
      studentReminderMinutes:
        payload.studentReminderMinutes ?? previousStudentReminderMinutes,
      instructorReminderMinutes:
        payload.instructorReminderMinutes ?? previousInstructorReminderMinutes,
      slotFillChannels: payload.slotFillChannels ?? previousSlotFillChannels,
      studentReminderChannels:
        payload.studentReminderChannels ?? previousStudentReminderChannels,
      instructorReminderChannels:
        payload.instructorReminderChannels ?? previousInstructorReminderChannels,
      autoPaymentsEnabled: nextAutoPaymentsEnabled,
      lessonPrice30: nextLessonPrice30,
      lessonPrice60: nextLessonPrice60,
      penaltyCutoffHoursPreset: nextPenaltyCutoffHoursPreset,
      penaltyPercentPreset: nextPenaltyPercentPreset,
      paymentNotificationChannels: nextPaymentNotificationChannels,
      ficVatTypeId: nextFicVatTypeId,
      ficPaymentMethodId: nextFicPaymentMethodId,
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
        slotFillChannels: nextLimits.slotFillChannels,
        studentReminderChannels: nextLimits.studentReminderChannels,
        instructorReminderChannels: nextLimits.instructorReminderChannels,
        autoPaymentsEnabled: nextLimits.autoPaymentsEnabled,
        lessonPrice30: nextLimits.lessonPrice30,
        lessonPrice60: nextLimits.lessonPrice60,
        penaltyCutoffHoursPreset: nextLimits.penaltyCutoffHoursPreset,
        penaltyPercentPreset: nextLimits.penaltyPercentPreset,
        paymentNotificationChannels: nextLimits.paymentNotificationChannels,
        ficVatTypeId: nextLimits.ficVatTypeId,
        ficPaymentMethodId: nextLimits.ficPaymentMethodId,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
