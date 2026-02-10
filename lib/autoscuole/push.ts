import { prisma as defaultPrisma } from "@/db/prisma";

type PrismaClientLike = typeof defaultPrisma;

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

const chunk = <T,>(items: T[], size: number) => {
  if (size <= 0) return [items];
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const normalizeToken = (value: string) => value.trim();

const isExpoPushToken = (value: string) => {
  const token = normalizeToken(value);
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
};

type PushPayloadData = Record<string, string | number | boolean | null>;

type SendAutoscuolaPushOptions = {
  prisma?: PrismaClientLike;
  companyId: string;
  userIds: string[];
  title: string;
  body: string;
  data?: PushPayloadData;
};

type ExpoResponseEntry = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

type ExpoErrorEntry = {
  code?: string;
  message?: string;
};

export type AutoscuolaPushSendResult = {
  sent: number;
  failed: number;
  skipped: number;
  invalidated: number;
  errorCodes: string[];
  errorMessages: string[];
};

export async function sendAutoscuolaPushToUsers({
  prisma = defaultPrisma,
  companyId,
  userIds,
  title,
  body,
  data,
}: SendAutoscuolaPushOptions) {
  if (!userIds.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      invalidated: 0,
      errorCodes: [],
      errorMessages: [],
    } satisfies AutoscuolaPushSendResult;
  }

  const devices = await prisma.mobilePushDevice.findMany({
    where: {
      userId: { in: Array.from(new Set(userIds)) },
      disabledAt: null,
    },
    select: {
      id: true,
      token: true,
    },
  });

  if (!devices.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      invalidated: 0,
      errorCodes: [],
      errorMessages: [],
    } satisfies AutoscuolaPushSendResult;
  }

  const tokenMap = new Map<string, string>();
  for (const device of devices) {
    const token = normalizeToken(device.token);
    if (!tokenMap.has(token)) {
      tokenMap.set(token, device.id);
    }
  }

  const validTokens: string[] = [];
  const invalidDeviceIds: string[] = [];
  for (const [token, deviceId] of tokenMap.entries()) {
    if (!isExpoPushToken(token)) {
      invalidDeviceIds.push(deviceId);
      continue;
    }
    validTokens.push(token);
  }

  if (invalidDeviceIds.length) {
    await prisma.mobilePushDevice.updateMany({
      where: { id: { in: invalidDeviceIds } },
      data: { disabledAt: new Date() },
    });
  }

  if (!validTokens.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: devices.length,
      invalidated: invalidDeviceIds.length,
      errorCodes: [],
      errorMessages: [],
    } satisfies AutoscuolaPushSendResult;
  }

  let sent = 0;
  let failed = 0;
  const skipped = devices.length - validTokens.length;
  const tokenInvalidation: string[] = [];
  const errorCodes = new Set<string>();
  const errorMessages = new Set<string>();

  const batches = chunk(validTokens, EXPO_BATCH_SIZE);
  for (const batch of batches) {
    const messages = batch.map((to) => ({
      to,
      title,
      body,
      data,
      sound: "default",
      priority: "high" as const,
    }));

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: ExpoResponseEntry[]; errors?: ExpoErrorEntry[] }
        | null;

      if (Array.isArray(payload?.errors)) {
        payload.errors.forEach((entry) => {
          if (entry.code) errorCodes.add(entry.code);
          if (entry.message) errorMessages.add(entry.message);
        });
      }

      if (!response.ok || !payload?.data || !Array.isArray(payload.data)) {
        failed += batch.length;
        continue;
      }

      payload.data.forEach((entry, index) => {
        const token = batch[index];
        if (entry.status === "ok") {
          sent += 1;
          return;
        }

        failed += 1;
        if (entry.details?.error) {
          errorCodes.add(entry.details.error);
        }
        if (entry.message) {
          errorMessages.add(entry.message);
        }
        if (entry.details?.error === "DeviceNotRegistered") {
          tokenInvalidation.push(token);
        }
      });
    } catch {
      errorCodes.add("NetworkError");
      failed += batch.length;
    }
  }

  const deviceIdsToDisable = tokenInvalidation
    .map((token) => tokenMap.get(token))
    .filter((id): id is string => Boolean(id));

  if (deviceIdsToDisable.length) {
    await prisma.mobilePushDevice.updateMany({
      where: { id: { in: deviceIdsToDisable } },
      data: { disabledAt: new Date() },
    });
  }

  return {
    sent,
    failed,
    skipped,
    invalidated: invalidDeviceIds.length + deviceIdsToDisable.length,
    errorCodes: Array.from(errorCodes),
    errorMessages: Array.from(errorMessages),
  } satisfies AutoscuolaPushSendResult;
}
