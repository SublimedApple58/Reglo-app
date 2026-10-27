import { NextResponse } from "next/server";
import { getRoadFreeStartOptions, startFreeRoadSession } from "@/lib/autoscuole/road/service";

/** REG-638 Road libero: cosa serve al foglio «Avvia guida» (durate, veicoli, allievi recenti). */
export async function GET() {
  const res = await getRoadFreeStartOptions();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

/** REG-638 Road libero: crea la guida in agenda (adesso, già presente) e apre la sessione Road. */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await startFreeRoadSession(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
