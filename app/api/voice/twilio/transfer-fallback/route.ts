import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { getAutoscuolaSettingsForCompany } from "@/lib/actions/autoscuole-settings.actions";

const xml = (body: string) =>
  new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function POST(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const callId = url.searchParams.get("callId");

  const formData = await request.formData();
  const dialCallStatus = String(formData.get("DialCallStatus") ?? "");

  // If the call was answered and completed normally, just hang up
  if (dialCallStatus === "completed") {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  // Transfer failed (no-answer, busy, failed, canceled) — reconnect to AI
  if (!companyId || !callId) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  const runtimeUrl = process.env.VOICE_RUNTIME_TWILIO_STREAM_URL?.trim();
  if (!runtimeUrl) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  // Load settings for stream parameters
  const settings = await getAutoscuolaSettingsForCompany(companyId);

  const call = await prisma.autoscuolaVoiceCall.findFirst({
    where: { id: callId, companyId },
    select: {
      id: true,
      twilioCallSid: true,
      fromNumber: true,
      toNumber: true,
      line: { select: { id: true } },
      company: { select: { name: true } },
    },
  });

  if (!call) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  const voiceAllowedActions = (settings.voiceAllowedActions ?? ["faq", "lesson_info"]).join(",");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(runtimeUrl)}">
      <Parameter name="companyId" value="${escapeXml(companyId)}" />
      <Parameter name="companyName" value="${escapeXml(call.company?.name ?? "")}" />
      <Parameter name="lineId" value="${escapeXml(call.line?.id ?? "")}" />
      <Parameter name="callId" value="${escapeXml(callId)}" />
      <Parameter name="twilioCallSid" value="${escapeXml(call.twilioCallSid)}" />
      <Parameter name="from" value="${escapeXml(call.fromNumber ?? "")}" />
      <Parameter name="to" value="${escapeXml(call.toNumber ?? "")}" />
      <Parameter name="voiceBookingEnabled" value="${settings.voiceBookingEnabled ? "1" : "0"}" />
      <Parameter name="voiceAllowedActions" value="${escapeXml(voiceAllowedActions)}" />
      <Parameter name="voiceAssistantVoice" value="${escapeXml(settings.voiceAssistantVoice || "coral")}" />
      <Parameter name="voiceHandoffDuringCallEnabled" value="0" />
      <Parameter name="voiceHandoffDuringCallInstructions" value="" />
      <Parameter name="transferFailed" value="1" />
    </Stream>
  </Connect>
</Response>`;
  return xml(twiml);
}
