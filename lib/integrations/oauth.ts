import { randomUUID } from "crypto";

export type IntegrationProviderKey = "slack" | "fatture-in-cloud";

export const providerKeys = ["slack", "fatture-in-cloud"] as const;

export const providerEnumMap: Record<IntegrationProviderKey, "SLACK" | "FATTURE_IN_CLOUD"> = {
  slack: "SLACK",
  "fatture-in-cloud": "FATTURE_IN_CLOUD",
};

type ProviderConfig = {
  key: IntegrationProviderKey;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
};

const getBaseUrl = () =>
  process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SERVER_URL || "";

export const getRedirectUri = (provider: IntegrationProviderKey) => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("NEXTAUTH_URL or NEXT_PUBLIC_SERVER_URL is required.");
  }
  return `${baseUrl}/api/integrations/${provider}/callback`;
};

export const getProviderConfig = (provider: IntegrationProviderKey): ProviderConfig => {
  if (provider === "slack") {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Slack client credentials are missing.");
    }
    const defaultScopes = [
      "chat:write",
      "chat:write.public",
      "files:write",
      "reminders:write",
      "channels:read",
      "groups:read",
      "im:read",
      "mpim:read",
      "users:read",
      "team:read",
    ].join(",");

    return {
      key: provider,
      label: "Slack",
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      clientId,
      clientSecret,
      scopes: process.env.SLACK_SCOPES || defaultScopes,
    };
  }

  const clientId = process.env.FATTURE_IN_CLOUD_CLIENT_ID;
  const clientSecret = process.env.FATTURE_IN_CLOUD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Fatture in Cloud client credentials are missing.");
  }

  return {
    key: provider,
    label: "Fatture in Cloud",
    authorizeUrl: "https://api-v2.fattureincloud.it/oauth/authorize",
    tokenUrl: "https://api-v2.fattureincloud.it/oauth/token",
    clientId,
    clientSecret,
    scopes: process.env.FATTURE_IN_CLOUD_SCOPES || "issued_documents",
  };
};

export const generateOAuthState = () => randomUUID();

export const buildAuthorizeUrl = (config: ProviderConfig) => {
  const redirectUri = getRedirectUri(config.key);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", generateOAuthState());
  return url;
};
