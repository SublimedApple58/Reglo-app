import { NextResponse } from "next/server";
import { getRoadState } from "@/lib/autoscuole/road/service";

/** REG-638: stato Road per la mobile (modulo attivo, catalogo, sessione attiva, guida in orario). */
export async function GET() {
  const res = await getRoadState();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
