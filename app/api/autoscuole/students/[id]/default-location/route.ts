import { NextResponse } from "next/server";
import { setStudentDefaultLocation } from "@/lib/actions/autoscuole.actions";

// PATCH /api/autoscuole/students/:id/default-location  { locationId: string | null }
// Imposta (o azzera con null) il luogo di default dell'allievo da mobile
// (istruttore/titolare) — permessi enforced dentro l'action. REG-392.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const locationId =
    typeof payload.locationId === "string" ? payload.locationId : null;
  const res = await setStudentDefaultLocation({ studentId: id, locationId });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
