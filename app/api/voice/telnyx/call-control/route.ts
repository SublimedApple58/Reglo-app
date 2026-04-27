import { NextResponse } from "next/server";
import {
  buildTelnyxAssistantStartBody,
  createVoiceCallbackTask,
  isWithinOfficeHours,
  resolveVoiceLineContextByNumber,
  updateVoiceCallRecordingFromTwilio,
  updateVoiceCallStatusFromTwilio,
  upsertIncomingVoiceCall,
  verifyTelnyxSignature,
} from "@/lib/autoscuole/voice";
import { telnyxCallControl } from "@/lib/telnyx";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

type TelnyxEvent = {
  data: {
    record_type: string;
    event_type: string;
    id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const validSignature = verifyTelnyxSignature(request, rawBody);
  if (!validSignature) {
    console.warn("[voice][telnyx][call-control] invalid signature");
    return json({ success: false, message: "Invalid signature." }, 401);
  }

  let event: TelnyxEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ success: false, message: "Invalid JSON." }, 400);
  }

  const eventType = event.data?.event_type;
  const payload = event.data?.payload ?? {};

  console.log(`[voice][telnyx][call-control] event=${eventType}`);

  switch (eventType) {
    case "call.initiated":
      return handleCallInitiated(payload);
    case "call.answered":
      return handleCallAnswered(payload);
    case "call.hangup":
      return handleCallHangup(payload);
    case "call.recording.saved":
      return handleRecordingSaved(payload);
    default:
      // Acknowledge unknown events gracefully
      return json({ success: true, ignored: true });
  }
}

// ---------------------------------------------------------------------------
// call.initiated — resolve context, create call record, answer
// ---------------------------------------------------------------------------

async function handleCallInitiated(payload: Record<string, unknown>) {
  const callControlId = payload.call_control_id as string | undefined;
  const from = payload.from as string | undefined;
  const to = payload.to as string | undefined;
  const direction = payload.direction as string | undefined;

  if (!callControlId) {
    return json({ success: false, message: "Missing call_control_id." }, 400);
  }

  // Only handle incoming calls
  if (direction !== "incoming") {
    return json({ success: true, ignored: true });
  }

  const lineContext = await resolveVoiceLineContextByNumber(to);
  if (!lineContext) {
    console.warn("[voice][telnyx][call-control] unknown number", { to });
    try {
      await telnyxCallControl(callControlId, "hangup", {
        cause: "call_rejected",
      });
    } catch { /* best effort */ }
    return json({ success: true, rejected: true });
  }

  const voiceEnabled =
    lineContext.settings.voiceFeatureEnabled &&
    lineContext.settings.voiceAssistantEnabled &&
    lineContext.settings.voiceProvisioningStatus === "ready";

  // Create/upsert voice call record (reuse twilioCallSid field for callControlId)
  const call = await upsertIncomingVoiceCall({
    companyId: lineContext.companyId,
    lineId: lineContext.line.id,
    twilioCallSid: callControlId,
    fromNumber: from ?? "",
    toNumber: to ?? lineContext.line.twilioNumber,
    status: "received",
  });

  if (!voiceEnabled) {
    if (call.studentId == null) {
      await createVoiceCallbackTask({
        companyId: lineContext.companyId,
        callId: call.id,
        phoneNumber: from ?? "",
        reason: "feature_disabled_unknown_student",
      });
    }
    // Transfer to handoff or hangup
    const handoffPhone = lineContext.settings.voiceHandoffPhone?.trim();
    if (handoffPhone) {
      try {
        await telnyxCallControl(callControlId, "answer", {});
        await telnyxCallControl(callControlId, "transfer", {
          to: handoffPhone,
        });
      } catch (err) {
        console.error("[voice][telnyx][call-control] transfer error:", err);
        try {
          await telnyxCallControl(callControlId, "hangup", {});
        } catch { /* best effort */ }
      }
    } else {
      try {
        await telnyxCallControl(callControlId, "hangup", {
          cause: "call_rejected",
        });
      } catch { /* best effort */ }
    }
    return json({ success: true, fallback: true });
  }

  if (!isWithinOfficeHours(lineContext.settings.voiceOfficeHours)) {
    const handoffPhone = lineContext.settings.voiceHandoffPhone?.trim();
    if (handoffPhone) {
      try {
        await telnyxCallControl(callControlId, "answer", {});
        await telnyxCallControl(callControlId, "transfer", {
          to: handoffPhone,
        });
      } catch {
        try {
          await telnyxCallControl(callControlId, "hangup", {});
        } catch { /* best effort */ }
      }
    } else {
      try {
        await telnyxCallControl(callControlId, "hangup", {});
      } catch { /* best effort */ }
    }
    return json({ success: true, outside_hours: true });
  }

  // Answer the call — the `call.answered` event will trigger AI start
  try {
    await telnyxCallControl(callControlId, "answer", {});
  } catch (err) {
    console.error("[voice][telnyx][call-control] answer error:", err);
    return json({ success: false, message: "Failed to answer." }, 500);
  }

  return json({ success: true, answered: true });
}

// ---------------------------------------------------------------------------
// call.answered — start AI assistant with per-company overrides
// ---------------------------------------------------------------------------

async function handleCallAnswered(payload: Record<string, unknown>) {
  const callControlId = payload.call_control_id as string | undefined;
  const from = payload.from as string | undefined;
  const to = payload.to as string | undefined;

  if (!callControlId) {
    return json({ success: false, message: "Missing call_control_id." }, 400);
  }

  const lineContext = await resolveVoiceLineContextByNumber(to);
  if (!lineContext) {
    return json({ success: true, ignored: true });
  }

  // Look up the call record
  const { prisma } = await import("@/db/prisma");
  const call = await prisma.autoscuolaVoiceCall.findFirst({
    where: { twilioCallSid: callControlId },
    select: { id: true, companyId: true },
  });

  if (!call) {
    console.warn("[voice][telnyx][call-control] call record not found for answered event");
    return json({ success: true, ignored: true });
  }

  try {
    const body = await buildTelnyxAssistantStartBody({
      companyId: call.companyId,
      callId: call.id,
      companyName: lineContext.companyName,
      fromNumber: from ?? "",
      lineNumber: lineContext.line.twilioNumber || lineContext.line.displayNumber,
      settings: lineContext.settings,
    });

    await telnyxCallControl(callControlId, "ai_assistant_start", body);
    console.log("[voice][telnyx][call-control] AI assistant started", {
      callId: call.id,
      companyId: call.companyId,
    });
  } catch (err) {
    console.error("[voice][telnyx][call-control] ai_assistant_start error:", err);
    // Fallback: try to transfer to handoff phone
    const handoffPhone = lineContext.settings.voiceHandoffPhone?.trim();
    if (handoffPhone) {
      try {
        await telnyxCallControl(callControlId, "transfer", {
          to: handoffPhone,
        });
      } catch { /* best effort */ }
    }
  }

  return json({ success: true });
}

// ---------------------------------------------------------------------------
// call.hangup — update call status
// ---------------------------------------------------------------------------

async function handleCallHangup(payload: Record<string, unknown>) {
  const callControlId = payload.call_control_id as string | undefined;
  if (!callControlId) {
    return json({ success: true });
  }

  const startTime = payload.start_time as string | undefined;
  const endTime = payload.end_time as string | undefined;
  let durationSec: number | null = null;
  if (startTime && endTime) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (Number.isFinite(start) && Number.isFinite(end)) {
      durationSec = Math.max(0, Math.round((end - start) / 1000));
    }
  }

  const hangupCause = (payload.hangup_cause as string) ?? "normal_clearing";
  const outcome =
    hangupCause === "normal_clearing" ? "completed" : hangupCause;

  await updateVoiceCallStatusFromTwilio({
    twilioCallSid: callControlId,
    status: "completed",
    durationSec,
    endedAt: endTime ? new Date(endTime) : new Date(),
    outcome,
  });

  return json({ success: true });
}

// ---------------------------------------------------------------------------
// call.recording.saved — save recording URL
// ---------------------------------------------------------------------------

async function handleRecordingSaved(payload: Record<string, unknown>) {
  const callControlId = payload.call_control_id as string | undefined;
  if (!callControlId) {
    return json({ success: true });
  }

  const recordingUrls = payload.recording_urls as Record<string, string> | undefined;
  const publicUrls = payload.public_recording_urls as Record<string, string> | undefined;
  const recordingUrl = publicUrls?.mp3 ?? recordingUrls?.mp3 ?? null;
  const recordingSid = (payload.call_leg_id as string) ?? callControlId;

  await updateVoiceCallRecordingFromTwilio({
    twilioCallSid: callControlId,
    recordingSid,
    recordingUrl,
  });

  return json({ success: true });
}
