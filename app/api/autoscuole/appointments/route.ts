import { NextResponse } from "next/server";
import {
  getAutoscuolaAppointments,
  createAutoscuolaAppointment,
} from "@/lib/actions/autoscuole.actions";

export async function GET() {
  const res = await getAutoscuolaAppointments();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaAppointment(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
