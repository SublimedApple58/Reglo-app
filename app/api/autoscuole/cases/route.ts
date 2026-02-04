import { NextResponse } from "next/server";
import {
  getAutoscuolaCases,
  createAutoscuolaCase,
} from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getAutoscuolaCases();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaCase(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
