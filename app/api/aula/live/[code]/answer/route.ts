import { NextResponse } from "next/server";
import { z } from "zod";
import { formatError } from "@/lib/utils";
import { submitLiveAnswer } from "@/lib/aula/live-public";

const bodySchema = z.object({
  participantId: z.string().uuid(),
  answer: z.boolean(),
});

// Invio risposta del partecipante. Pubblica, no auth.
// Accettata solo se la domanda corrente è aperta; idempotente per partecipante.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const { participantId, answer } = bodySchema.parse(await request.json());
    await submitLiveAnswer({ code, participantId, answer });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
