import { NextResponse } from "next/server";
import { buildLiveSnapshot } from "@/lib/aula/live-public";

// Stato del quiz live (polled ~1.5s da studente e console docente).
// Pubblica, no auth. Passa ?participantId=... per ricevere l'esito personale.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { searchParams } = new URL(request.url);
  const participantId = searchParams.get("participantId") ?? undefined;

  const snapshot = await buildLiveSnapshot(code, participantId);
  if (!snapshot) {
    return NextResponse.json(
      { success: false, message: "SESSION_NOT_FOUND" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: snapshot });
}
