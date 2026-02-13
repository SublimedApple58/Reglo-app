import { Prisma } from "@prisma/client";
import Stripe from "stripe";

import { prisma as defaultPrisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { decryptSecret } from "@/lib/integrations/secrets";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import { getAutoscuolaStripeDestinationAccountId } from "@/lib/autoscuole/stripe-connect";

type PrismaClientLike = typeof defaultPrisma | Prisma.TransactionClient;

export const AUTOSCUOLA_PAYMENT_CUTOFF_PRESETS = [1, 2, 4, 6, 12, 24, 48] as const;
export const AUTOSCUOLA_PAYMENT_PENALTY_PRESETS = [25, 50, 75, 100] as const;
const DEFAULT_PAYMENT_CHANNELS = ["push", "email"] as const;

const MAX_PAYMENT_ATTEMPTS = 3;
const PAYMENT_RETRY_DELAYS_MINUTES = [4 * 60, 8 * 60];

const AUTOSCUOLA_TIMEZONE = "Europe/Rome";
const STRIPE_EPHEMERAL_API_VERSION = "2024-06-20";

type PaymentChannel = "push" | "email";

type AutoscuolaPaymentConfig = {
  enabled: boolean;
  lessonPrice30: number;
  lessonPrice60: number;
  penaltyCutoffHours: (typeof AUTOSCUOLA_PAYMENT_CUTOFF_PRESETS)[number];
  penaltyPercent: (typeof AUTOSCUOLA_PAYMENT_PENALTY_PRESETS)[number];
  channels: PaymentChannel[];
  ficVatTypeId: string | null;
  ficPaymentMethodId: string | null;
};

type AppointmentPricingSnapshot = {
  paymentRequired: boolean;
  paymentStatus: string;
  priceAmount: Prisma.Decimal;
  penaltyAmount: Prisma.Decimal;
  penaltyCutoffAt: Date | null;
  paidAmount: Prisma.Decimal;
  invoiceStatus: string | null;
};

let stripeSingleton: Stripe | null = null;

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY mancante.");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
};

const toNumber = (value: Prisma.Decimal | number | string | null | undefined) => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toCents = (value: Prisma.Decimal | number | string | null | undefined) =>
  Math.max(0, Math.round(toNumber(value) * 100));

const toDecimal = (value: number) => new Prisma.Decimal(roundAmount(value).toFixed(2));

const normalizeStatus = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const normalizeChannels = (value: unknown): PaymentChannel[] => {
  if (!Array.isArray(value)) return [...DEFAULT_PAYMENT_CHANNELS];
  const channels = value.filter(
    (item): item is PaymentChannel => item === "push" || item === "email",
  );
  const unique = Array.from(new Set(channels));
  return unique.length ? unique : [...DEFAULT_PAYMENT_CHANNELS];
};

const normalizeCutoffPreset = (value: unknown) => {
  if (typeof value !== "number") return 24;
  const intValue = Math.trunc(value);
  return AUTOSCUOLA_PAYMENT_CUTOFF_PRESETS.includes(
    intValue as (typeof AUTOSCUOLA_PAYMENT_CUTOFF_PRESETS)[number],
  )
    ? (intValue as (typeof AUTOSCUOLA_PAYMENT_CUTOFF_PRESETS)[number])
    : 24;
};

const normalizePenaltyPreset = (value: unknown) => {
  if (typeof value !== "number") return 50;
  const intValue = Math.trunc(value);
  return AUTOSCUOLA_PAYMENT_PENALTY_PRESETS.includes(
    intValue as (typeof AUTOSCUOLA_PAYMENT_PENALTY_PRESETS)[number],
  )
    ? (intValue as (typeof AUTOSCUOLA_PAYMENT_PENALTY_PRESETS)[number])
    : 50;
};

const normalizePrice = (value: unknown, fallback: number) => {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return roundAmount(value);
};

const asStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getAppointmentEnd = (appointment: {
  startsAt: Date;
  endsAt: Date | null;
}) => appointment.endsAt ?? new Date(appointment.startsAt.getTime() + 30 * 60 * 1000);

const computeDurationMinutes = (startsAt: Date, endsAt: Date | null) => {
  const end = endsAt ?? new Date(startsAt.getTime() + 30 * 60 * 1000);
  const minutes = Math.max(30, Math.round((end.getTime() - startsAt.getTime()) / 60000));
  return minutes >= 45 ? 60 : 30;
};

const getTodayIsoDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const getAttemptBackoffDate = (attemptCount: number, from = new Date()) => {
  if (attemptCount >= MAX_PAYMENT_ATTEMPTS) return null;
  const delayMinutes = PAYMENT_RETRY_DELAYS_MINUTES[Math.max(0, attemptCount - 1)] ?? 8 * 60;
  return new Date(from.getTime() + delayMinutes * 60 * 1000);
};

const isCancelledBeforeCutoff = (appointment: {
  status: string;
  penaltyCutoffAt: Date | null;
  cancelledAt: Date | null;
}) => {
  if (normalizeStatus(appointment.status) !== "cancelled") return false;
  if (!appointment.penaltyCutoffAt || !appointment.cancelledAt) return false;
  return appointment.cancelledAt.getTime() < appointment.penaltyCutoffAt.getTime();
};

const computeFinalAmountCents = (appointment: {
  status: string;
  priceAmount: Prisma.Decimal | number | string;
  penaltyAmount: Prisma.Decimal | number | string;
  penaltyCutoffAt: Date | null;
  cancelledAt: Date | null;
}) => {
  const status = normalizeStatus(appointment.status);
  if (status === "cancelled") {
    if (isCancelledBeforeCutoff(appointment)) {
      return 0;
    }
    return toCents(appointment.penaltyAmount);
  }
  if (status === "no_show") {
    return toCents(appointment.penaltyAmount);
  }
  return toCents(appointment.priceAmount);
};

const resolveAppointmentPaymentStatus = (
  appointment: {
    paymentRequired: boolean;
    status: string;
    priceAmount: Prisma.Decimal | number | string;
    penaltyAmount: Prisma.Decimal | number | string;
    paidAmount: Prisma.Decimal | number | string;
    penaltyCutoffAt: Date | null;
    cancelledAt: Date | null;
  },
  explicitFinalAmountCents?: number,
) => {
  if (!appointment.paymentRequired) return "not_required";

  const paid = toCents(appointment.paidAmount);
  const finalAmount =
    explicitFinalAmountCents ??
    computeFinalAmountCents({
      status: appointment.status,
      priceAmount: appointment.priceAmount,
      penaltyAmount: appointment.penaltyAmount,
      penaltyCutoffAt: appointment.penaltyCutoffAt,
      cancelledAt: appointment.cancelledAt,
    });

  if (finalAmount === 0) return "waived";
  if (paid >= finalAmount) return "paid";
  if (paid > 0) return "partial_paid";
  return "pending_penalty";
};

const sendPaymentNotification = async ({
  prisma,
  companyId,
  studentId,
  channels,
  title,
  body,
  kind,
  appointmentId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  studentId: string;
  channels: PaymentChannel[];
  title: string;
  body: string;
  kind: string;
  appointmentId?: string;
}) => {
  const member = await prisma.companyMember.findFirst({
    where: {
      companyId,
      userId: studentId,
      autoscuolaRole: "STUDENT",
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!member) return;

  if (channels.includes("email") && member.user.email) {
    try {
      await sendDynamicEmail({
        to: member.user.email,
        subject: title,
        body,
      });
    } catch (error) {
      console.error("Autoscuola payment email error", error);
    }
  }

  if (channels.includes("push")) {
    try {
      const payloadData: Record<string, string> = { kind };
      if (appointmentId) {
        payloadData.appointmentId = appointmentId;
      }
      await sendAutoscuolaPushToUsers({
        companyId,
        userIds: [studentId],
        title,
        body,
        data: payloadData,
      });
    } catch (error) {
      console.error("Autoscuola payment push error", error);
    }
  }
};

const getFicConnection = async ({
  prisma,
  companyId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
}) => {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: "FATTURE_IN_CLOUD",
      },
    },
  });

  if (
    !connection?.accessTokenCiphertext ||
    !connection.accessTokenIv ||
    !connection.accessTokenTag
  ) {
    throw new Error("Fatture in Cloud non connesso.");
  }

  const metadata =
    connection.metadata && typeof connection.metadata === "object"
      ? (connection.metadata as Record<string, unknown>)
      : {};

  const entityId = asStringOrNull(metadata.entityId);
  if (!entityId) {
    throw new Error("Seleziona l'azienda FIC in Settings.");
  }

  const token = decryptSecret({
    ciphertext: connection.accessTokenCiphertext,
    iv: connection.accessTokenIv,
    tag: connection.accessTokenTag,
  });

  return {
    token,
    entityId,
  };
};

const ficFetch = async (
  path: string,
  token: string,
  init?: RequestInit,
) => {
  const response = await fetch(`https://api-v2.fattureincloud.it${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const rawText = await response.text();
  let json: unknown = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message =
      (json as { error?: { message?: string } } | null)?.error?.message ||
      rawText ||
      "Errore Fatture in Cloud";
    throw new Error(message);
  }

  return json;
};

const resolveFicClientId = async ({
  prisma,
  companyId,
  studentId,
  studentName,
  studentEmail,
  token,
  entityId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  token: string;
  entityId: string;
}) => {
  const profile = await prisma.autoscuolaStudentPaymentProfile.findUnique({
    where: {
      companyId_studentId: {
        companyId,
        studentId,
      },
    },
  });

  if (profile?.ficClientId) {
    try {
      await ficFetch(`/c/${entityId}/entities/clients/${profile.ficClientId}`, token, {
        method: "GET",
      });
      return profile.ficClientId;
    } catch {
      // Continue with lookup/create.
    }
  }

  const clientsPayload = await ficFetch(`/c/${entityId}/entities/clients`, token, {
    method: "GET",
  });
  const clients = Array.isArray(clientsPayload)
    ? clientsPayload
    : ((clientsPayload as { data?: Array<Record<string, unknown>> } | null)?.data ?? []);

  const emailLower = studentEmail.trim().toLowerCase();
  const byEmail = clients.find((client) => {
    const value =
      typeof client.email === "string"
        ? client.email
        : typeof client.mail === "string"
          ? client.mail
          : "";
    return value.trim().toLowerCase() === emailLower;
  });

  let clientId = byEmail?.id != null ? String(byEmail.id) : null;

  if (!clientId) {
    const created = await ficFetch(`/c/${entityId}/entities/clients`, token, {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: studentName,
          email: studentEmail,
        },
      }),
    });

    const candidate =
      (created as { data?: { id?: string | number }; id?: string | number } | null)?.data?.id ??
      (created as { id?: string | number } | null)?.id;

    if (candidate == null) {
      throw new Error("Impossibile creare cliente FIC.");
    }
    clientId = String(candidate);
  }

  if (profile) {
    await prisma.autoscuolaStudentPaymentProfile.update({
      where: { id: profile.id },
      data: { ficClientId: clientId },
    });
  }

  return clientId;
};

export async function getAutoscuolaPaymentConfig({
  prisma = defaultPrisma,
  companyId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
}): Promise<AutoscuolaPaymentConfig> {
  const service = await prisma.companyService.findFirst({
    where: {
      companyId,
      serviceKey: "AUTOSCUOLE",
    },
    select: { limits: true },
  });

  const limits = (service?.limits ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(limits.autoPaymentsEnabled),
    lessonPrice30: normalizePrice(limits.lessonPrice30, 25),
    lessonPrice60: normalizePrice(limits.lessonPrice60, 50),
    penaltyCutoffHours: normalizeCutoffPreset(limits.penaltyCutoffHoursPreset),
    penaltyPercent: normalizePenaltyPreset(limits.penaltyPercentPreset),
    channels: normalizeChannels(limits.paymentNotificationChannels),
    ficVatTypeId: asStringOrNull(limits.ficVatTypeId),
    ficPaymentMethodId: asStringOrNull(limits.ficPaymentMethodId),
  };
}

export async function getOrCreateStudentPaymentProfile({
  prisma = defaultPrisma,
  companyId,
  studentId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
}) {
  const existing = await prisma.autoscuolaStudentPaymentProfile.findUnique({
    where: {
      companyId_studentId: {
        companyId,
        studentId,
      },
    },
  });
  if (existing) return existing;

  const member = await prisma.companyMember.findFirst({
    where: {
      companyId,
      userId: studentId,
      autoscuolaRole: "STUDENT",
    },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  if (!member) {
    throw new Error("Allievo non valido per questa autoscuola.");
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: member.user.email,
    name: member.user.name ?? member.user.email,
    metadata: {
      companyId,
      studentId,
    },
  });

  return prisma.autoscuolaStudentPaymentProfile.create({
    data: {
      companyId,
      studentId,
      stripeCustomerId: customer.id,
      status: "requires_update",
    },
  });
}

const resolveStudentPaymentMethod = async ({
  prisma,
  profile,
}: {
  prisma: PrismaClientLike;
  profile: {
    id: string;
    stripeCustomerId: string;
    stripeDefaultPaymentMethodId: string | null;
    status: string;
  };
}) => {
  const stripe = getStripe();

  let paymentMethodId = profile.stripeDefaultPaymentMethodId;
  if (!paymentMethodId) {
    const customer = await stripe.customers.retrieve(profile.stripeCustomerId);
    if (!customer || customer.deleted) {
      throw new Error("Customer Stripe non disponibile.");
    }

    const defaultMethod =
      typeof customer.invoice_settings.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings.default_payment_method?.id;

    if (defaultMethod) {
      paymentMethodId = defaultMethod;
    } else {
      const methods = await stripe.paymentMethods.list({
        customer: profile.stripeCustomerId,
        type: "card",
        limit: 1,
      });
      paymentMethodId = methods.data[0]?.id ?? null;
    }

    if (paymentMethodId) {
      await prisma.autoscuolaStudentPaymentProfile.update({
        where: { id: profile.id },
        data: {
          stripeDefaultPaymentMethodId: paymentMethodId,
          status: "active",
        },
      });
    }
  }

  return paymentMethodId;
};

export async function prepareAppointmentPaymentSnapshot({
  prisma = defaultPrisma,
  companyId,
  studentId,
  startsAt,
  endsAt,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
  startsAt: Date;
  endsAt: Date | null;
}): Promise<AppointmentPricingSnapshot> {
  const config = await getAutoscuolaPaymentConfig({ prisma, companyId });
  if (!config.enabled) {
    return {
      paymentRequired: false,
      paymentStatus: "not_required",
      priceAmount: toDecimal(0),
      penaltyAmount: toDecimal(0),
      penaltyCutoffAt: null,
      paidAmount: toDecimal(0),
      invoiceStatus: null,
    };
  }
  await getAutoscuolaStripeDestinationAccountId({ prisma, companyId });

  const insoluti = await prisma.autoscuolaAppointment.count({
    where: {
      companyId,
      studentId,
      paymentRequired: true,
      paymentStatus: "insoluto",
    },
  });

  if (insoluti > 0) {
    throw new Error("Hai pagamenti insoluti. Salda prima di prenotare una nuova guida.");
  }

  const profile = await getOrCreateStudentPaymentProfile({ prisma, companyId, studentId });
  const paymentMethodId = await resolveStudentPaymentMethod({
    prisma,
    profile: {
      id: profile.id,
      stripeCustomerId: profile.stripeCustomerId,
      stripeDefaultPaymentMethodId: profile.stripeDefaultPaymentMethodId,
      status: profile.status,
    },
  });

  if (!paymentMethodId) {
    await sendPaymentNotification({
      prisma,
      companyId,
      studentId,
      channels: config.channels,
      title: "Reglo Autoscuole · Metodo di pagamento richiesto",
      body: "Per prenotare una guida aggiungi un metodo di pagamento nelle impostazioni dell'app.",
      kind: "payment_method_required",
    });
    throw new Error(
      "Metodo di pagamento mancante. Aggiungi un metodo in Impostazioni per prenotare.",
    );
  }

  const duration = computeDurationMinutes(startsAt, endsAt);
  const lessonPrice = duration >= 60 ? config.lessonPrice60 : config.lessonPrice30;
  const penaltyAmount = roundAmount((lessonPrice * config.penaltyPercent) / 100);
  const penaltyCutoffAt = new Date(startsAt.getTime() - config.penaltyCutoffHours * 60 * 60 * 1000);

  return {
    paymentRequired: true,
    paymentStatus: "pending_penalty",
    priceAmount: toDecimal(lessonPrice),
    penaltyAmount: toDecimal(penaltyAmount),
    penaltyCutoffAt,
    paidAmount: toDecimal(0),
    invoiceStatus: "pending",
  };
}

const settleAppointmentPaymentStatus = async ({
  prisma,
  appointmentId,
  explicitFinalAmountCents,
}: {
  prisma: PrismaClientLike;
  appointmentId: string;
  explicitFinalAmountCents?: number;
}) => {
  const appointment = await prisma.autoscuolaAppointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      paymentRequired: true,
      status: true,
      priceAmount: true,
      penaltyAmount: true,
      penaltyCutoffAt: true,
      cancelledAt: true,
      paidAmount: true,
      paymentStatus: true,
    },
  });

  if (!appointment) return;

  const nextStatus = resolveAppointmentPaymentStatus(
    appointment,
    explicitFinalAmountCents,
  );

  if (nextStatus !== appointment.paymentStatus) {
    await prisma.autoscuolaAppointment.update({
      where: { id: appointment.id },
      data: { paymentStatus: nextStatus },
    });
  }
};

const markAppointmentInsoluto = async ({
  prisma,
  appointmentId,
}: {
  prisma: PrismaClientLike;
  appointmentId: string;
}) => {
  await prisma.autoscuolaAppointment.update({
    where: { id: appointmentId },
    data: { paymentStatus: "insoluto" },
  });
};

const attemptAutomaticPaymentRecord = async ({
  prisma,
  paymentId,
}: {
  prisma: PrismaClientLike;
  paymentId: string;
}) => {
  const payment = await prisma.autoscuolaAppointmentPayment.findUnique({
    where: { id: paymentId },
    include: {
      appointment: {
        select: {
          id: true,
          companyId: true,
          studentId: true,
          status: true,
          priceAmount: true,
          penaltyAmount: true,
          paidAmount: true,
          paymentRequired: true,
          penaltyCutoffAt: true,
          cancelledAt: true,
        },
      },
      profile: {
        select: {
          id: true,
          stripeCustomerId: true,
          stripeDefaultPaymentMethodId: true,
          status: true,
        },
      },
    },
  });

  if (!payment || !payment.appointment) return { success: false, message: "Pagamento non trovato." };
  if (payment.status === "succeeded") return { success: true, message: "Gia pagato." };
  if (payment.status === "abandoned") return { success: false, message: "Pagamento abbandonato." };

  const profile =
    payment.profile ??
    (await getOrCreateStudentPaymentProfile({
      prisma,
      companyId: payment.companyId,
      studentId: payment.studentId,
    }));
  const config = await getAutoscuolaPaymentConfig({
    prisma,
    companyId: payment.companyId,
  });
  const destinationAccountId = await getAutoscuolaStripeDestinationAccountId({
    prisma,
    companyId: payment.companyId,
  });

  const paymentMethodId = await resolveStudentPaymentMethod({
    prisma,
    profile: {
      id: profile.id,
      stripeCustomerId: profile.stripeCustomerId,
      stripeDefaultPaymentMethodId: profile.stripeDefaultPaymentMethodId,
      status: profile.status,
    },
  });

  if (!paymentMethodId) {
    await prisma.autoscuolaAppointmentPayment.update({
      where: { id: payment.id },
      data: {
        status: "abandoned",
        attemptCount: MAX_PAYMENT_ATTEMPTS,
        nextAttemptAt: null,
        failureCode: "payment_method_missing",
        failureMessage: "Metodo di pagamento non disponibile.",
      },
    });
    await markAppointmentInsoluto({ prisma, appointmentId: payment.appointment.id });
    return { success: false, message: "Metodo di pagamento mancante." };
  }

  const stripe = getStripe();
  const attemptNumber = payment.attemptCount + 1;

  await prisma.autoscuolaAppointmentPayment.update({
    where: { id: payment.id },
    data: {
      status: "processing",
      profileId: profile.id,
    },
  });

  try {
    const amountCents = toCents(payment.amount);
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: payment.currency.toLowerCase(),
        customer: profile.stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        on_behalf_of: destinationAccountId,
        transfer_data: {
          destination: destinationAccountId,
        },
        metadata: {
          kind: "autoscuola_appointment_payment",
          appointmentId: payment.appointment.id,
          appointmentPaymentId: payment.id,
          companyId: payment.companyId,
          studentId: payment.studentId,
          phase: payment.phase,
        },
      },
      {
        idempotencyKey: `autoscuola:${payment.appointment.id}:${payment.phase}:${attemptNumber}`,
      },
    );

    const chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id ?? null;

    await prisma.autoscuolaAppointmentPayment.update({
      where: { id: payment.id },
      data: {
        status: "succeeded",
        attemptCount: attemptNumber,
        paidAt: new Date(),
        nextAttemptAt: null,
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: chargeId,
        failureCode: null,
        failureMessage: null,
      },
    });

    await prisma.autoscuolaAppointment.update({
      where: { id: payment.appointment.id },
      data: {
        paidAmount: {
          increment: payment.amount,
        },
      },
    });

    await settleAppointmentPaymentStatus({
      prisma,
      appointmentId: payment.appointment.id,
    });

    await sendPaymentNotification({
      prisma,
      companyId: payment.companyId,
      studentId: payment.studentId,
      channels: config.channels,
      title: "Reglo Autoscuole · Pagamento riuscito",
      body: `Pagamento ${payment.phase} registrato con successo.`,
      kind: "appointment_payment_succeeded",
      appointmentId: payment.appointment.id,
    });

    return { success: true, paymentIntentId: paymentIntent.id };
  } catch (error) {
    const stripeError = error as Stripe.errors.StripeError;
    const code =
      stripeError.code ??
      (error instanceof Error ? "autoscuola_connect_not_configured" : "payment_failed");
    const message =
      stripeError.message ??
      (error instanceof Error ? error.message : "Addebito non riuscito.");
    const nextAttemptAt = getAttemptBackoffDate(attemptNumber);
    const exhausted = attemptNumber >= MAX_PAYMENT_ATTEMPTS;

    await prisma.autoscuolaAppointmentPayment.update({
      where: { id: payment.id },
      data: {
        status: exhausted ? "abandoned" : "failed",
        attemptCount: attemptNumber,
        nextAttemptAt,
        failureCode: code,
        failureMessage: message,
      },
    });

    if (exhausted) {
      await markAppointmentInsoluto({
        prisma,
        appointmentId: payment.appointment.id,
      });
    }

    await sendPaymentNotification({
      prisma,
      companyId: payment.companyId,
      studentId: payment.studentId,
      channels: config.channels,
      title: exhausted
        ? "Reglo Autoscuole · Pagamento insoluto"
        : "Reglo Autoscuole · Pagamento da riprovare",
      body: exhausted
        ? "Impossibile completare l'addebito automatico. Salda dall'app per continuare a prenotare."
        : "Addebito automatico non riuscito. Riproveremo automaticamente.",
      kind: exhausted ? "appointment_payment_failed_blocking" : "appointment_payment_retry",
      appointmentId: payment.appointment.id,
    });

    return { success: false, message };
  }
};

const queueAndAttemptPhasePayment = async ({
  prisma,
  appointment,
  phase,
  amountCents,
}: {
  prisma: PrismaClientLike;
  appointment: {
    id: string;
    companyId: string;
    studentId: string;
    paymentRequired: boolean;
  };
  phase: "penalty" | "settlement";
  amountCents: number;
}) => {
  if (amountCents <= 0 || !appointment.paymentRequired) {
    return { success: true, skipped: true };
  }

  const amount = toDecimal(amountCents / 100);

  const existing = await prisma.autoscuolaAppointmentPayment.findFirst({
    where: {
      appointmentId: appointment.id,
      phase,
      status: {
        in: ["pending", "processing", "failed", "succeeded"],
      },
      amount,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing?.status === "succeeded") {
    return { success: true, skipped: true };
  }

  const payment =
    existing ??
    (await prisma.autoscuolaAppointmentPayment.create({
      data: {
        appointmentId: appointment.id,
        companyId: appointment.companyId,
        studentId: appointment.studentId,
        phase,
        amount,
        currency: "EUR",
        status: "pending",
      },
    }));

  return attemptAutomaticPaymentRecord({ prisma, paymentId: payment.id });
};

const isFinalizable = (
  appointment: {
    status: string;
    startsAt: Date;
    endsAt: Date | null;
  },
  now: Date,
) => {
  const status = normalizeStatus(appointment.status);
  if (status === "no_show" || status === "cancelled") return true;
  const end = getAppointmentEnd(appointment);
  return end.getTime() <= now.getTime();
};

export async function processAutoscuolaPenaltyCharges({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) {
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      paymentRequired: true,
      penaltyCutoffAt: { lte: now },
      paymentStatus: { in: ["pending_penalty", "partial_paid"] },
      status: {
        in: ["scheduled", "confirmed", "checked_in", "no_show", "cancelled"],
      },
    },
    select: {
      id: true,
      companyId: true,
      studentId: true,
      paymentRequired: true,
      status: true,
      penaltyAmount: true,
      paidAmount: true,
      penaltyCutoffAt: true,
      cancelledAt: true,
    },
  });

  let attempted = 0;
  for (const appointment of appointments) {
    if (isCancelledBeforeCutoff(appointment)) {
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          paymentStatus: "waived",
          invoiceStatus: "not_required",
        },
      });
      continue;
    }

    const penaltyDue = Math.max(0, toCents(appointment.penaltyAmount) - toCents(appointment.paidAmount));
    if (!penaltyDue) {
      continue;
    }

    await queueAndAttemptPhasePayment({
      prisma,
      appointment,
      phase: "penalty",
      amountCents: penaltyDue,
    });
    attempted += 1;
  }

  return { attempted };
}

export async function processAutoscuolaLessonSettlement({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) {
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      paymentRequired: true,
      paymentStatus: {
        in: ["pending_penalty", "partial_paid", "insoluto"],
      },
      status: {
        in: ["scheduled", "confirmed", "checked_in", "completed", "no_show", "cancelled"],
      },
    },
    select: {
      id: true,
      companyId: true,
      studentId: true,
      paymentRequired: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceAmount: true,
      penaltyAmount: true,
      paidAmount: true,
      penaltyCutoffAt: true,
      cancelledAt: true,
    },
  });

  let attempted = 0;
  for (const appointment of appointments) {
    if (!isFinalizable(appointment, now)) {
      continue;
    }

    const finalAmountCents = computeFinalAmountCents(appointment);

    if (!finalAmountCents) {
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          paymentStatus: "waived",
          invoiceStatus: "not_required",
        },
      });
      continue;
    }

    const paidCents = toCents(appointment.paidAmount);
    const dueCents = Math.max(0, finalAmountCents - paidCents);

    if (!dueCents) {
      await settleAppointmentPaymentStatus({
        prisma,
        appointmentId: appointment.id,
        explicitFinalAmountCents: finalAmountCents,
      });
      continue;
    }

    await queueAndAttemptPhasePayment({
      prisma,
      appointment,
      phase: "settlement",
      amountCents: dueCents,
    });
    attempted += 1;
  }

  return { attempted };
}

export async function processAutoscuolaPaymentRetries({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) {
  const retryable = await prisma.autoscuolaAppointmentPayment.findMany({
    where: {
      status: "failed",
      nextAttemptAt: { lte: now },
      attemptCount: { lt: MAX_PAYMENT_ATTEMPTS },
    },
    select: { id: true },
    orderBy: { nextAttemptAt: "asc" },
    take: 200,
  });

  for (const payment of retryable) {
    await attemptAutomaticPaymentRecord({
      prisma,
      paymentId: payment.id,
    });
  }

  return { retried: retryable.length };
}

const isFicNotReadyError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("fatture in cloud non connesso") ||
    message.includes("seleziona l'azienda fic") ||
    message.includes("configura iva e metodo pagamento fic")
  );
};

const createFicInvoiceForAppointment = async ({
  prisma,
  appointment,
  finalAmountCents,
  config,
}: {
  prisma: PrismaClientLike;
  appointment: {
    id: string;
    companyId: string;
    studentId: string;
    startsAt: Date;
    status: string;
    type: string;
    student: {
      id: string;
      name: string;
      email: string;
    };
  };
  finalAmountCents: number;
  config: AutoscuolaPaymentConfig;
}) => {
  if (!config.ficVatTypeId || !config.ficPaymentMethodId) {
    throw new Error("Configura IVA e metodo pagamento FIC nelle impostazioni pagamenti.");
  }

  const { token, entityId } = await getFicConnection({
    prisma,
    companyId: appointment.companyId,
  });

  const studentName = appointment.student.name || appointment.student.email;
  const clientId = await resolveFicClientId({
    prisma,
    companyId: appointment.companyId,
    studentId: appointment.studentId,
    studentName,
    studentEmail: appointment.student.email,
    token,
    entityId,
  });

  const vatTypesPayload = await ficFetch(`/c/${entityId}/info/vat_types`, token, {
    method: "GET",
  });
  const vatTypes = Array.isArray(vatTypesPayload)
    ? vatTypesPayload
    : ((vatTypesPayload as { data?: Array<Record<string, unknown>> } | null)?.data ?? []);

  const vat = vatTypes.find((item) => String(item.id) === config.ficVatTypeId);
  const vatRate = toNumber(vat?.value as number | string | null | undefined);

  const grossAmount = roundAmount(finalAmountCents / 100);
  const netPrice = vatRate > 0 ? roundAmount(grossAmount / (1 + vatRate / 100)) : grossAmount;

  const startsLabel = appointment.startsAt.toLocaleString("it-IT", {
    timeZone: AUTOSCUOLA_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const created = await ficFetch(`/c/${entityId}/issued_documents`, token, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "invoice",
        entity: {
          id: clientId,
          name: studentName,
        },
        currency: { code: "EUR" },
        language: { code: "it", name: "Italiano" },
        items_list: [
          {
            name: `Guida ${appointment.type} del ${startsLabel}`,
            qty: 1,
            net_price: netPrice,
            vat: { id: config.ficVatTypeId },
          },
        ],
        payment_method: {
          id: Number(config.ficPaymentMethodId),
        },
        payments_list: [
          {
            amount: grossAmount,
            due_date: getTodayIsoDate(),
          },
        ],
      },
    }),
  });

  const invoiceId =
    (created as { data?: { id?: string | number }; id?: string | number } | null)?.data?.id ??
    (created as { id?: string | number } | null)?.id;

  if (invoiceId == null) {
    throw new Error("Impossibile recuperare ID fattura FIC.");
  }

  return String(invoiceId);
};

export async function processAutoscuolaInvoiceFinalization({
  prisma = defaultPrisma,
  now = new Date(),
}: {
  prisma?: PrismaClientLike;
  now?: Date;
}) {
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      paymentRequired: true,
      OR: [
        { invoiceId: null },
        { invoiceStatus: { in: ["pending", "failed", "pending_fic"] } },
      ],
      status: {
        in: ["scheduled", "confirmed", "checked_in", "completed", "no_show", "cancelled"],
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  let issued = 0;
  for (const appointment of appointments) {
    if (!isFinalizable(appointment, now)) {
      continue;
    }

    const finalAmountCents = computeFinalAmountCents(appointment);

    if (finalAmountCents === 0) {
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          invoiceStatus: "not_required",
          paymentStatus: "waived",
        },
      });
      continue;
    }

    if (toCents(appointment.paidAmount) < finalAmountCents) {
      continue;
    }

    if (appointment.invoiceId) {
      if (appointment.invoiceStatus !== "issued") {
        await prisma.autoscuolaAppointment.update({
          where: { id: appointment.id },
          data: { invoiceStatus: "issued" },
        });
      }
      continue;
    }

    try {
      const config = await getAutoscuolaPaymentConfig({
        prisma,
        companyId: appointment.companyId,
      });
      const invoiceId = await createFicInvoiceForAppointment({
        prisma,
        appointment,
        finalAmountCents,
        config,
      });

      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          invoiceId,
          invoiceStatus: "issued",
          paymentStatus: "paid",
        },
      });
      issued += 1;
    } catch (error) {
      const pendingFic = isFicNotReadyError(error);
      await prisma.autoscuolaAppointment.update({
        where: { id: appointment.id },
        data: {
          invoiceStatus: pendingFic ? "pending_fic" : "failed",
        },
      });
      if (!pendingFic) {
        console.error("Autoscuola FIC invoice error", error);
      }
    }
  }

  return { issued };
}

export async function getMobileStudentPaymentProfile({
  prisma = defaultPrisma,
  companyId,
  studentId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
}) {
  const [config, profile, insoluti] = await Promise.all([
    getAutoscuolaPaymentConfig({ prisma, companyId }),
    prisma.autoscuolaStudentPaymentProfile.findUnique({
      where: {
        companyId_studentId: {
          companyId,
          studentId,
        },
      },
    }),
    prisma.autoscuolaAppointment.findMany({
      where: {
        companyId,
        studentId,
        paymentRequired: true,
        paymentStatus: "insoluto",
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        priceAmount: true,
        penaltyAmount: true,
        penaltyCutoffAt: true,
        paidAmount: true,
        cancelledAt: true,
      },
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
  ]);

  let paymentMethodSummary: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null = null;

  if (profile?.stripeDefaultPaymentMethodId) {
    try {
      const stripe = getStripe();
      const paymentMethod = await stripe.paymentMethods.retrieve(
        profile.stripeDefaultPaymentMethodId,
      );
      if (paymentMethod.type === "card" && paymentMethod.card) {
        paymentMethodSummary = {
          id: paymentMethod.id,
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        };
      }
    } catch {
      paymentMethodSummary = null;
    }
  }

  const outstanding = insoluti.map((appointment) => {
    const finalAmountCents = computeFinalAmountCents(appointment);
    const dueCents = Math.max(0, finalAmountCents - toCents(appointment.paidAmount));
    return {
      appointmentId: appointment.id,
      startsAt: appointment.startsAt,
      amountDue: roundAmount(dueCents / 100),
      status: appointment.status,
    };
  });

  return {
    autoPaymentsEnabled: config.enabled,
    hasPaymentMethod: Boolean(paymentMethodSummary),
    paymentMethod: paymentMethodSummary,
    blockedByInsoluti: outstanding.length > 0,
    outstanding,
  };
}

export async function createStudentSetupIntent({
  prisma = defaultPrisma,
  companyId,
  studentId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
}) {
  const profile = await getOrCreateStudentPaymentProfile({
    prisma,
    companyId,
    studentId,
  });

  const stripe = getStripe();

  const [setupIntent, ephemeralKey] = await Promise.all([
    stripe.setupIntents.create({
      customer: profile.stripeCustomerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        kind: "autoscuola_payment_method_setup",
        companyId,
        studentId,
      },
    }),
    stripe.ephemeralKeys.create(
      { customer: profile.stripeCustomerId },
      { apiVersion: STRIPE_EPHEMERAL_API_VERSION as never },
    ),
  ]);

  return {
    customerId: profile.stripeCustomerId,
    ephemeralKey: ephemeralKey.secret,
    setupIntentClientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
  };
}

export async function confirmStudentPaymentMethod({
  prisma = defaultPrisma,
  companyId,
  studentId,
  setupIntentId,
  paymentMethodId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
  setupIntentId?: string | null;
  paymentMethodId?: string | null;
}) {
  const profile = await getOrCreateStudentPaymentProfile({
    prisma,
    companyId,
    studentId,
  });
  const stripe = getStripe();

  let resolvedPaymentMethodId = paymentMethodId?.trim() || null;

  if (!resolvedPaymentMethodId && setupIntentId) {
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethod =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
    resolvedPaymentMethodId = paymentMethod ?? null;
  }

  if (!resolvedPaymentMethodId) {
    const methods = await stripe.paymentMethods.list({
      customer: profile.stripeCustomerId,
      type: "card",
      limit: 1,
    });
    resolvedPaymentMethodId = methods.data[0]?.id ?? null;
  }

  if (!resolvedPaymentMethodId) {
    throw new Error("Nessun metodo di pagamento trovato.");
  }

  await stripe.customers.update(profile.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: resolvedPaymentMethodId,
    },
  });

  const paymentMethod = await stripe.paymentMethods.retrieve(resolvedPaymentMethodId);

  const updated = await prisma.autoscuolaStudentPaymentProfile.update({
    where: {
      companyId_studentId: {
        companyId,
        studentId,
      },
    },
    data: {
      stripeDefaultPaymentMethodId: resolvedPaymentMethodId,
      status: "active",
    },
  });

  return {
    id: updated.id,
    paymentMethod:
      paymentMethod.type === "card" && paymentMethod.card
        ? {
            id: paymentMethod.id,
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
          }
        : null,
  };
}

export async function createManualRecoveryIntent({
  prisma = defaultPrisma,
  companyId,
  studentId,
  appointmentId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
  appointmentId: string;
}) {
  const appointment = await prisma.autoscuolaAppointment.findFirst({
    where: {
      id: appointmentId,
      companyId,
      studentId,
      paymentRequired: true,
      paymentStatus: "insoluto",
    },
    select: {
      id: true,
      companyId: true,
      studentId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceAmount: true,
      penaltyAmount: true,
      paidAmount: true,
      paymentRequired: true,
      penaltyCutoffAt: true,
      cancelledAt: true,
    },
  });

  if (!appointment) {
    throw new Error("Guida non trovata o non pagabile.");
  }

  const finalAmountCents = computeFinalAmountCents(appointment);
  const dueCents = Math.max(0, finalAmountCents - toCents(appointment.paidAmount));

  if (!dueCents) {
    await settleAppointmentPaymentStatus({
      prisma,
      appointmentId,
      explicitFinalAmountCents: finalAmountCents,
    });
    throw new Error("Nessun importo da saldare.");
  }

  const profile = await getOrCreateStudentPaymentProfile({
    prisma,
    companyId,
    studentId,
  });
  const destinationAccountId = await getAutoscuolaStripeDestinationAccountId({
    prisma,
    companyId,
  });

  const payment = await prisma.autoscuolaAppointmentPayment.create({
    data: {
      appointmentId,
      companyId,
      studentId,
      profileId: profile.id,
      phase: "manual_recovery",
      amount: toDecimal(dueCents / 100),
      currency: "EUR",
      status: "pending",
      attemptCount: 0,
    },
  });

  const stripe = getStripe();
  const [paymentIntent, ephemeralKey] = await Promise.all([
    stripe.paymentIntents.create({
      amount: dueCents,
      currency: "eur",
      customer: profile.stripeCustomerId,
      automatic_payment_methods: {
        enabled: true,
      },
      setup_future_usage: "off_session",
      on_behalf_of: destinationAccountId,
      transfer_data: {
        destination: destinationAccountId,
      },
      metadata: {
        kind: "autoscuola_appointment_payment",
        appointmentId,
        appointmentPaymentId: payment.id,
        companyId,
        studentId,
        phase: "manual_recovery",
      },
    }),
    stripe.ephemeralKeys.create(
      { customer: profile.stripeCustomerId },
      { apiVersion: STRIPE_EPHEMERAL_API_VERSION as never },
    ),
  ]);

  await prisma.autoscuolaAppointmentPayment.update({
    where: { id: payment.id },
    data: {
      stripePaymentIntentId: paymentIntent.id,
      status: "processing",
    },
  });

  return {
    customerId: profile.stripeCustomerId,
    ephemeralKey: ephemeralKey.secret,
    paymentIntentClientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amountDue: roundAmount(dueCents / 100),
  };
}

export async function finalizeManualRecoveryIntent({
  prisma = defaultPrisma,
  companyId,
  studentId,
  appointmentId,
  paymentIntentId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  studentId: string;
  appointmentId: string;
  paymentIntentId: string;
}) {
  const payment = await prisma.autoscuolaAppointmentPayment.findFirst({
    where: {
      appointmentId,
      companyId,
      studentId,
      stripePaymentIntentId: paymentIntentId,
      phase: "manual_recovery",
    },
    include: {
      appointment: {
        select: {
          id: true,
          status: true,
          paymentRequired: true,
          priceAmount: true,
          penaltyAmount: true,
          paidAmount: true,
          penaltyCutoffAt: true,
          cancelledAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!payment || !payment.appointment) {
    throw new Error("Pagamento non trovato.");
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status === "succeeded") {
    const chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id ?? null;

    if (payment.status !== "succeeded") {
      await prisma.autoscuolaAppointmentPayment.update({
        where: { id: payment.id },
        data: {
          status: "succeeded",
          paidAt: new Date(),
          attemptCount: Math.max(payment.attemptCount, 1),
          stripeChargeId: chargeId,
          failureCode: null,
          failureMessage: null,
          nextAttemptAt: null,
        },
      });

      await prisma.autoscuolaAppointment.update({
        where: { id: appointmentId },
        data: {
          paidAmount: {
            increment: payment.amount,
          },
        },
      });
    }

    const finalAmountCents = computeFinalAmountCents(payment.appointment);
    await settleAppointmentPaymentStatus({
      prisma,
      appointmentId,
      explicitFinalAmountCents: finalAmountCents,
    });

    return { success: true, status: "succeeded" as const };
  }

  if (paymentIntent.status === "processing") {
    return { success: false, status: "processing" as const };
  }

  await prisma.autoscuolaAppointmentPayment.update({
    where: { id: payment.id },
    data: {
      status: "failed",
      failureCode: paymentIntent.last_payment_error?.code ?? "manual_payment_failed",
      failureMessage: paymentIntent.last_payment_error?.message ?? "Pagamento non riuscito.",
      nextAttemptAt: null,
    },
  });

  return {
    success: false,
    status: "failed" as const,
    message: paymentIntent.last_payment_error?.message ?? "Pagamento non riuscito.",
  };
}

export async function getAutoscuolaPaymentsOverview({
  prisma = defaultPrisma,
  companyId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
}) {
  const now = new Date();
  const [totalRequired, paidCount, insolutiCount, pendingPenaltyCount, partialCount] = await Promise.all([
    prisma.autoscuolaAppointment.count({
      where: {
        companyId,
        paymentRequired: true,
        startsAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.autoscuolaAppointment.count({
      where: {
        companyId,
        paymentRequired: true,
        paymentStatus: "paid",
      },
    }),
    prisma.autoscuolaAppointment.count({
      where: {
        companyId,
        paymentRequired: true,
        paymentStatus: "insoluto",
      },
    }),
    prisma.autoscuolaAppointment.count({
      where: {
        companyId,
        paymentRequired: true,
        paymentStatus: "pending_penalty",
      },
    }),
    prisma.autoscuolaAppointment.count({
      where: {
        companyId,
        paymentRequired: true,
        paymentStatus: "partial_paid",
      },
    }),
  ]);

  return {
    totalRequired,
    paidCount,
    insolutiCount,
    pendingPenaltyCount,
    partialCount,
  };
}

export async function getAutoscuolaPaymentsAppointments({
  prisma = defaultPrisma,
  companyId,
  limit = 100,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  limit?: number;
}) {
  const appointments = await prisma.autoscuolaAppointment.findMany({
    where: {
      companyId,
      paymentRequired: true,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { startsAt: "desc" },
    take: limit,
  });

  return appointments.map((appointment) => {
    const finalAmountCents = computeFinalAmountCents(appointment);
    const paidCents = toCents(appointment.paidAmount);
    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      status: appointment.status,
      paymentStatus: appointment.paymentStatus,
      priceAmount: toNumber(appointment.priceAmount),
      penaltyAmount: toNumber(appointment.penaltyAmount),
      paidAmount: toNumber(appointment.paidAmount),
      finalAmount: roundAmount(finalAmountCents / 100),
      dueAmount: roundAmount(Math.max(0, finalAmountCents - paidCents) / 100),
      invoiceId: appointment.invoiceId,
      invoiceStatus: appointment.invoiceStatus,
      student: appointment.student,
      payments: appointment.payments.map((payment) => ({
        id: payment.id,
        phase: payment.phase,
        status: payment.status,
        amount: toNumber(payment.amount),
        attemptCount: payment.attemptCount,
        nextAttemptAt: payment.nextAttemptAt,
        failureCode: payment.failureCode,
        failureMessage: payment.failureMessage,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
      })),
    };
  });
}

export async function markAppointmentCancelledAt({
  prisma = defaultPrisma,
  appointmentId,
  cancelledAt = new Date(),
}: {
  prisma?: PrismaClientLike;
  appointmentId: string;
  cancelledAt?: Date;
}) {
  await prisma.autoscuolaAppointment.update({
    where: { id: appointmentId },
    data: {
      cancelledAt,
    },
  });
}
