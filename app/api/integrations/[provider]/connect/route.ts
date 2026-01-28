import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  IntegrationProviderKey,
  getProviderConfig,
  getRedirectUri,
  providerKeys,
} from "@/lib/integrations/oauth";
import { randomUUID } from "crypto";
import { getActiveCompanyContext } from "@/lib/company-context";

const getReturnUrl = (request: Request) => {
  const referer = request.headers.get("referer");
  if (referer && referer.startsWith("http")) {
    return referer;
  }
  return "/user/settings";
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const providerKey = provider as IntegrationProviderKey;
  if (!providerKeys.includes(providerKey)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { membership } = await getActiveCompanyContext();

  if (membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = getProviderConfig(providerKey);
  const state = randomUUID();
  const redirectUri = getRedirectUri(providerKey);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set(`integration_oauth_state_${providerKey}`, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: "lax",
    path: `/api/integrations/${providerKey}/callback`,
  });
  response.cookies.set(
    `integration_oauth_return_${providerKey}`,
    getReturnUrl(request),
    {
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: "lax",
    path: "/",
    },
  );

  return response;
}
