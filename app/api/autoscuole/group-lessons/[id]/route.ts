import { NextResponse } from "next/server";
import {
  cancelGroupLesson,
  getGroupLesson,
  updateGroupLesson,
} from "@/lib/actions/autoscuole.actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await getGroupLesson(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const res = await updateGroupLesson({ ...payload, groupLessonId: id });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await cancelGroupLesson(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
