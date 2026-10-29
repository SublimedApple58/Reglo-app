import { NextResponse } from "next/server";
import { getRoadHeadquartersStatus } from "@/lib/autoscuole/road/service";

/** REG-655: la sede di Road manca? (foglio della sede sulla web, REG-656). */
export async function GET() {
  const res = await getRoadHeadquartersStatus();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
