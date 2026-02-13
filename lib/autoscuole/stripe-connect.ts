import { Prisma } from "@prisma/client";
import Stripe from "stripe";

import { prisma as defaultPrisma } from "@/db/prisma";
import { SERVER_URL } from "@/lib/constants";

type PrismaClientLike = typeof defaultPrisma | Prisma.TransactionClient;

const STRIPE_CONNECT_PROVIDER = "STRIPE_CONNECT" as const;
const STRIPE_CONNECT_ACCOUNT_ID_REGEX = /^acct_[A-Za-z0-9]+$/;
const AUTOSCUOLA_SERVICE_KEY = "AUTOSCUOLE" as const;

let stripeSingleton: Stripe | null = null;

export type AutoscuolaStripeConnectStatus = {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsPastDue: string[];
  disabledReason: string | null;
  status: "not_connected" | "pending" | "restricted" | "active";
  ready: boolean;
  lastSyncedAt: string | null;
  syncError?: string | null;
};

const DEFAULT_RETURN_PATH = "/en/user/autoscuole/payments?stripe_return=1";
const DEFAULT_REFRESH_PATH = "/en/user/autoscuole/payments?stripe_refresh=1";

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

const emptyStatus = (): AutoscuolaStripeConnectStatus => ({
  connected: false,
  accountId: null,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  onboardingComplete: false,
  requirementsCurrentlyDue: [],
  requirementsEventuallyDue: [],
  requirementsPastDue: [],
  disabledReason: null,
  status: "not_connected",
  ready: false,
  lastSyncedAt: null,
  syncError: null,
});

const toStatusLabel = (
  input: Pick<AutoscuolaStripeConnectStatus, "chargesEnabled" | "payoutsEnabled" | "onboardingComplete">,
): AutoscuolaStripeConnectStatus["status"] => {
  if (input.chargesEnabled && input.payoutsEnabled) {
    return "active";
  }
  if (input.onboardingComplete) {
    return "pending";
  }
  return "restricted";
};

const normalizeMetadataStatus = (
  metadata: Record<string, unknown>,
): AutoscuolaStripeConnectStatus => {
  const accountId =
    typeof metadata.accountId === "string" && metadata.accountId.trim().length
      ? metadata.accountId.trim()
      : null;

  const requirementsCurrentlyDue = Array.isArray(metadata.requirementsCurrentlyDue)
    ? metadata.requirementsCurrentlyDue
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const requirementsEventuallyDue = Array.isArray(metadata.requirementsEventuallyDue)
    ? metadata.requirementsEventuallyDue
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const requirementsPastDue = Array.isArray(metadata.requirementsPastDue)
    ? metadata.requirementsPastDue
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const chargesEnabled = metadata.chargesEnabled === true;
  const payoutsEnabled = metadata.payoutsEnabled === true;
  const detailsSubmitted = metadata.detailsSubmitted === true;
  const onboardingComplete = detailsSubmitted && requirementsCurrentlyDue.length === 0;
  const status = toStatusLabel({
    chargesEnabled,
    payoutsEnabled,
    onboardingComplete,
  });

  return {
    connected: Boolean(accountId),
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboardingComplete,
    requirementsCurrentlyDue,
    requirementsEventuallyDue,
    requirementsPastDue,
    disabledReason:
      typeof metadata.disabledReason === "string" && metadata.disabledReason.trim().length
        ? metadata.disabledReason.trim()
        : null,
    status: accountId ? status : "not_connected",
    ready: chargesEnabled && payoutsEnabled,
    lastSyncedAt:
      typeof metadata.lastSyncedAt === "string" && metadata.lastSyncedAt.trim().length
        ? metadata.lastSyncedAt
        : null,
    syncError:
      typeof metadata.syncError === "string" && metadata.syncError.trim().length
        ? metadata.syncError.trim()
        : null,
  };
};

const toStatusFromStripeAccount = (account: Stripe.Account): AutoscuolaStripeConnectStatus => {
  const requirementsCurrentlyDue = account.requirements?.currently_due ?? [];
  const requirementsEventuallyDue = account.requirements?.eventually_due ?? [];
  const requirementsPastDue = account.requirements?.past_due ?? [];

  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  const onboardingComplete = detailsSubmitted && requirementsCurrentlyDue.length === 0;

  return {
    connected: true,
    accountId: account.id,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboardingComplete,
    requirementsCurrentlyDue,
    requirementsEventuallyDue,
    requirementsPastDue,
    disabledReason: account.requirements?.disabled_reason ?? null,
    status: toStatusLabel({
      chargesEnabled,
      payoutsEnabled,
      onboardingComplete,
    }),
    ready: chargesEnabled && payoutsEnabled,
    lastSyncedAt: new Date().toISOString(),
    syncError: null,
  };
};

const toAbsoluteUrl = (relativePath: string) => {
  const base = SERVER_URL.replace(/\/$/, "");
  return `${base}${relativePath}`;
};

const normalizeRelativePath = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  return trimmed;
};

const getStripeConnectConnection = async ({
  prisma,
  companyId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
}) => {
  return prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: STRIPE_CONNECT_PROVIDER,
      },
    },
  });
};

const getLegacyStripeConnectedAccountId = async ({
  prisma,
  companyId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
}) => {
  const service = await prisma.companyService.findFirst({
    where: {
      companyId,
      serviceKey: AUTOSCUOLA_SERVICE_KEY,
    },
    select: { limits: true },
  });

  const limits = (service?.limits ?? {}) as Record<string, unknown>;
  const legacyValue =
    typeof limits.stripeConnectedAccountId === "string"
      ? limits.stripeConnectedAccountId.trim()
      : "";

  if (!STRIPE_CONNECT_ACCOUNT_ID_REGEX.test(legacyValue)) {
    return null;
  }

  return legacyValue;
};

const persistStatus = async ({
  prisma,
  companyId,
  status,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  status: AutoscuolaStripeConnectStatus;
}) => {
  if (!status.accountId) {
    return null;
  }

  return prisma.integrationConnection.upsert({
    where: {
      companyId_provider: {
        companyId,
        provider: STRIPE_CONNECT_PROVIDER,
      },
    },
    create: {
      companyId,
      provider: STRIPE_CONNECT_PROVIDER,
      status: status.status,
      externalAccountId: status.accountId,
      displayName: "Stripe Connect",
      metadata: {
        accountId: status.accountId,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
        requirementsCurrentlyDue: status.requirementsCurrentlyDue,
        requirementsEventuallyDue: status.requirementsEventuallyDue,
        requirementsPastDue: status.requirementsPastDue,
        disabledReason: status.disabledReason,
        lastSyncedAt: status.lastSyncedAt,
        syncError: status.syncError ?? null,
      },
    },
    update: {
      status: status.status,
      externalAccountId: status.accountId,
      displayName: "Stripe Connect",
      metadata: {
        accountId: status.accountId,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
        requirementsCurrentlyDue: status.requirementsCurrentlyDue,
        requirementsEventuallyDue: status.requirementsEventuallyDue,
        requirementsPastDue: status.requirementsPastDue,
        disabledReason: status.disabledReason,
        lastSyncedAt: status.lastSyncedAt,
        syncError: status.syncError ?? null,
      },
    },
  });
};

export async function persistAutoscuolaStripeConnectAccountStatus({
  prisma = defaultPrisma,
  companyId,
  account,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  account: Stripe.Account;
}) {
  const status = toStatusFromStripeAccount(account);
  await persistStatus({
    prisma,
    companyId,
    status,
  });
  return status;
}

const migrateLegacyStripeConnectedAccount = async ({
  prisma,
  companyId,
}: {
  prisma: PrismaClientLike;
  companyId: string;
}) => {
  const existing = await getStripeConnectConnection({ prisma, companyId });
  if (existing) return existing;

  const legacyAccountId = await getLegacyStripeConnectedAccountId({
    prisma,
    companyId,
  });

  if (!legacyAccountId) {
    return null;
  }

  return prisma.integrationConnection.create({
    data: {
      companyId,
      provider: STRIPE_CONNECT_PROVIDER,
      status: "pending",
      externalAccountId: legacyAccountId,
      displayName: "Stripe Connect",
      metadata: {
        migratedFrom: "company_service_limits",
        accountId: legacyAccountId,
        lastSyncedAt: null,
      },
    },
  });
};

export const canManageAutoscuolaStripeConnect = (
  role: string,
  autoscuolaRole: string | null,
) => role === "admin" || autoscuolaRole === "OWNER";

export async function getAutoscuolaStripeConnectStatus({
  prisma = defaultPrisma,
  companyId,
  sync = true,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  sync?: boolean;
}): Promise<AutoscuolaStripeConnectStatus> {
  const existing =
    (await getStripeConnectConnection({ prisma, companyId })) ??
    (await migrateLegacyStripeConnectedAccount({ prisma, companyId }));

  if (!existing || !existing.externalAccountId) {
    return emptyStatus();
  }

  const metadata =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const fallback = normalizeMetadataStatus({
    ...metadata,
    accountId:
      typeof metadata.accountId === "string" && metadata.accountId.trim().length
        ? metadata.accountId
        : existing.externalAccountId,
  });

  if (!sync) {
    return fallback.connected ? fallback : { ...fallback, connected: true };
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(existing.externalAccountId);
    const status = toStatusFromStripeAccount(account);
    await persistStatus({ prisma, companyId, status });
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sync Stripe Connect.";
    const fallbackWithError: AutoscuolaStripeConnectStatus = {
      ...fallback,
      connected: true,
      accountId: existing.externalAccountId,
      syncError: message,
    };
    await persistStatus({
      prisma,
      companyId,
      status: {
        ...fallbackWithError,
        lastSyncedAt: fallbackWithError.lastSyncedAt ?? new Date().toISOString(),
      },
    });
    return fallbackWithError;
  }
}

export async function isAutoscuolaStripeConnectReady({
  prisma = defaultPrisma,
  companyId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
}) {
  const status = await getAutoscuolaStripeConnectStatus({
    prisma,
    companyId,
    sync: true,
  });

  return {
    ready: status.ready,
    status,
  };
}

export async function getAutoscuolaStripeDestinationAccountId({
  prisma = defaultPrisma,
  companyId,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
}) {
  const { ready, status } = await isAutoscuolaStripeConnectReady({
    prisma,
    companyId,
  });

  if (!status.accountId) {
    throw new Error(
      "Pagamenti automatici non disponibili: completa il collegamento Stripe in Pagamenti.",
    );
  }

  if (!ready) {
    throw new Error(
      "Pagamenti automatici non disponibili: completa onboarding Stripe (IBAN, P.IVA e documenti).",
    );
  }

  return status.accountId;
}

const createStripeConnectAccount = async ({
  companyId,
}: {
  companyId: string;
}) => {
  const stripe = getStripe();
  return stripe.accounts.create({
    type: "express",
    country: "IT",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      companyId,
    },
  });
};

export async function createAutoscuolaStripeConnectOnboardingLink({
  prisma = defaultPrisma,
  companyId,
  returnPath,
  refreshPath,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  returnPath?: string | null;
  refreshPath?: string | null;
}) {
  const existing =
    (await getStripeConnectConnection({ prisma, companyId })) ??
    (await migrateLegacyStripeConnectedAccount({ prisma, companyId }));

  let accountId = existing?.externalAccountId ?? null;

  if (!accountId) {
    const created = await createStripeConnectAccount({ companyId });
    const status = toStatusFromStripeAccount(created);
    await persistStatus({ prisma, companyId, status });
    accountId = created.id;
  }

  const stripe = getStripe();
  const normalizedReturnPath = normalizeRelativePath(returnPath, DEFAULT_RETURN_PATH);
  const normalizedRefreshPath = normalizeRelativePath(refreshPath, DEFAULT_REFRESH_PATH);

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: toAbsoluteUrl(normalizedReturnPath),
    refresh_url: toAbsoluteUrl(normalizedRefreshPath),
  });

  return {
    accountId,
    onboardingUrl: link.url,
    expiresAt: link.expires_at,
  };
}
