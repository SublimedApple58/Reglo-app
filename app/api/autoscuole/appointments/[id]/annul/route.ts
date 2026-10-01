import { NextResponse } from "next/server";
import { annulAutoscuolaAppointment } from "@/lib/actions/autoscuole.actions";

/**
 * "Annulla guida" per lo staff dal mobile (REG-587) — stesso percorso del web:
 * rilascia gli slot, notifica l'allievo e applica la regola del preavviso in
 * base a `fault` ("student" = vale la penale, "school" = imprevisto nostro,
 * nessuna penale). L'istruttore non titolare non decide l'esito economico:
 * l'action forza `defer`, cioè la coda "Cancellazioni tardive" del titolare.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const res = await annulAutoscuolaAppointment({
    appointmentId: id,
    fault: body?.fault,
    lateOutcome: body?.lateOutcome,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
