import { NextResponse } from "next/server";
import { getRoadPlan } from "@/lib/autoscuole/road/plan-service";

/** REG-648: il giro proposto per allievo e durata (+ i suoi punti critici). `?studentId&durationMin&lat&lng`. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const res = await getRoadPlan({
    studentId: q.get("studentId"),
    durationMin: q.get("durationMin"),
    lat: q.get("lat"),
    lng: q.get("lng"),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
