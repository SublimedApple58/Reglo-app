import { NextResponse } from "next/server";
import { getAutoscuolaDeadlines } from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getAutoscuolaDeadlines();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
