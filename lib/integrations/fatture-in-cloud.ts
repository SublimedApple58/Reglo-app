import { Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "@/db/prisma";
import { getProviderConfig } from "@/lib/integrations/oauth";
import { decryptSecret, encryptSecret } from "@/lib/integrations/secrets";

type PrismaClientLike = typeof defaultPrisma | Prisma.TransactionClient;

const FIC_PROVIDER = "FATTURE_IN_CLOUD" as const;
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000;

type FicConnectionMetadata = {
  entityId?: string;
  entityName?: string;
  tokenType?: string | null;
  [key: string]: unknown;
};

type FicTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const asStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const readMetadata = (value: unknown): FicConnectionMetadata =>
  value && typeof value === "object" ? (value as FicConnectionMetadata) : {};

const parseResponsePayload = async <T>(response: Response) => {
  const raw = await response.text();
  let json: T | null = null;
  try {
    json = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    json = null;
  }
  return { raw, json };
};

const extractRefreshError = (raw: string, payload: FicTokenPayload | null) => {
  return (
    asStringOrNull(payload?.error_description) ??
    asStringOrNull(payload?.error) ??
    asStringOrNull(raw) ??
    "Impossibile aggiornare il token Fatture in Cloud. Ricollega l'integrazione."
  );
};

const refreshFicAccessToken = async ({
  prisma,
  connection,
}: {
  prisma: PrismaClientLike;
  connection: {
    id: string;
    scope: string | null;
    metadata: Prisma.JsonValue;
    refreshTokenCiphertext: string | null;
    refreshTokenIv: string | null;
    refreshTokenTag: string | null;
  };
}) => {
  if (
    !connection.refreshTokenCiphertext ||
    !connection.refreshTokenIv ||
    !connection.refreshTokenTag
  ) {
    throw new Error(
      "Token Fatture in Cloud scaduto e refresh token assente. Ricollega l'integrazione.",
    );
  }

  const refreshToken = decryptSecret({
    ciphertext: connection.refreshTokenCiphertext,
    iv: connection.refreshTokenIv,
    tag: connection.refreshTokenTag,
  });

  const config = getProviderConfig("fatture-in-cloud");

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });

  const parsed = await parseResponsePayload<FicTokenPayload>(tokenResponse);
  const payload = parsed.json;
  const accessToken = asStringOrNull(payload?.access_token);

  if (!tokenResponse.ok || !accessToken) {
    throw new Error(extractRefreshError(parsed.raw, payload));
  }

  const nextRefreshToken = asStringOrNull(payload?.refresh_token) ?? refreshToken;

  const accessEncrypted = encryptSecret(accessToken);
  const refreshEncrypted = encryptSecret(nextRefreshToken);
  const expiresAt =
    typeof payload?.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null;

  const metadata = readMetadata(connection.metadata);
  const mergedMetadata: FicConnectionMetadata = {
    ...metadata,
    tokenType: asStringOrNull(payload?.token_type) ?? asStringOrNull(metadata.tokenType),
  };

  const updated = await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenCiphertext: accessEncrypted.ciphertext,
      accessTokenIv: accessEncrypted.iv,
      accessTokenTag: accessEncrypted.tag,
      refreshTokenCiphertext: refreshEncrypted.ciphertext,
      refreshTokenIv: refreshEncrypted.iv,
      refreshTokenTag: refreshEncrypted.tag,
      expiresAt,
      scope: asStringOrNull(payload?.scope) ?? connection.scope,
      metadata: mergedMetadata as Prisma.InputJsonValue,
      status: "connected",
    },
  });

  return {
    token: accessToken,
    connection: updated,
  };
};

export type FicConnection = {
  token: string;
  entityId: string | null;
  entityName: string | null;
  connectionId: string;
};

export type FicConnectionWithEntity = Omit<FicConnection, "entityId"> & {
  entityId: string;
};

type GetFicConnectionCommonInput = {
  prisma?: PrismaClientLike;
  companyId: string;
};

export function getFicConnection(input: GetFicConnectionCommonInput & { requireEntity: false }): Promise<FicConnection>;
export function getFicConnection(
  input: GetFicConnectionCommonInput & { requireEntity?: true },
): Promise<FicConnectionWithEntity>;
export async function getFicConnection({
  prisma = defaultPrisma,
  companyId,
  requireEntity = true,
}: {
  prisma?: PrismaClientLike;
  companyId: string;
  requireEntity?: boolean;
}): Promise<FicConnection | FicConnectionWithEntity> {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: FIC_PROVIDER,
      },
    },
    select: {
      id: true,
      scope: true,
      metadata: true,
      expiresAt: true,
      accessTokenCiphertext: true,
      accessTokenIv: true,
      accessTokenTag: true,
      refreshTokenCiphertext: true,
      refreshTokenIv: true,
      refreshTokenTag: true,
    },
  });

  if (
    !connection?.accessTokenCiphertext ||
    !connection.accessTokenIv ||
    !connection.accessTokenTag
  ) {
    throw new Error("Fatture in Cloud non connesso.");
  }

  const shouldRefresh =
    connection.expiresAt != null &&
    connection.expiresAt.getTime() <= Date.now() + TOKEN_REFRESH_SAFETY_WINDOW_MS;

  let token = decryptSecret({
    ciphertext: connection.accessTokenCiphertext,
    iv: connection.accessTokenIv,
    tag: connection.accessTokenTag,
  });

  let resolvedConnection = connection;
  if (shouldRefresh) {
    const refreshed = await refreshFicAccessToken({ prisma, connection });
    token = refreshed.token;
    resolvedConnection = refreshed.connection;
  }

  const metadata = readMetadata(resolvedConnection.metadata);
  const entityId = asStringOrNull(metadata.entityId);
  if (requireEntity && !entityId) {
    throw new Error("Seleziona l'azienda FIC in Settings.");
  }

  if (requireEntity) {
    return {
      token,
      entityId: entityId as string,
      entityName: asStringOrNull(metadata.entityName),
      connectionId: resolvedConnection.id,
    };
  }

  return {
    token,
    entityId,
    entityName: asStringOrNull(metadata.entityName),
    connectionId: resolvedConnection.id,
  };
}
