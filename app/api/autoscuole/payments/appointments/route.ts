import { NextResponse } from "next/server";
import { getAutoscuolaPaymentsAppointmentsAction } from "@/lib/actions/autoscuole.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : 100;

  const res = await getAutoscuolaPaymentsAppointmentsAction(
    Number.isFinite(limit) ? limit : 100,
  );

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
