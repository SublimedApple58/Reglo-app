import { NextResponse } from "next/server";
import { getRoadHistory } from "@/lib/autoscuole/road/service";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const res = await getRoadHistory({
    from: q.get("from"),
    to: q.get("to"),
    instructorId: q.get("instructorId"),
    studentId: q.get("studentId"),
    cursor: q.get("cursor"),
    limit: Number(q.get("limit") ?? 30),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
