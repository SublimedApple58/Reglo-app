import { NextResponse } from "next/server";
import {
  getAutoscuolaInstructors,
  createAutoscuolaInstructor,
} from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getAutoscuolaInstructors();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaInstructor(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
