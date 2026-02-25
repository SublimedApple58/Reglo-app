import { NextResponse } from "next/server";
import {
  getAutoscuolaVoiceCalls,
} from "@/lib/autoscuole/voice";
import { requireServiceAccess } from "@/lib/service-access";

const canManageVoice = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || autoscuolaRole === "OWNER";

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
    const status = searchParams.get("status")?.trim() || null;
    const cursor = searchParams.get("cursor");
    const limit = Number(searchParams.get("limit") ?? 20);

    const data = await getAutoscuolaVoiceCalls({
      companyId,
      status,
      cursor,
      limit,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore caricamento chiamate.",
      },
      { status: 400 },
    );
  }
}
