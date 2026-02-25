import { NextResponse } from "next/server";
import { z } from "zod";
import {
  updateAutoscuolaVoiceKnowledgeChunk,
} from "@/lib/autoscuole/voice";
import { requireServiceAccess } from "@/lib/service-access";

const canManageVoice = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || autoscuolaRole === "OWNER";

const updateChunkSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    content: z.string().trim().min(10).max(20000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.tags !== undefined ||
      value.active !== undefined,
    { message: "Nessun campo da aggiornare." },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageVoice(membership.role, membership.autoscuolaRole)) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }
    const companyId = membership.companyId;
    const params = await context.params;
    const chunkId = params.id?.trim();
    if (!chunkId) {
      return NextResponse.json(
        { success: false, message: "Chunk ID mancante." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const payload = updateChunkSchema.parse(body);
    const chunk = await updateAutoscuolaVoiceKnowledgeChunk({
      companyId,
      chunkId,
      title: payload.title,
      content: payload.content,
      tags: payload.tags,
      active: payload.active,
    });
    return NextResponse.json({ success: true, data: chunk });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore aggiornamento chunk.",
      },
      { status: 400 },
    );
  }
}
