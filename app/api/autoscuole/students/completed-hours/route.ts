import { NextResponse } from "next/server";
import { getStudentsCompletedDrivingMinutes } from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getStudentsCompletedDrivingMinutes();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
