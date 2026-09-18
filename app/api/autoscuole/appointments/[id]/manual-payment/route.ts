import { NextResponse } from "next/server";
import { setManualPaymentStatus } from "@/lib/actions/autoscuole.actions";

/**
 * REG-450 — tracciamento pagamento manuale di una guida, per l'app mobile.
 *
 * Il web usa direttamente la server action `setManualPaymentStatus` dal
 * dettaglio allievo; il mobile ha bisogno di una route HTTP. Questo è un
 * wrapper sottile: permessi, guardia "solo le tue guide" per l'istruttore e
 * rifiuto dei pagamenti automatici Stripe stanno tutti dentro l'azione, così la
 * regola non può divergere tra web e app.
 *
 * PATCH  { status: "paid" | "unpaid" | null }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await setManualPaymentStatus({
    appointmentId: id,
    status: payload?.status ?? null,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
