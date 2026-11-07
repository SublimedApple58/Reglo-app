import { NextResponse } from "next/server";
import { getRoadStudentHistory } from "@/lib/autoscuole/road/service";

/** Ricca 8+9: ultime tracce dell'allievo per il tasto «Storico» in guida (tutti gli istruttori). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getRoadStudentHistory(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
