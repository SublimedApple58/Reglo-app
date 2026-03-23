import { NextResponse } from "next/server";
import { getDefaultAvailability } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await getDefaultAvailability({
    ownerType: searchParams.get("ownerType") as
      | "student"
      | "instructor"
      | "vehicle",
    ownerId: searchParams.get("ownerId") ?? "",
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
