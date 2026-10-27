import { NextResponse } from "next/server";
import { getRoadTrackDelta } from "@/lib/autoscuole/road/service";

/** REG-638: punti nuovi dopo `afterSeq` (mappa «Dal vivo»). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const afterSeq = Number(new URL(request.url).searchParams.get("afterSeq") ?? "-1");
  const res = await getRoadTrackDelta(id, afterSeq);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
