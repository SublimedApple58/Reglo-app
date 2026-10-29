import { NextResponse } from "next/server";
import { snapRoadExamRoute } from "@/lib/autoscuole/road/exam-routes-service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const res = await snapRoadExamRoute(body);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
