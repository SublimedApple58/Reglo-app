import { NextResponse } from "next/server";
import { getQuizStudentStats } from "@/lib/actions/autoscuole-quiz.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId") ?? undefined;
  const res = await getQuizStudentStats(studentId);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
