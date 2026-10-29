import { NextResponse } from "next/server";
import { archiveRoadExamRoute, updateRoadExamRoute } from "@/lib/autoscuole/road/exam-routes-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const res = await updateRoadExamRoute(id, body);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

/** Archivia il percorso (non lo cancella). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await archiveRoadExamRoute(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
