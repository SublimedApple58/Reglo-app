import { NextResponse } from "next/server";
import {
  getAutoscuolaStudents,
  createAutoscuolaStudent,
} from "@/lib/actions/autoscuole.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const res = await getAutoscuolaStudents(search);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaStudent(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
