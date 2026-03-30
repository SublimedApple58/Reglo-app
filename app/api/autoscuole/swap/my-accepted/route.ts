import { NextResponse } from "next/server";
import { getMyAcceptedSwaps } from "@/lib/actions/autoscuole-swap.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const res = await getMyAcceptedSwaps({ studentId: studentId ?? "" });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
