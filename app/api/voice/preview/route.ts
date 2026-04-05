import { NextRequest, NextResponse } from "next/server";
import { requireServiceAccess } from "@/lib/service-access";

const ALLOWED_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"];
const PREVIEW_TEXT =
  "Buongiorno, sono l'assistente virtuale della sua autoscuola. Come posso aiutarla?";

export async function GET(request: NextRequest) {
  try {
    await requireServiceAccess("AUTOSCUOLE");

    const voice = request.nextUrl.searchParams.get("voice") ?? "coral";
    if (!ALLOWED_VOICES.includes(voice)) {
      return NextResponse.json({ error: "Voce non valida" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI non configurato" }, { status: 500 });
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice,
        input: PREVIEW_TEXT,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Errore generazione anteprima" }, { status: 500 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Errore generazione anteprima" }, { status: 500 });
  }
}
