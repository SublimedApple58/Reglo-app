import { NextResponse } from "next/server";
import { approveAvailabilityOverride } from "@/lib/actions/autoscuole-availability.actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await approveAvailabilityOverride({ appointmentId: id });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
