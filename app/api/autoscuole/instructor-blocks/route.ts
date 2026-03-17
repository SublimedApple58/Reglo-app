import { NextResponse } from "next/server";
import { createInstructorBlock } from "@/lib/actions/autoscuole.actions";

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createInstructorBlock(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
