import { NextResponse } from "next/server";
import { getRoadPlanRoute } from "@/lib/autoscuole/road/plan-service";

/** REG-648: la linea suggerita sulle strade vere, chiesta una volta alla partenza. Body `{ start: {lat,lng}, stops }`. */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await getRoadPlanRoute(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
