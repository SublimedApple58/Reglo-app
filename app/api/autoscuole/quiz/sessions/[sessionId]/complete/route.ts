import { NextResponse } from "next/server";
import { completeQuizSession } from "@/lib/actions/autoscuole-quiz.actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const res = await completeQuizSession({ sessionId });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
