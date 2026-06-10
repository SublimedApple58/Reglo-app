import { NextResponse } from "next/server";
import {
  getInstructorDrivingHours,
  getInstructorDrivingHoursRange,
} from "@/lib/actions/autoscuole.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instructorId = searchParams.get("instructorId") ?? undefined;

  // Range mode (mobile period selector): from/to inclusive YYYY-MM-DD.
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from && to) {
    const res = await getInstructorDrivingHoursRange({ instructorId, from, to });
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  }

  // Legacy week+month mode (web dashboard).
  const weekStart = searchParams.get("weekStart");
  if (!weekStart) {
    return NextResponse.json(
      { success: false, message: "weekStart is required" },
      { status: 400 },
    );
  }
  const res = await getInstructorDrivingHours({
    instructorId,
    weekStart,
    monthStart: searchParams.get("monthStart") ?? undefined,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
