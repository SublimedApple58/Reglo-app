import { NextResponse } from "next/server";
import {
  getAutoscuolaVoiceCallDetails,
} from "@/lib/autoscuole/voice";
import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";

const canManageVoice = (role: string, autoscuolaRole: string | null) =>
  role === "admin" || isOwner(autoscuolaRole);

export async function GET(
  _request: Request,
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
    const callId = params.id?.trim();
    if (!callId) {
      return NextResponse.json(
        { success: false, message: "Call ID mancante." },
        { status: 400 },
      );
    }

    const call = await getAutoscuolaVoiceCallDetails({
      companyId,
      callId,
    });

    if (!call) {
      return NextResponse.json(
        { success: false, message: "Chiamata non trovata." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: call });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore dettaglio chiamata.",
      },
      { status: 400 },
    );
  }
}
