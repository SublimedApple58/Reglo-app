import { NextResponse } from "next/server";
import { suggestInstructorBooking } from "@/lib/actions/autoscuole-availability.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await suggestInstructorBooking({
    studentId: payload.studentId,
    preferredDate: payload.preferredDate,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
