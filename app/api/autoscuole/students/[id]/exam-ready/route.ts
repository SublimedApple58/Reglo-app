import { NextResponse } from "next/server";
import { setStudentExamReady } from "@/lib/actions/autoscuole.actions";

// PATCH /api/autoscuole/students/:id/exam-ready  { ready: boolean }
// Toggle "Pronto per l'esame" da mobile (istruttore) — permessi enforced dentro
// l'action (istruttore + titolare + admin). Non vincola alcuna prenotazione.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();
  const res = await setStudentExamReady({
    studentId: id,
    ready: Boolean(payload.ready),
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
