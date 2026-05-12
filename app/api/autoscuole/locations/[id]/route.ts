import { NextResponse } from "next/server";
import {
  updateAutoscuolaLocation,
  deleteAutoscuolaLocation,
} from "@/lib/actions/autoscuola-locations.actions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await updateAutoscuolaLocation({ id, ...payload });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await deleteAutoscuolaLocation({ id });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
