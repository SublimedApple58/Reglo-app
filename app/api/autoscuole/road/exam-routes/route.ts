import { NextResponse } from "next/server";
import { createRoadExamRoute, listRoadExamRoutes } from "@/lib/autoscuole/road/exam-routes-service";

export async function GET(request: Request) {
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  const res = await listRoadExamRoutes({ archived });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const res = await createRoadExamRoute(body);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
