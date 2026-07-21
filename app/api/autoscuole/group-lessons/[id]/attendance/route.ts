import { NextResponse } from "next/server";
import {
  setGroupLessonSeatOutcome,
  markGroupLessonAllPresent,
} from "@/lib/actions/autoscuole.actions";

/**
 * Group-lesson attendance (present / absent) for the mobile roster.
 * - `{ all: true }` → mark every seat present in one go.
 * - `{ appointmentId, outcome }` → set a single seat present/absent.
 * Correctable any time, incl. after the lesson (no time window).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json();

  const res = payload?.all
    ? await markGroupLessonAllPresent({ groupLessonId: id })
    : await setGroupLessonSeatOutcome({
        appointmentId: payload?.appointmentId ?? "",
        outcome: payload?.outcome === "absent" ? "absent" : "present",
      });

  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
