import { NextResponse } from "next/server";
import {
  getAutoscuolaLocations,
  createAutoscuolaLocation,
} from "@/lib/actions/autoscuola-locations.actions";

export async function GET() {
  const res = await getAutoscuolaLocations();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAutoscuolaLocation(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
