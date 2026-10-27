import { NextResponse } from "next/server";
import { setGroupLessonParticipantMoto } from "@/lib/actions/autoscuole.actions";

/**
 * REG-636 — change one participant's moto in a moto group lesson (mobile).
 * Body: `{ appointmentId, vehicleId | null, swapWithAppointmentId? }`.
 * `vehicleId: null` = "a rotazione"; a moto held by a sibling needs the
 * sibling's seat echoed in `swapWithAppointmentId` (confirmed swap).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();

  const res = await setGroupLessonParticipantMoto({
    groupLessonId: id,
    appointmentId: payload?.appointmentId ?? "",
    vehicleId: payload?.vehicleId ?? null,
    swapWithAppointmentId: payload?.swapWithAppointmentId ?? null,
  });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
