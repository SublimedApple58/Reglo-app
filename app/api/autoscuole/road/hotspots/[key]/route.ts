import { NextResponse } from "next/server";
import { getRoadHotspotDetail } from "@/lib/autoscuole/road/hotspots-service";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const q = new URL(request.url).searchParams;
  const res = await getRoadHotspotDetail(decodeURIComponent(key), {
    from: q.get("from"),
    to: q.get("to"),
    instructorId: q.get("instructorId"),
    license: q.get("license"),
    kind: q.get("kind"),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
