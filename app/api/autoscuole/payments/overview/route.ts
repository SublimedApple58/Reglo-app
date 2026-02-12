import { NextResponse } from "next/server";
import { getAutoscuolaPaymentsOverviewAction } from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getAutoscuolaPaymentsOverviewAction();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
