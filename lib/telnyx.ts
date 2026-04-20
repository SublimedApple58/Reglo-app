const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.warn("[telnyx] TELNYX_API_KEY not set");
}

export async function telnyxFetch(path: string, options?: RequestInit) {
  if (!TELNYX_API_KEY) {
    throw new Error("TELNYX_API_KEY must be set");
  }
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

export const TELNYX_WEBHOOK_BASE_URL =
  process.env.TELNYX_WEBHOOK_BASE_URL?.replace(/\/$/, "") || "https://app.reglo.it";
