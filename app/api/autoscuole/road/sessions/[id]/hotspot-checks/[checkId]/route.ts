import { NextResponse } from "next/server";
import { removeRoadHotspotCheck } from "@/lib/autoscuole/road/service";

/** REG-677: «Annulla» un ripasso (per id o clientId). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; checkId: string }> },
) {
  const { id, checkId } = await params;
  const res = await removeRoadHotspotCheck(id, checkId);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
