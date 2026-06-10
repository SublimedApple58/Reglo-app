import { NextResponse } from "next/server";
import { getChaptersWithSchedeProgress } from "@/lib/actions/autoscuole-quiz.actions";

export async function GET() {
  const res = await getChaptersWithSchedeProgress();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
