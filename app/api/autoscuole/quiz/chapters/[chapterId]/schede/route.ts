import { NextResponse } from "next/server";
import { getChapterSchede } from "@/lib/actions/autoscuole-quiz.actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;
  const res = await getChapterSchede(chapterId);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
