import { NextResponse } from "next/server";
import { getRoadPlanRoute } from "@/lib/autoscuole/road/plan-service";

/**
 * REG-648 + REG-653: la linea suggerita sulle strade vere, chiusa in sede.
 * Body `{ start: {lat,lng}, stops, optimize? }`: alla partenza le tappe del giro
 * (ordine ottimizzato, restituito in `order`); nel riaggancio (REG-654) la
 * posizione attuale, le tappe rimaste e `optimize: false`.
 */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const res = await getRoadPlanRoute(payload);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
