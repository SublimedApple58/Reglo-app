import { NextResponse } from "next/server";
import { endRoadSession } from "@/lib/autoscuole/road/service";

/**
 * REG-638: «Termina guida» — chiude la sessione e segna la guida completata.
 * REG-714: body facoltativo `{ endedAt }` = l'ora del tocco sul telefono
 * (chiusura in coda offline); senza body vale adesso.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { endedAt?: unknown } | null;
  const res = await endRoadSession(id, { endedAt: body?.endedAt });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
