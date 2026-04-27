import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAutoscuolaVoiceKnowledgeChunk,
  listAutoscuolaVoiceKnowledge,
} from "@/lib/autoscuole/voice";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";

const canManageVoice = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || isOwner(autoscuolaRole);

const createChunkSchema = z.object({
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(10).max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageVoice(membership.role, membership.autoscuolaRole)) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }
    const companyId = membership.companyId;
    const body = await request.json();
    const payload = createChunkSchema.parse(body);

    const chunk = await createAutoscuolaVoiceKnowledgeChunk({
      companyId,
      title: payload.title,
      content: payload.content,
      tags: payload.tags ?? [],
      active: payload.active ?? true,
    });

    return NextResponse.json({ success: true, data: chunk });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore creazione chunk.",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (!canManageVoice(membership.role, membership.autoscuolaRole)) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }
    const companyId = membership.companyId;
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const parsedActive =
      active == null ? undefined : active === "1" || active === "true";
    const limit = Number(searchParams.get("limit") ?? 50);

    const items = await listAutoscuolaVoiceKnowledge({
      companyId,
      active: parsedActive,
      limit,
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore caricamento knowledge.",
      },
      { status: 400 },
    );
  }
}
