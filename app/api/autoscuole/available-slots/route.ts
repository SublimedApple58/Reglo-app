import { NextResponse } from "next/server";
import { getAllAvailableSlots } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId") ?? "";
  const date = searchParams.get("date") ?? "";
  const durationMinutes = Number(searchParams.get("durationMinutes") ?? "60");
  const lessonType = searchParams.get("lessonType") || undefined;
  const instructorId = searchParams.get("instructorId") || undefined;

  const res = await getAllAvailableSlots({
    studentId,
    date,
    durationMinutes,
    lessonType,
    instructorId,
  });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
