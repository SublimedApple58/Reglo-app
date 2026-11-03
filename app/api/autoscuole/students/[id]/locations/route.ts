import { NextResponse } from "next/server";
import { setStudentLocations } from "@/lib/actions/autoscuole-student-locations.actions";

// PUT /api/autoscuole/students/:id/locations  { locationIds: string[] }
// Sostituisce i luoghi dell'allievo da mobile (istruttore/titolare); lista
// vuota = tutti i luoghi. Permessi enforced dentro l'action. REG-705.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const locationIds = Array.isArray(payload.locationIds)
    ? payload.locationIds.filter((v: unknown): v is string => typeof v === "string")
    : null;
  if (!locationIds) {
    return NextResponse.json(
      { success: false, message: "locationIds mancante." },
      { status: 400 },
    );
  }
  const res = await setStudentLocations({ studentId: id, locationIds });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
