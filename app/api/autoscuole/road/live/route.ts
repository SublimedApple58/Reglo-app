import { NextResponse } from "next/server";
import { getRoadLive } from "@/lib/autoscuole/road/service";

/** REG-638: auto in guida adesso (web «Dal vivo», polling). */
export async function GET() {
  const res = await getRoadLive();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
