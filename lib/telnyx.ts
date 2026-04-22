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

export async function telnyxCallControl(
  callControlId: string,
  action: string,
  body?: Record<string, unknown>,
) {
  const res = await telnyxFetch(`/calls/${callControlId}/actions/${action}`, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[telnyx] ${action} failed (${res.status}):`, text);
    throw new Error(`Telnyx ${action} failed (${res.status})`);
  }
  return res.json();
}
