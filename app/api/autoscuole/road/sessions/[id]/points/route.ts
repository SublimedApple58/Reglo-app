import { NextResponse } from "next/server";
import { appendRoadPoints } from "@/lib/autoscuole/road/service";

/** REG-638: lotto di punti GPS `{ seq, points, street }` (idempotente su seq). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const res = await appendRoadPoints(id, payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
