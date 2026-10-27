import { NextResponse } from "next/server";
import { addRoadMarker } from "@/lib/autoscuole/road/service";

/** REG-638: segnalazione sul punto (idempotente su clientId). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const res = await addRoadMarker(id, payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
