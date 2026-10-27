import { NextResponse } from "next/server";
import { startRoadSession } from "@/lib/autoscuole/road/service";

/** REG-638: entra in Road sulla guida (crea o riprende la sessione). */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await startRoadSession(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
