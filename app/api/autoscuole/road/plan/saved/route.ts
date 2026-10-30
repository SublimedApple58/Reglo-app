import { NextResponse } from "next/server";
import { deleteSavedRoadPlan, getSavedRoadPlan, saveRoadPlan } from "@/lib/autoscuole/road/saved-plan-service";

/** REG-668: il giro modificato di una guida futura. `?appointmentId`; PUT body `{ appointmentId, stops, minutes }`. */
export async function GET(request: Request) {
  const res = await getSavedRoadPlan({ appointmentId: new URL(request.url).searchParams.get("appointmentId") });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function PUT(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await saveRoadPlan(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(request: Request) {
  const res = await deleteSavedRoadPlan({ appointmentId: new URL(request.url).searchParams.get("appointmentId") });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
