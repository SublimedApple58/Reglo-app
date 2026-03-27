import { NextResponse } from "next/server";
import { setRecurringAvailabilityOverride } from "@/lib/actions/autoscuole-availability.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await setRecurringAvailabilityOverride(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
