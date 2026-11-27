import { NextResponse } from "next/server";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import { studentAvailabilityInputSchema } from "@/lib/autoscuole/student-availability";
import {
  getStudentAvailability,
  resolveStudentAvailabilityInput,
  saveStudentAvailability,
} from "@/lib/autoscuole/student-availability-store";

/**
 * REG-802 — disponibilità dell'allievo a fasce, sempre le SUE (autoscuola attiva).
 *
 *   GET → { bands, days, ranges, rules, confirmedAt, hasAvailability }
 *   PUT { ranges: { "1": [{ startMinutes: 900, endMinutes: 1020 }] } } → stessa forma
 *   PUT { days: { "1": ["evening"] } }   (app fino al REG-802, solo fasce)
 *
 * Giorni "0"=Dom … "6"=Sab. REG-813: `ranges` sono gli orari veri (fasce
 * rapide o «un orario preciso», fino a due al giorno, passi da 30 minuti);
 * `days` resta per le app vecchie. Serve almeno un orario. Lo staff le legge da `availability/default` (sola lettura).
 */

const studentOnly = () =>
  NextResponse.json(
    { success: false, message: "Endpoint disponibile solo per gli allievi." },
    { status: 403 },
  );

export async function GET() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") return studentOnly();
    const data = await getStudentAvailability(membership.companyId, membership.userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") return studentOnly();
    const input = studentAvailabilityInputSchema.parse(await request.json());
    const resolved = await resolveStudentAvailabilityInput(membership.companyId, input);
    if (!resolved.ok) {
      return NextResponse.json({ success: false, message: resolved.message }, { status: 400 });
    }
    const data = await saveStudentAvailability(membership.companyId, membership.userId, resolved.ranges);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
