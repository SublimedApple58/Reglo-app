import { NextResponse } from "next/server";
import {
  checkVoiceAvailability,
  createVoiceAppointment,
  createVoiceCallbackTask,
  getVoiceStudentByPhone,
  searchAutoscuolaVoiceKnowledge,
  verifyTelnyxSignature,
  verifyVoiceStudentDob,
} from "@/lib/autoscuole/voice";
import { telnyxCallControl } from "@/lib/telnyx";

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

const SUPPORTED_TOOLS = new Set([
  "search_knowledge",
  "find_student",
  "verify_student_dob",
  "create_callback",
  "check_availability",
  "create_appointment",
  "transfer_call",
]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const validSignature = verifyTelnyxSignature(request, rawBody);
  if (!validSignature) {
    console.warn("[voice][telnyx][tools] invalid signature");
    return json({ success: false, message: "Invalid signature." }, 401);
  }

  // Tool name, companyId and callId arrive as query parameters
  // (substituted from dynamic_variables in the webhook URL).
  const url = new URL(request.url);
  const tool = url.searchParams.get("tool") ?? "";
  const companyId = url.searchParams.get("companyId") ?? "";
  const callId = url.searchParams.get("callId") ?? "";

  if (!tool || !SUPPORTED_TOOLS.has(tool)) {
    return json({ success: false, message: `Tool non supportato: ${tool}` }, 400);
  }

  if (!companyId) {
    return json({ success: false, message: "companyId mancante." }, 400);
  }

  // The request body contains only the tool parameters (body_parameters from tool definition)
  let input: Record<string, unknown> = {};
  try {
    input = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // body might be empty for some tools
  }

  try {
    switch (tool) {
      case "search_knowledge": {
        const query = typeof input.query === "string" ? input.query : "";
        const limit =
          typeof input.limit === "number" && Number.isFinite(input.limit)
            ? input.limit
            : 8;
        const chunks = await searchAutoscuolaVoiceKnowledge({
          companyId,
          query,
          limit,
        });
        return json({ success: true, data: { chunks } });
      }

      case "find_student": {
        const phoneNumber = typeof input.phoneNumber === "string" ? input.phoneNumber : "";
        const student = await getVoiceStudentByPhone({ companyId, phoneNumber });
        return json({ success: true, data: { student } });
      }

      case "verify_student_dob": {
        const phoneNumber = typeof input.phoneNumber === "string" ? input.phoneNumber : "";
        const dob = typeof input.dob === "string" ? input.dob : "";
        const result = await verifyVoiceStudentDob({ companyId, phoneNumber, dob });
        return json({ success: true, data: result });
      }

      case "create_callback": {
        const phoneNumber = typeof input.phoneNumber === "string" ? input.phoneNumber : "";
        const reason = typeof input.reason === "string" ? input.reason : "callback_requested";
        if (!callId || !phoneNumber) {
          return json(
            { success: false, message: "callId e phoneNumber sono obbligatori." },
            400,
          );
        }
        const task = await createVoiceCallbackTask({
          companyId,
          callId,
          phoneNumber,
          reason,
          studentId: typeof input.studentId === "string" ? input.studentId : null,
        });
        return json({ success: true, data: { task } });
      }

      case "check_availability": {
        const fromDate = typeof input.fromDate === "string" ? input.fromDate : "";
        const toDate = typeof input.toDate === "string" ? input.toDate : "";
        const availability = await checkVoiceAvailability({ companyId, fromDate, toDate });
        return json({ success: true, data: availability });
      }

      case "create_appointment": {
        const studentId = typeof input.studentId === "string" ? input.studentId : "";
        const date = typeof input.date === "string" ? input.date : "";
        const startTime = typeof input.startTime === "string" ? input.startTime : "";
        if (!studentId || !date || !startTime) {
          return json(
            { success: false, message: "studentId, date e startTime sono obbligatori." },
            400,
          );
        }
        const appointment = await createVoiceAppointment({ companyId, studentId, date, startTime });
        return json({ success: true, data: { appointment } });
      }

      case "transfer_call": {
        if (!callId) {
          return json({ success: false, message: "callId mancante." }, 400);
        }
        const { prisma } = await import("@/db/prisma");
        const call = await prisma.autoscuolaVoiceCall.findFirst({
          where: { id: callId, companyId },
          select: { twilioCallSid: true },
        });
        if (!call?.twilioCallSid) {
          return json({ success: false, message: "Chiamata non trovata." }, 400);
        }
        // Get handoff phone from company service limits
        const service = await prisma.companyService.findFirst({
          where: { companyId, serviceKey: "AUTOSCUOLE" },
          select: { limits: true },
        });
        const limits = (service?.limits ?? {}) as Record<string, unknown>;
        const handoffPhone = (typeof limits.voiceHandoffPhone === "string" ? limits.voiceHandoffPhone : "").trim();
        if (!handoffPhone) {
          return json({ success: false, message: "Numero di trasferimento non configurato." }, 400);
        }
        console.log(`[voice][telnyx][tools] transfer_call: callControlId=${call.twilioCallSid}, to=${handoffPhone}`);
        // Stop AI assistant first, then transfer
        try {
          await telnyxCallControl(call.twilioCallSid, "ai_assistant_stop", {});
        } catch (err) {
          console.warn("[voice][telnyx][tools] ai_assistant_stop warning:", err);
        }
        await telnyxCallControl(call.twilioCallSid, "transfer", { to: handoffPhone });
        return json({ success: true, data: { transferred: true, to: handoffPhone } });
      }

      default:
        return json({ success: false, message: "Tool non supportato." }, 400);
    }
  } catch (error) {
    console.error(`[voice][telnyx][tools] ${tool} error:`, error);
    return json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore esecuzione tool.",
      },
      400,
    );
  }
}
