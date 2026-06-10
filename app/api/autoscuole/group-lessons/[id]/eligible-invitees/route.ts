import { NextResponse } from "next/server";
import { listEligibleGroupLessonInvitees } from "@/lib/actions/autoscuole.actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await listEligibleGroupLessonInvitees(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
