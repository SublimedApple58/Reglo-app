import { NextResponse } from "next/server";
import { getRoadForStudent } from "@/lib/autoscuole/road/service";

/** REG-638: percorsi Road delle guide di un allievo (titolare: tutte; istruttore: le sue). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getRoadForStudent(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
