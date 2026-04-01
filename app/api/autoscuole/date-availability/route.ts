import { NextResponse } from "next/server";
import { getDateAvailabilityMap } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const res = await getDateAvailabilityMap({ studentId, from, to });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
