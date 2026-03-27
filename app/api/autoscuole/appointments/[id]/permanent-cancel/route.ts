import { NextResponse } from "next/server";
import { permanentlyCancelAutoscuolaAppointment } from "@/lib/actions/autoscuole.actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await permanentlyCancelAutoscuolaAppointment({ appointmentId: id });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
