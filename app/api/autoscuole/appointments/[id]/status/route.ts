import { NextResponse } from "next/server";
import { updateAutoscuolaAppointmentStatus } from "@/lib/actions/autoscuole.actions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await updateAutoscuolaAppointmentStatus({
    appointmentId: id,
    status: payload.status,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
