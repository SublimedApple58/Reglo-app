import { NextResponse } from "next/server";
import { z } from "zod";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import {
  STUDENT_BAND_KEYS,
  hasAnyBand,
  normalizeBandsByDay,
  type StudentBandKey,
} from "@/lib/autoscuole/student-availability";
import {
  getStudentAvailability,
  saveStudentAvailability,
} from "@/lib/autoscuole/student-availability-store";

/**
 * REG-802 — disponibilità dell'allievo a fasce, sempre le SUE (autoscuola attiva).
 *
 *   GET → { bands, days, confirmedAt, hasAvailability }
 *   PUT { days: { "1": ["evening"], "5": ["afternoon"] } } → stessa forma
 *
 * Giorni "0"=Dom … "6"=Sab; fasce `morning` | `afternoon` | `evening`. Serve
 * almeno una fascia. Lo staff le legge da `availability/default` (sola lettura).
 */
const bandKey = z.enum(STUDENT_BAND_KEYS as [StudentBandKey, ...StudentBandKey[]]);
const putSchema = z.object({
  days: z.record(z.string().regex(/^[0-6]$/), z.array(bandKey).max(STUDENT_BAND_KEYS.length)),
});

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
    const { days } = putSchema.parse(await request.json());
    const normalized = normalizeBandsByDay(days);
    if (!hasAnyBand(normalized)) {
      return NextResponse.json(
        { success: false, message: "Scegli almeno una fascia." },
        { status: 400 },
      );
    }
    const data = await saveStudentAvailability(membership.companyId, membership.userId, normalized);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
