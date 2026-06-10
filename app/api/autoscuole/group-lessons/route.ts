import { NextResponse } from "next/server";
import {
  createGroupLesson,
  getGroupLessonsForAgenda,
} from "@/lib/actions/autoscuole.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await getGroupLessonsForAgenda({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createGroupLesson(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
