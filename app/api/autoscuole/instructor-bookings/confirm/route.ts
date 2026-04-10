import { NextResponse } from "next/server";
import { createAutoscuolaAppointment } from "@/lib/actions/autoscuole.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaAppointment({
    studentId: payload.studentId,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    instructorId: payload.instructorId,
    vehicleId: payload.vehicleId,
    type: payload.lessonType,
    sendProposal: false,
    skipWeeklyLimitCheck: payload.skipWeeklyLimitCheck === true,
  });
  if (!res.success && "code" in res && res.code === "WEEKLY_LIMIT_CONFIRM") {
    return NextResponse.json(res, { status: 200 });
  }
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
