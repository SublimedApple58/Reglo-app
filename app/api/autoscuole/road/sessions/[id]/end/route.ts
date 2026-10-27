import { NextResponse } from "next/server";
import { endRoadSession } from "@/lib/autoscuole/road/service";

/** REG-638: «Termina guida» — chiude la sessione e segna la guida completata. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await endRoadSession(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
