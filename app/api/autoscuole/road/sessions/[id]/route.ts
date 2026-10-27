import { NextResponse } from "next/server";
import { getRoadSessionDetail } from "@/lib/autoscuole/road/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getRoadSessionDetail(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
