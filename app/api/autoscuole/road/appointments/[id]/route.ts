import { NextResponse } from "next/server";
import { getRoadForAppointment } from "@/lib/autoscuole/road/service";

/** REG-638: percorso e segnalazioni di una guida (allievo: solo se l'autoscuola lo consente). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getRoadForAppointment(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
