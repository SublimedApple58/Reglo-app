import { NextResponse } from "next/server";
import { deleteInstructorBlock } from "@/lib/actions/autoscuole.actions";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await deleteInstructorBlock(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
