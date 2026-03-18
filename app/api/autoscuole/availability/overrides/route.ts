import { NextResponse } from "next/server";
import {
  setWeeklyAvailabilityOverride,
  deleteWeeklyAvailabilityOverride,
  getWeeklyAvailabilityOverrides,
} from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ownerType = searchParams.get("ownerType") as "instructor" | "vehicle" | null;
  const ownerId = searchParams.get("ownerId");
  if (!ownerType || !ownerId) {
    return NextResponse.json({ success: false, message: "ownerType and ownerId are required" }, { status: 400 });
  }
  const res = await getWeeklyAvailabilityOverrides({
    ownerType,
    ownerId,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const res = await setWeeklyAvailabilityOverride(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(request: Request) {
  const payload = await request.json();
  const res = await deleteWeeklyAvailabilityOverride(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
