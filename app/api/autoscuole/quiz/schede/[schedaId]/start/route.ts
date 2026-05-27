import { NextResponse } from "next/server";
import { startSchedaSession } from "@/lib/actions/autoscuole-quiz.actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ schedaId: string }> },
) {
  const { schedaId } = await params;
  const res = await startSchedaSession({ schedaId });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
