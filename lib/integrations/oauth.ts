import { randomUUID } from "crypto";

export type IntegrationProviderKey = "fatture-in-cloud";

export const providerKeys = ["fatture-in-cloud"] as const;

export const providerEnumMap: Record<IntegrationProviderKey, "FATTURE_IN_CLOUD"> = {
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
