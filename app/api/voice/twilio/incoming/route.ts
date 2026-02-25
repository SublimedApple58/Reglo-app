import { NextResponse } from "next/server";
import {
  createVoiceCallbackTask,
  resolveVoiceLineContextByNumber,
  upsertIncomingVoiceCall,
  verifyTwilioRequestSignature,
} from "@/lib/autoscuole/voice";

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

const buildFallbackTwiml = ({
  message,
  handoffPhone,
}: {
  message: string;
  handoffPhone?: string | null;
}) => {
  const safeMessage = escapeXml(message);
  const safePhone = handoffPhone?.trim() ? escapeXml(handoffPhone.trim()) : null;
  if (safePhone) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">${safeMessage}</Say><Dial>${safePhone}</Dial></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="it-IT">${safeMessage}</Say><Hangup/></Response>`;
};

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
  const signature = request.headers.get("x-twilio-signature");
  const validSignature = verifyTwilioRequestSignature({
    requestUrl: resolvePublicRequestUrl(request),
    payload,
    signature,
  });

  if (!validSignature) {
    return xml(
      buildFallbackTwiml({
        message: "Richiesta non valida. Contatta la segreteria autoscuola.",
      }),
    );
  }

  const incomingNumber = payload.To || payload.Called || payload.CalledVia || null;
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

  const greeting =
    "Questa chiamata potrebbe essere registrata e analizzata da un assistente virtuale Reglo.";

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="it-IT">${escapeXml(greeting)}</Say>
  <Connect>
    <Stream url="${escapeXml(runtimeUrl)}">
      <Parameter name="companyId" value="${escapeXml(lineContext.companyId)}" />
      <Parameter name="lineId" value="${escapeXml(lineContext.line.id)}" />
      <Parameter name="callId" value="${escapeXml(call.id)}" />
      <Parameter name="twilioCallSid" value="${escapeXml(callSid)}" />
      <Parameter name="from" value="${escapeXml(fromNumber)}" />
      <Parameter name="to" value="${escapeXml(incomingNumber ?? "")}" />
      <Parameter name="voiceBookingEnabled" value="${lineContext.settings.voiceBookingEnabled ? "1" : "0"}" />
      <Parameter name="voiceAllowedActions" value="${escapeXml(
        lineContext.settings.voiceAllowedActions.join(","),
      )}" />
    </Stream>
  </Connect>
</Response>`;
  return xml(twiml);
}
