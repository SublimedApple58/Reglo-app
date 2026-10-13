import { NextResponse } from "next/server";
import { checkAutoscuolaAppointmentBatch } from "@/lib/actions/autoscuole.actions";

/**
 * Prova a vuoto della prenotazione multipla per l'app istruttore (REG-615).
 *
 * Non scrive niente: dice quali date si possono creare, perche' le altre no e
 * quali auto al seguito sono libere in ciascuno slot problematico — quel che
 * serve al foglio "Auto al seguito occupata". L'azione, da sola, limita un
 * istruttore alla propria agenda.
 *
 * `entries[].followVehicleId` ha tre stati che NON vanno appiattiti: assente =
 * eredita l'auto condivisa, `null` = nessuna auto, id = quell'auto. Per questo
 * le entries si passano cosi' come arrivano.
 */
export async function POST(request: Request) {
  const payload = await request.json();
  const res = await checkAutoscuolaAppointmentBatch({
    instructorId: payload.instructorId,
    vehicleId: payload.vehicleId ?? null,
    followVehicleId: payload.followVehicleId ?? null,
    extraMotoVehicleIds: payload.extraMotoVehicleIds ?? undefined,
    entries: payload.entries,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
