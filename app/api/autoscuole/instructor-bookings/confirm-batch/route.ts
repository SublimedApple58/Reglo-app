import { NextResponse } from "next/server";
import { createAutoscuolaAppointmentBatch } from "@/lib/actions/autoscuole.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaAppointmentBatch({
    studentId: payload.studentId,
    instructorId: payload.instructorId,
    vehicleId: payload.vehicleId,
    entries: payload.entries,
    type: payload.lessonType,
    types: payload.types,
    skipWeeklyLimitCheck: payload.skipWeeklyLimitCheck === true,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
