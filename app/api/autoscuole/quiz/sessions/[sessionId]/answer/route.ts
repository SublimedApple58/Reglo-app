import { NextResponse } from "next/server";
import { submitQuizAnswer } from "@/lib/actions/autoscuole-quiz.actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await request.json();
  const res = await submitQuizAnswer({ sessionId, ...body });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
