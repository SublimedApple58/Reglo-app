import { NextResponse } from "next/server";
import { checkInstructorAvailability } from "@/lib/actions/autoscuole.actions";

/**
 * GET /api/autoscuole/instructor-availability
 *   ?instructorId=…&startsAt=…&endsAt=…&excludeAppointmentId=…
 *
 * Returns whether the given instructor is free for the given time range
 * inside the caller's autoscuola. Used by the web "modifica guida" dialog
 * and the mobile instructor edit sheet to validate a proposed instructor
 * swap before committing it.
 *
 * Response shape (when success):
 *   { success: true, data: { available: true } |
 *     { available: false, reason: "OVERLAP"|"BLOCK"|"HOLIDAY"|"INSTRUCTOR_INACTIVE", detail: string } }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instructorId = searchParams.get("instructorId") ?? "";
  const startsAt = searchParams.get("startsAt") ?? "";
  const endsAt = searchParams.get("endsAt") ?? "";
  const excludeAppointmentId = searchParams.get("excludeAppointmentId") ?? undefined;

  const res = await checkInstructorAvailability({
    instructorId,
    startsAt,
    endsAt,
    excludeAppointmentId,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
