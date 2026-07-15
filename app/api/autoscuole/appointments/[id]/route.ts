import { NextResponse } from "next/server";
import { updateAutoscuolaAppointmentDetails } from "@/lib/actions/autoscuole.actions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await updateAutoscuolaAppointmentDetails({
    appointmentId: id,
    lessonType: payload.lessonType,
    lessonTypes: payload.lessonTypes,
    rating: payload.rating,
    notes: payload.notes,
    locationId: payload.locationId,
    vehicleId: payload.vehicleId,
    extraMotoVehicleIds: payload.extraMotoVehicleIds,
    followVehicleId: payload.followVehicleId,
    instructorId: payload.instructorId,
    durationMin: payload.durationMin,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
