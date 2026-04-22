import { NextResponse } from "next/server";
import { instructorSwapAppointments } from "@/lib/actions/autoscuole-swap.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await instructorSwapAppointments({
    appointmentIdA: payload.appointmentIdA,
    appointmentIdB: payload.appointmentIdB,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
