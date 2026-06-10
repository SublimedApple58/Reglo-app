import { NextResponse } from "next/server";
import { updateStudentGroupLessonOptIn } from "@/lib/actions/autoscuole.actions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await updateStudentGroupLessonOptIn({
    studentId: id,
    optIn: Boolean(payload.optIn),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
