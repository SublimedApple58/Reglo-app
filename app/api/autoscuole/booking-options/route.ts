import { NextResponse } from "next/server";
import { getBookingOptions } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const res = await getBookingOptions({
    studentId: studentId ?? "",
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
