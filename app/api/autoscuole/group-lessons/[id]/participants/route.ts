import { NextResponse } from "next/server";
import {
  addGroupLessonParticipant,
  removeGroupLessonParticipant,
} from "@/lib/actions/autoscuole.actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await addGroupLessonParticipant({
    groupLessonId: id,
    studentId: payload.studentId,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const res = await removeGroupLessonParticipant({
    groupLessonId: id,
    studentId: searchParams.get("studentId") ?? "",
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
