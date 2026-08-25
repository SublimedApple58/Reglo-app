import { NextResponse } from "next/server";
import { updateAgendaColorSettings } from "@/lib/actions/autoscuole-settings.actions";

// Colori agenda (pannello "Aspetto"): gestibile da titolari E istruttori
// (scoped ai soli campi agendaColor*, vedi updateAgendaColorSettings).
export async function PATCH(request: Request) {
  const payload = await request.json();
  const res = await updateAgendaColorSettings(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
