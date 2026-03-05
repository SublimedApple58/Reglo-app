export const toStringMap = (payload: FormData): Record<string, string> => {
  const data: Record<string, string> = {};
  for (const [key, value] of payload.entries()) {
    data[key] = typeof value === "string" ? value : "";
  }
  return data;
};

export const resolvePublicRequestUrl = (request: Request): string => {
  try {
    const parsed = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
    const forwardedPort = request.headers.get("x-forwarded-port")?.trim();
    if (!forwardedHost && !forwardedPort) return request.url;

    const hostWithOptionalPort = (() => {
      if (!forwardedHost) return parsed.host;
      if (forwardedHost.includes(":")) return forwardedHost;
      if (!forwardedPort || forwardedPort === "80" || forwardedPort === "443") {
        return forwardedHost;
      }
      return `${forwardedHost}:${forwardedPort}`;
    })();

    const protocol =
      forwardedProto || parsed.protocol.replace(":", "") || "https";
    return `${protocol}://${hostWithOptionalPort}${parsed.pathname}${parsed.search}`;
  } catch {
    return request.url;
  }
};
