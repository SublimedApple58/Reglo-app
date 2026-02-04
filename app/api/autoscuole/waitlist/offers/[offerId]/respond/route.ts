import { NextResponse } from "next/server";
import { respondWaitlistOffer } from "@/lib/actions/autoscuole-availability.actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params;
  const payload = await request.json();
  const res = await respondWaitlistOffer({
    offerId,
    studentId: payload.studentId,
    response: payload.response,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
