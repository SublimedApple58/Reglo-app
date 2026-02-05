import { NextResponse } from "next/server";
import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";

export async function GET() {
  const res = await getAutoscuolaSettings();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function PATCH(request: Request) {
  const payload = await request.json();
  const res = await updateAutoscuolaSettings(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
