import { NextResponse } from "next/server";
import { updateAutoscuolaCaseStatus } from "@/lib/actions/autoscuole.actions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await updateAutoscuolaCaseStatus({
    caseId: id,
    status: payload.status,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
