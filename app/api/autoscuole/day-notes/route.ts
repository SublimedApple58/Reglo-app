import { NextResponse } from "next/server";
import { saveAutoscuolaDayNote } from "@/lib/actions/autoscuole-day-notes.actions";

/** REG-632: salva (o, con testo vuoto, toglie) la nota del giorno. */
export async function PUT(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await saveAutoscuolaDayNote(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
