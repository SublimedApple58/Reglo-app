import { NextResponse } from "next/server";
import { getExamSchedeProgress } from "@/lib/actions/autoscuole-quiz.actions";

export async function GET() {
  const res = await getExamSchedeProgress();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
