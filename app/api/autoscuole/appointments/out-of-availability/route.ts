import { NextResponse } from "next/server";
import { getOutOfAvailabilityAppointments } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instructorId = searchParams.get("instructorId") ?? undefined;
  const res = await getOutOfAvailabilityAppointments({ instructorId });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
