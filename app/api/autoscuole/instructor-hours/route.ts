import { NextResponse } from "next/server";
import { getInstructorDrivingHours } from "@/lib/actions/autoscuole.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");
  if (!weekStart) {
    return NextResponse.json(
      { success: false, message: "weekStart is required" },
      { status: 400 },
    );
  }
  const res = await getInstructorDrivingHours({
    instructorId: searchParams.get("instructorId") ?? undefined,
    weekStart,
    monthStart: searchParams.get("monthStart") ?? undefined,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
