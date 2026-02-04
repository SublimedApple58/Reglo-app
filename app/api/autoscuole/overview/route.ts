import { NextResponse } from "next/server";
import { getAutoscuolaOverview } from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getAutoscuolaOverview();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
