import { NextResponse } from "next/server";
import { startExamSchedaSession } from "@/lib/actions/autoscuole-quiz.actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ schedaId: string }> },
) {
  const { schedaId } = await params;
  const res = await startExamSchedaSession({ schedaId });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
