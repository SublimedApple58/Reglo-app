import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import {
  IntegrationProviderKey,
  getProviderConfig,
  getRedirectUri,
  providerEnumMap,
  providerKeys,
} from "@/lib/integrations/oauth";
import { encryptSecret } from "@/lib/integrations/secrets";

type SlackTokenResponse = {
  ok: boolean;
  access_token?: string;
  scope?: string;
  token_type?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  error?: string;
};

type FattureTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

const buildReturnUrl = (request: NextRequest, provider: IntegrationProviderKey) => {
  const value = request.cookies.get(`integration_oauth_return_${provider}`)?.value;
  return value || "/user/settings";
};

const buildRedirectWithStatus = (
  baseUrl: string,
  key: "integrationSuccess" | "integrationError",
  provider: string,
) => {
  const url = new URL(baseUrl, "http://localhost");
  url.searchParams.set(key, provider);
  return url.pathname + url.search;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const providerKey = provider as IntegrationProviderKey;
  if (!providerKeys.includes(providerKey)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(
    `integration_oauth_state_${providerKey}`,
  )?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    const returnUrl = buildReturnUrl(request, providerKey);
    return NextResponse.redirect(
      buildRedirectWithStatus(returnUrl, "integrationError", providerKey),
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  const isGlobalAdmin = session?.user?.role === "admin";

  if (!userId) {
    return NextResponse.redirect(
      buildRedirectWithStatus(
        buildReturnUrl(request, providerKey),
        "integrationError",
        providerKey,
      ),
    );
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return NextResponse.redirect(
      buildRedirectWithStatus(
        buildReturnUrl(request, providerKey),
        "integrationError",
        providerKey,
      ),
    );
  }

  if (!isGlobalAdmin && membership.role !== "admin") {
    return NextResponse.redirect(
      buildRedirectWithStatus(
        buildReturnUrl(request, providerKey),
        "integrationError",
        providerKey,
      ),
    );
  }

  const config = getProviderConfig(providerKey);
  const redirectUri = getRedirectUri(providerKey);
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      ...(provider === "fatture-in-cloud" ? { grant_type: "authorization_code" } : {}),
    }),
  });

  const tokenPayload = (await tokenResponse.json()) as SlackTokenResponse | FattureTokenResponse;

  if (provider === "slack") {
    const payload = tokenPayload as SlackTokenResponse;
    if (!payload.ok || !payload.access_token) {
      return NextResponse.redirect(
        buildRedirectWithStatus(
          buildReturnUrl(request, providerKey),
          "integrationError",
          providerKey,
        ),
      );
    }

    const encrypted = encryptSecret(payload.access_token);
    await prisma.integrationConnection.upsert({
      where: {
        companyId_provider: {
          companyId: membership.companyId,
          provider: providerEnumMap[providerKey],
        },
      },
      update: {
        status: "connected",
        scope: payload.scope ?? null,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        refreshTokenCiphertext: null,
        refreshTokenIv: null,
        refreshTokenTag: null,
        expiresAt: null,
        externalAccountId: payload.team?.id ?? null,
        displayName: payload.team?.name ?? null,
        metadata: payload,
      },
      create: {
        companyId: membership.companyId,
        provider: providerEnumMap[providerKey],
        status: "connected",
        scope: payload.scope ?? null,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        externalAccountId: payload.team?.id ?? null,
        displayName: payload.team?.name ?? null,
        metadata: payload,
      },
    });
  } else {
    const payload = tokenPayload as FattureTokenResponse;
    if (!payload.access_token) {
      return NextResponse.redirect(
        buildRedirectWithStatus(
          buildReturnUrl(request, providerKey),
          "integrationError",
          providerKey,
        ),
      );
    }

    const accessEncrypted = encryptSecret(payload.access_token);
    const refreshEncrypted = payload.refresh_token
      ? encryptSecret(payload.refresh_token)
      : null;
    const expiresAt = payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null;

    await prisma.integrationConnection.upsert({
      where: {
        companyId_provider: {
          companyId: membership.companyId,
          provider: providerEnumMap[providerKey],
        },
      },
      update: {
        status: "connected",
        scope: payload.scope ?? null,
        accessTokenCiphertext: accessEncrypted.ciphertext,
        accessTokenIv: accessEncrypted.iv,
        accessTokenTag: accessEncrypted.tag,
        refreshTokenCiphertext: refreshEncrypted?.ciphertext ?? null,
        refreshTokenIv: refreshEncrypted?.iv ?? null,
        refreshTokenTag: refreshEncrypted?.tag ?? null,
        expiresAt,
        metadata: payload,
      },
      create: {
        companyId: membership.companyId,
        provider: providerEnumMap[providerKey],
        status: "connected",
        scope: payload.scope ?? null,
        accessTokenCiphertext: accessEncrypted.ciphertext,
        accessTokenIv: accessEncrypted.iv,
        accessTokenTag: accessEncrypted.tag,
        refreshTokenCiphertext: refreshEncrypted?.ciphertext ?? null,
        refreshTokenIv: refreshEncrypted?.iv ?? null,
        refreshTokenTag: refreshEncrypted?.tag ?? null,
        expiresAt,
        metadata: payload,
      },
    });
  }

  const returnUrl = buildReturnUrl(request, providerKey);
  const redirectUrl = buildRedirectWithStatus(returnUrl, "integrationSuccess", providerKey);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(`integration_oauth_state_${providerKey}`, "", {
    maxAge: 0,
    path: `/api/integrations/${providerKey}/callback`,
  });
  response.cookies.set(`integration_oauth_return_${providerKey}`, "", {
    maxAge: 0,
    path: "/",
  });
  return response;
}
