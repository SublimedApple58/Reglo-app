import { NextResponse } from "next/server";
import {
  getHolidays,
  createHoliday,
  deleteHoliday,
} from "@/lib/actions/autoscuole-holidays.actions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const res = await getHolidays({ from, to });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createHoliday(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(request: Request) {
  const payload = await request.json();
  const res = await deleteHoliday(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
