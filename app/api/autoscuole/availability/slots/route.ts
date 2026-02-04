import { NextResponse } from "next/server";
import {
  createAvailabilitySlots,
  getAvailabilitySlots,
} from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await getAvailabilitySlots({
    ownerType: (searchParams.get("ownerType") as
      | "student"
      | "instructor"
      | "vehicle"
      | null) ?? undefined,
    ownerId: searchParams.get("ownerId") ?? undefined,
    date: searchParams.get("date") ?? undefined,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await createAvailabilitySlots(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
