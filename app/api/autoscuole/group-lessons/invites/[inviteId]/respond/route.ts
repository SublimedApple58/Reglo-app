import { NextResponse } from "next/server";
import { respondGroupLessonInvite } from "@/lib/actions/autoscuole-availability.actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const { inviteId } = await params;
  const payload = await request.json();
  const res = await respondGroupLessonInvite({
    inviteId,
    studentId: payload.studentId,
    response: payload.response,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
