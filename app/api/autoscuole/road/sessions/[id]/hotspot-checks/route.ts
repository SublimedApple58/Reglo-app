import { NextResponse } from "next/server";
import { addRoadHotspotCheck } from "@/lib/autoscuole/road/service";

/** REG-677: ripasso «Meglio / No» su un punto critico dell'allievo (idempotente su clientId). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const res = await addRoadHotspotCheck(id, payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
