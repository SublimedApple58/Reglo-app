import { NextResponse } from "next/server";
import { inviteToGroupLesson } from "@/lib/actions/autoscuole-availability.actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const res = await inviteToGroupLesson({
    groupLessonId: id,
    expiresInHours: payload?.expiresInHours,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
