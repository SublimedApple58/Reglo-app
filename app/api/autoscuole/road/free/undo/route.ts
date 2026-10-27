import { NextResponse } from "next/server";
import { undoFreeRoadSession } from "@/lib/autoscuole/road/service";

/** REG-638 Road: «Annulla» nei primi secondi di una guida avviata da Road. */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await undoFreeRoadSession(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
