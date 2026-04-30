import { NextResponse } from "next/server";
import { startQuizSession } from "@/lib/actions/autoscuole-quiz.actions";

export async function POST(request: Request) {
  const body = await request.json();
  const res = await startQuizSession(body);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
