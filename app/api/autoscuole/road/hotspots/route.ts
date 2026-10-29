import { NextResponse } from "next/server";
import { getRoadHotspots, type HotspotFilters } from "@/lib/autoscuole/road/hotspots-service";

const filtersFrom = (q: URLSearchParams): HotspotFilters => ({
  from: q.get("from"),
  to: q.get("to"),
  instructorId: q.get("instructorId"),
  license: q.get("license"),
  kind: q.get("kind"),
});

export async function GET(request: Request) {
  const res = await getRoadHotspots(filtersFrom(new URL(request.url).searchParams));
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
