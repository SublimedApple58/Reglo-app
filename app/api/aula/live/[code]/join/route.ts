import { NextResponse } from "next/server";
import { z } from "zod";
import { formatError } from "@/lib/utils";
import { joinLive } from "@/lib/aula/live-public";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  rejoinToken: z.string().optional(),
});

// Join di un partecipante anonimo. Pubblica, no auth.
// Nome univoco per sessione (rifiuta i duplicati). Rientro via rejoinToken.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const { name, rejoinToken } = bodySchema.parse(await request.json());
    const participant = await joinLive({ code, name, rejoinToken });
    return NextResponse.json({ success: true, data: participant });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
