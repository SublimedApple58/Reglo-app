import { NextResponse } from "next/server";
import { checkStudentSlotCancellation } from "@/lib/actions/autoscuole.actions";

/**
 * GET /api/autoscuole/slot-cancellation-check?studentId=…&startsAt=…
 *
 * Returns whether the given student previously cancelled a guida that started
 * at the given instant, inside the caller's autoscuola. Powers the orange
 * "l'allievo aveva annullato una guida in questo orario" banner in the web
 * booking popover. Non-blocking — purely informative.
 *
 * Response (success): { success: true, data: { hadCancellation: boolean } }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId") ?? "";
  const startsAt = searchParams.get("startsAt") ?? "";

  const res = await checkStudentSlotCancellation({ studentId, startsAt });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
