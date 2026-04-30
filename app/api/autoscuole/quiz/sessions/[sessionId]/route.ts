import { NextResponse } from "next/server";
import { getQuizSessionResult } from "@/lib/actions/autoscuole-quiz.actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const res = await getQuizSessionResult(sessionId);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
