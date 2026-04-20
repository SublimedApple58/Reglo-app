import { NextResponse } from "next/server";
import {
  createVoiceCallbackTask,
  resolveVoiceLineContextByNumber,
  upsertIncomingVoiceCall,
  verifyTelnyxSignature,
} from "@/lib/autoscuole/voice";
import {
  toStringMap,
} from "@/lib/autoscuole/voice-webhook";

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

const isWithinOfficeHours = (
  officeHours: {
    daysOfWeek: number[];
    startMinutes: number;
    endMinutes: number;
  } | null,
): boolean => {
  if (!officeHours) return true;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek =
    dayMap[parts.find((p) => p.type === "weekday")?.value ?? ""] ?? -1;
  const hour = parseInt(
    parts.find((p) => p.type === "hour")?.value ?? "0",
    10,
  );
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10,
  );
  const currentMinutes = hour * 60 + minute;
  if (!officeHours.daysOfWeek.includes(dayOfWeek)) return false;
  return (
    currentMinutes >= officeHours.startMinutes &&
    currentMinutes < officeHours.endMinutes
  );
};

const buildFallbackTwiml = ({
  message,
  handoffPhone,
  silent = false,
}: {
  message: string;
  handoffPhone?: string | null;
  silent?: boolean;
}) => {
  const safePhone = handoffPhone?.trim() ? escapeXml(handoffPhone.trim()) : null;
  if (silent) {
    return safePhone
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${safePhone}</Dial></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  }
  const safeMessage = escapeXml(message);
  if (safePhone) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">${safeMessage}</Say><Dial>${safePhone}</Dial></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">${safeMessage}</Say><Hangup/></Response>`;
};

export async function POST(request: Request) {
  // TeXML sends form-encoded payload just like TwiML
  const rawBody = await request.text();
  const formData = new URLSearchParams(rawBody);
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = value;
  }

  const validSignature = verifyTelnyxSignature(request, rawBody);

  if (!validSignature) {
    console.warn("[voice][telnyx][incoming] invalid signature", {
      to: payload.To ?? payload.Called ?? null,
      callSid: payload.CallSid ?? null,
    });
    return xml(
      buildFallbackTwiml({
        message: "Richiesta non valida. Contatta la segreteria autoscuola.",
      }),
    );
  }

  const rawIncoming = payload.To || payload.Called || payload.CalledVia || null;
  const sipMatch = rawIncoming?.match(/^sips?:([^@;,\s]+)/);
  const incomingNumber = sipMatch ? sipMatch[1] : rawIncoming;
  const fromNumber = payload.From || "";
  const callSid = payload.CallSid || "";
  if (!callSid) {
    return xml(
      buildFallbackTwiml({
        message: "Errore tecnico chiamata. Riprova tra qualche minuto.",
      }),
    );
  }

  const lineContext = await resolveVoiceLineContextByNumber(incomingNumber);
  if (!lineContext) {
    return xml(
      buildFallbackTwiml({
        message:
          "Numero non configurato per la segreteria automatica. Contatta l'autoscuola.",
      }),
    );
  }

  const call = await upsertIncomingVoiceCall({
    companyId: lineContext.companyId,
    lineId: lineContext.line.id,
    twilioCallSid: callSid,
    fromNumber,
    toNumber: incomingNumber ?? lineContext.line.twilioNumber,
    status: payload.CallStatus ?? "received",
  });

  const voiceEnabled =
    lineContext.settings.voiceFeatureEnabled &&
    lineContext.settings.voiceAssistantEnabled &&
    lineContext.settings.voiceProvisioningStatus === "ready";

  if (!voiceEnabled) {
    if (call.studentId == null) {
      await createVoiceCallbackTask({
        companyId: lineContext.companyId,
        callId: call.id,
        phoneNumber: fromNumber,
        reason: "feature_disabled_unknown_student",
      });
    }
    return xml(
      buildFallbackTwiml({
        message:
          "La segreteria automatica non è al momento disponibile. Ti trasferisco alla segreteria.",
        handoffPhone: lineContext.settings.voiceHandoffPhone,
      }),
    );
  }

  if (!isWithinOfficeHours(lineContext.settings.voiceOfficeHours)) {
    return xml(
      buildFallbackTwiml({
        message: "",
        handoffPhone: lineContext.settings.voiceHandoffPhone,
        silent: true,
      }),
    );
  }

  const runtimeUrl = process.env.VOICE_RUNTIME_TWILIO_STREAM_URL?.trim();
  if (!runtimeUrl) {
    if (call.studentId == null) {
      await createVoiceCallbackTask({
        companyId: lineContext.companyId,
        callId: call.id,
        phoneNumber: fromNumber,
        reason: "runtime_unavailable",
      });
    }
    return xml(
      buildFallbackTwiml({
        message:
          "La segreteria AI non è raggiungibile in questo momento. Ti richiamiamo appena possibile.",
        handoffPhone: lineContext.settings.voiceHandoffPhone,
      }),
    );
  }

  const legalGreeting = lineContext.settings.voiceLegalGreetingEnabled
    ? `<Say language="it-IT">${escapeXml(
        "Questa chiamata potrebbe essere registrata e analizzata da un assistente virtuale Reglo.",
      )}</Say>`
    : "";

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${legalGreeting}
  <Connect>
    <Stream url="${escapeXml(runtimeUrl)}">
      <Parameter name="companyId" value="${escapeXml(lineContext.companyId)}" />
      <Parameter name="companyName" value="${escapeXml(lineContext.companyName ?? "")}" />
      <Parameter name="lineId" value="${escapeXml(lineContext.line.id)}" />
      <Parameter name="callId" value="${escapeXml(call.id)}" />
      <Parameter name="twilioCallSid" value="${escapeXml(callSid)}" />
      <Parameter name="from" value="${escapeXml(fromNumber)}" />
      <Parameter name="to" value="${escapeXml(incomingNumber ?? "")}" />
      <Parameter name="voiceBookingEnabled" value="${lineContext.settings.voiceBookingEnabled ? "1" : "0"}" />
      <Parameter name="voiceAllowedActions" value="${escapeXml(
        lineContext.settings.voiceAllowedActions.join(","),
      )}" />
      <Parameter name="voiceAssistantVoice" value="${escapeXml(lineContext.settings.voiceAssistantVoice || "coral")}" />
      <Parameter name="voiceHandoffDuringCallEnabled" value="${lineContext.settings.voiceHandoffDuringCallEnabled ? "1" : "0"}" />
      <Parameter name="voiceHandoffDuringCallInstructions" value="${escapeXml(lineContext.settings.voiceHandoffDuringCallInstructions || "")}" />
    </Stream>
  </Connect>
</Response>`;
  return xml(twiml);
}
