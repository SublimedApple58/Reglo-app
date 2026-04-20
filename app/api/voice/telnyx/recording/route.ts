import { NextResponse } from "next/server";
import {
  updateVoiceCallRecordingFromTwilio,
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
  const recordingSid = payload.RecordingSid?.trim();
  if (!callSid || !recordingSid) {
    return NextResponse.json(
      { success: false, message: "Missing CallSid or RecordingSid." },
      { status: 400 },
    );
  }

  const recordingUrl = payload.RecordingUrl?.trim();
  const updated = await updateVoiceCallRecordingFromTwilio({
    twilioCallSid: callSid,
    recordingSid,
    recordingUrl: recordingUrl || null,
  });
  return NextResponse.json({ success: true, updated });
}
