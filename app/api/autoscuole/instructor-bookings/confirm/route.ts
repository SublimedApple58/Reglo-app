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
    followVehicleId: payload.followVehicleId ?? null,
    extraMotoVehicleIds: payload.extraMotoVehicleIds ?? undefined,
    locationId: payload.locationId,
    type: payload.lessonType,
    types: payload.types,
    skipWeeklyLimitCheck: payload.skipWeeklyLimitCheck === true,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
