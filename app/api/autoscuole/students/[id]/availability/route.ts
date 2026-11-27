import { NextResponse } from "next/server";
import { getStudentAvailabilityForStaff } from "@/lib/actions/autoscuole-student-availability.actions";

// GET /api/autoscuole/students/:id/availability — REG-802: disponibilità a
// fasce dell'allievo per istruttore e titolare (sola lettura; permessi
// nell'action). Stessa forma di `me/availability`.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getStudentAvailabilityForStaff({ studentId: id });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
