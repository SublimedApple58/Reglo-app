import { NextResponse } from "next/server";
import { updateDefaultAutoscuolaLocation } from "@/lib/actions/autoscuola-locations.actions";

export async function PUT(request: Request) {
  const payload = await request.json();
  const res = await updateDefaultAutoscuolaLocation(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
