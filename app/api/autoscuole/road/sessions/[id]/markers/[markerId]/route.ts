import { NextResponse } from "next/server";
import { removeRoadMarker } from "@/lib/autoscuole/road/service";

/** REG-638: «Annulla» una segnalazione (per id o clientId). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; markerId: string }> },
) {
  const { id, markerId } = await params;
  const res = await removeRoadMarker(id, markerId);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
