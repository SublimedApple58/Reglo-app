import { NextResponse } from "next/server";
import { getQuizStudentsOverview } from "@/lib/actions/autoscuole-quiz.actions";

export async function GET() {
  const res = await getQuizStudentsOverview();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
