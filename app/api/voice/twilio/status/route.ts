import { NextResponse } from "next/server";
import {
  updateVoiceCallStatusFromTwilio,
  verifyTwilioRequestSignature,
} from "@/lib/autoscuole/voice";

const toStringMap = (payload: FormData) => {
  const data: Record<string, string> = {};
  for (const [key, value] of payload.entries()) {
    data[key] = typeof value === "string" ? value : "";
  }
  return data;
};

const resolvePublicRequestUrl = (request: Request) => {
  try {
    const parsed = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
    if (!forwardedHost) return request.url;
    const protocol = forwardedProto || parsed.protocol.replace(":", "") || "https";
    return `${protocol}://${forwardedHost}${parsed.pathname}${parsed.search}`;
  } catch {
    return request.url;
  }
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const payload = toStringMap(formData);
  const validSignature = verifyTwilioRequestSignature({
    requestUrl: resolvePublicRequestUrl(request),
    payload,
    signature: request.headers.get("x-twilio-signature"),
  });
  if (!validSignature) {
    return NextResponse.json(
      { success: false, message: "Invalid signature." },
      { status: 401 },
    );
  }

  const callSid = payload.CallSid?.trim();
  if (!callSid) {
    return NextResponse.json(
      { success: false, message: "Missing CallSid." },
      { status: 400 },
    );
  }

  const durationSec = Number(payload.CallDuration ?? "");
  const endedAt =
    payload.Timestamp && !Number.isNaN(Date.parse(payload.Timestamp))
      ? new Date(payload.Timestamp)
      : null;

  const updated = await updateVoiceCallStatusFromTwilio({
    twilioCallSid: callSid,
    status: payload.CallStatus ?? "updated",
    durationSec: Number.isFinite(durationSec) ? Math.max(0, Math.trunc(durationSec)) : null,
    endedAt,
    outcome: payload.CallStatus ?? null,
    summary: payload.RecordingStatus ?? null,
  });

  return NextResponse.json({ success: true, updated });
}
