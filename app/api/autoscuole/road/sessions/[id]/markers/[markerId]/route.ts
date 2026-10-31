import { NextResponse } from "next/server";
import { removeRoadMarker, updateRoadMarker } from "@/lib/autoscuole/road/service";

/** REG-638: «Annulla» una segnalazione (per id o clientId). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; markerId: string }> },
) {
  const { id, markerId } = await params;
  const res = await removeRoadMarker(id, markerId);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

/** REG-696: correggere una segnalazione (giudizio, posizione, nota). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; markerId: string }> },
) {
  const { id, markerId } = await params;
  const body = await request.json().catch(() => null);
  const res = await updateRoadMarker(id, markerId, body ?? {});
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
