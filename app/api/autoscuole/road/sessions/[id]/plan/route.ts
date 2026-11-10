import { NextResponse } from "next/server";
import { setRoadSessionExamRoute } from "@/lib/autoscuole/road/service";

/**
 * R4c «Prova il percorso»: a guida in corso mette nel giro un percorso d'esame.
 * Body `{ examRouteId }`; `null` lo toglie.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { examRouteId?: unknown } | null;
  const res = await setRoadSessionExamRoute(id, { examRouteId: body?.examRouteId ?? null });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
