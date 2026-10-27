import { NextResponse } from "next/server";
import { getRoadToday } from "@/lib/autoscuole/road/service";

export async function GET() {
  const res = await getRoadToday();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
