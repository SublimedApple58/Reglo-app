import { NextResponse } from "next/server";
import { startRoadExamSession } from "@/lib/autoscuole/road/service";

/**
 * R4 Road Exam: avvia (o riprende) la registrazione del percorso di un esame.
 * Body `{ appointmentIds }` = le righe dell'esame (una per allievo).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { appointmentIds?: unknown } | null;
  const res = await startRoadExamSession({ appointmentIds: body?.appointmentIds });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
