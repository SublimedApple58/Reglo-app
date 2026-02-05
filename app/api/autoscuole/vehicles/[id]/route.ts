import { NextResponse } from "next/server";
import {
  updateAutoscuolaVehicle,
  deactivateAutoscuolaVehicle,
} from "@/lib/actions/autoscuole.actions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await updateAutoscuolaVehicle({ vehicleId: id, ...payload });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await deactivateAutoscuolaVehicle(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
