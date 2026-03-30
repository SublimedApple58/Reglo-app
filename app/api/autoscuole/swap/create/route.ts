import { NextResponse } from "next/server";
import { createSwapOffer } from "@/lib/actions/autoscuole-swap.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createSwapOffer({
    appointmentId: payload.appointmentId,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
