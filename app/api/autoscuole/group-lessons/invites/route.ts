import { NextResponse } from "next/server";
import { getGroupLessonInvites } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const countOnlyRaw = searchParams.get("countOnly");
  const res = await getGroupLessonInvites({
    studentId: searchParams.get("studentId") ?? "",
    limit: limitRaw ? Number(limitRaw) : undefined,
    countOnly: countOnlyRaw === "1" || countOnlyRaw === "true",
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
