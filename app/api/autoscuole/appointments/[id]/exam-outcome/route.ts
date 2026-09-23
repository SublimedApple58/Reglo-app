import { NextResponse } from "next/server";

import { setExamOutcome } from "@/lib/actions/autoscuole.actions";

/**
 * Esito esame dall'app istruttore (REG-513, fase mobile).
 *
 * Delega alla stessa action del web: i permessi (OWNER ∨ INSTRUCTOR) e tutte
 * le regole — compreso il passaggio automatico a PATENTATO su un idoneo —
 * vivono lì dentro, non qui. È l'istruttore che accompagna l'esame a
 * conoscerne l'esito per primo.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    outcome?: unknown;
    licenseNumber?: unknown;
  };
  const res = await setExamOutcome({
    appointmentId: id,
    outcome:
      body.outcome === "idoneo" || body.outcome === "respinto" ? body.outcome : null,
    // Assente = non toccare il numero già registrato; presente = scrivilo o
    // cancellalo. Stessa semantica del web.
    licenseNumber:
      typeof body.licenseNumber === "string"
        ? body.licenseNumber
        : body.licenseNumber === null
          ? null
          : undefined,
  });
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}
