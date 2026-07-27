import { NextResponse } from "next/server";
import {
  deleteInstructorBlock,
  updateInstructorBlock,
} from "@/lib/actions/autoscuole.actions";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await deleteInstructorBlock(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const res = await updateInstructorBlock({ ...body, blockId: id });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
