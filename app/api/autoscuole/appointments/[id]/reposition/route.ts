import { NextResponse } from "next/server";
import { cancelAndRepositionAutoscuolaAppointment } from "@/lib/actions/autoscuole.actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payload: { reason?: string } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const res = await cancelAndRepositionAutoscuolaAppointment({
    appointmentId: id,
    reason: payload.reason,
  });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
