import { NextResponse } from "next/server";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import {
  getStudentAvailabilityStepMode,
  snoozeStudentAvailability,
} from "@/lib/autoscuole/student-availability-store";

/**
 * REG-802 — «Configura in seguito» sullo step Disponibilità. Vale solo per chi
 * NON è ancora in fase guide: in fase guide lo step è bloccante e il rinvio
 * viene rifiutato (lo stesso criterio di `onboarding.steps` in `/me`).
 */
export async function POST() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") {
      return NextResponse.json(
        { success: false, message: "Endpoint disponibile solo per gli allievi." },
        { status: 403 },
      );
    }
    const now = new Date();
    // Il rinvio in corso non conta: si può rimandare di nuovo.
    const mode = await getStudentAvailabilityStepMode(
      { ...membership, availabilityPromptSnoozedUntil: null },
      now,
    );
    if (mode === "required") {
      return NextResponse.json(
        { success: false, message: "Per continuare indica quando puoi fare guida." },
        { status: 409 },
      );
    }
    const data = await snoozeStudentAvailability(membership.companyId, membership.userId, now);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
