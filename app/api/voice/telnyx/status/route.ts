import { NextResponse } from "next/server";
import {
  updateVoiceCallStatusFromTwilio,
  verifyTelnyxSignature,
} from "@/lib/autoscuole/voice";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const formData = new URLSearchParams(rawBody);
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = value;
  }

  const validSignature = verifyTelnyxSignature(request, rawBody);
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
  });

  return NextResponse.json({ success: true, updated });
}
