import { NextResponse } from "next/server";
import { getGroupLessonInvites } from "@/lib/actions/autoscuole-availability.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const res = await getGroupLessonInvites({
    studentId: searchParams.get("studentId") ?? "",
    limit: limitRaw ? Number(limitRaw) : undefined,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
