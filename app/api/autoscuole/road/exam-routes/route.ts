import { NextResponse } from "next/server";
import {
  createRoadExamRoute,
  listRoadExamRoutes,
  listRoadExamRoutesByExaminer,
} from "@/lib/autoscuole/road/exam-routes-service";

/** `?by=examiner` (R4b): gruppi per esaminatore invece della lista piatta. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("by") === "examiner") {
    const grouped = await listRoadExamRoutesByExaminer();
    return NextResponse.json(grouped, { status: grouped.success ? 200 : 400 });
  }
  const archived = params.get("archived") === "1";
  const res = await listRoadExamRoutes({ archived });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const res = await createRoadExamRoute(body);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
