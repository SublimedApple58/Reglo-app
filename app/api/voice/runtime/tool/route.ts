import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendVoiceCallTurn,
  createVoiceCallbackTask,
  getVoiceCompanyConfig,
  getVoiceStudentByPhone,
  searchAutoscuolaVoiceKnowledge,
  verifyRuntimeHmacSignature,
  verifyVoiceStudentDob,
} from "@/lib/autoscuole/voice";

const payloadSchema = z.object({
  companyId: z.string().uuid(),
  callId: z.string().uuid().optional(),
  tool: z.enum([
    "ping",
    "get_config",
    "find_student",
    "verify_student_dob",
    "create_callback",
    "log_turn",
    "search_knowledge",
  ]),
  input: z.record(z.string(), z.any()).optional(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-reglo-runtime-signature");
  const timestamp = request.headers.get("x-reglo-runtime-timestamp");
  const valid = verifyRuntimeHmacSignature({
    timestamp,
    signature,
    payload: rawBody,
  });

  if (!valid) {
    return NextResponse.json(
      { success: false, message: "Invalid runtime signature." },
      { status: 401 },
    );
  }

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const parsed = payloadSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const { companyId, tool, callId, input } = parsed.data;

  try {
    if (tool === "ping") {
      return NextResponse.json({
        success: true,
        data: { ok: true, ts: new Date().toISOString() },
      });
    }

    if (tool === "get_config") {
      const config = await getVoiceCompanyConfig({ companyId });
      return NextResponse.json({ success: true, data: config });
    }

    if (tool === "find_student") {
      const phoneNumber = typeof input?.phoneNumber === "string" ? input.phoneNumber : "";
      const student = await getVoiceStudentByPhone({ companyId, phoneNumber });
      return NextResponse.json({ success: true, data: { student } });
    }

    if (tool === "verify_student_dob") {
      const phoneNumber = typeof input?.phoneNumber === "string" ? input.phoneNumber : "";
      const dob = typeof input?.dob === "string" ? input.dob : "";
      const result = await verifyVoiceStudentDob({ companyId, phoneNumber, dob });
      return NextResponse.json({ success: true, data: result });
    }

    if (tool === "create_callback") {
      const phoneNumber = typeof input?.phoneNumber === "string" ? input.phoneNumber : "";
      const reason = typeof input?.reason === "string" ? input.reason : "callback_requested";
      if (!callId || !phoneNumber) {
        return NextResponse.json(
          { success: false, message: "callId e phoneNumber sono obbligatori." },
          { status: 400 },
        );
      }
      const task = await createVoiceCallbackTask({
        companyId,
        callId,
        phoneNumber,
        reason,
        studentId: typeof input?.studentId === "string" ? input.studentId : null,
      });
      return NextResponse.json({ success: true, data: { task } });
    }

    if (tool === "log_turn") {
      if (!callId) {
        return NextResponse.json(
          { success: false, message: "callId obbligatorio per log_turn." },
          { status: 400 },
        );
      }
      const speaker = typeof input?.speaker === "string" ? input.speaker : "assistant";
      const text = typeof input?.text === "string" ? input.text : "";
      if (!text.trim()) {
        return NextResponse.json(
          { success: false, message: "text obbligatorio per log_turn." },
          { status: 400 },
        );
      }
      const confidence =
        typeof input?.confidence === "number" && Number.isFinite(input.confidence)
          ? input.confidence
          : null;
      const turn = await appendVoiceCallTurn({
        callId,
        speaker,
        text,
        confidence,
      });
      return NextResponse.json({ success: true, data: { turn } });
    }

    if (tool === "search_knowledge") {
      const query = typeof input?.query === "string" ? input.query : "";
      const limit =
        typeof input?.limit === "number" && Number.isFinite(input.limit)
          ? input.limit
          : 8;
      const chunks = await searchAutoscuolaVoiceKnowledge({
        companyId,
        query,
        limit,
      });
      return NextResponse.json({ success: true, data: { chunks } });
    }

    return NextResponse.json(
      { success: false, message: "Tool non supportato." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore runtime tool.",
      },
      { status: 400 },
    );
  }
}
