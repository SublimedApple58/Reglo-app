import { NextResponse } from "next/server";
import {
  getEvaluationSheet,
  saveEvaluationSheet,
} from "@/lib/actions/autoscuole-evaluation.actions";

// Configurazione del pagellino (REG-443) per l'app: le stesse action del pane
// Impostazioni web, esposte a "Altro → Pagellino". Permessi, validazioni e
// archiviazione delle voci tolte stanno già dentro le action.

export async function GET() {
  const res = await getEvaluationSheet();
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function PUT(request: Request) {
  const payload = await request.json();
  const res = await saveEvaluationSheet(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
