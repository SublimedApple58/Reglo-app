import { NextResponse } from "next/server";
import { getAppointmentEvaluation } from "@/lib/actions/autoscuole-evaluation.actions";

// Pagellino di una guida per l'app istruttore: interruttore + voci + punteggi
// già dati, in una sola chiamata all'apertura del foglio "Dettagli guida".
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await getAppointmentEvaluation(id);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
