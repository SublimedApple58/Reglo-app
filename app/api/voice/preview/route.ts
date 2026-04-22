import { NextRequest, NextResponse } from "next/server";
import { requireServiceAccess } from "@/lib/service-access";
import { telnyxFetch } from "@/lib/telnyx";

const ALLOWED_VOICE_PREFIX = ["Telnyx.", "ElevenLabs.", "Azure.", "Rime."];
const PREVIEW_TEXT =
  "Buongiorno e benvenuto! Sono l'assistente virtuale della sua autoscuola. Posso aiutarla a prenotare una lezione di guida, verificare gli orari disponibili, o rispondere alle sue domande. Come posso esserle utile oggi?";

export async function GET(request: NextRequest) {
  try {
    await requireServiceAccess("AUTOSCUOLE");

    const voice = request.nextUrl.searchParams.get("voice") ?? "Telnyx.KokoroTTS.af_bella";
    if (!ALLOWED_VOICE_PREFIX.some((prefix) => voice.startsWith(prefix))) {
      return NextResponse.json({ error: "Voce non valida" }, { status: 400 });
    }

    const response = await telnyxFetch("/ai/generate/audio", {
      method: "POST",
      body: JSON.stringify({
        text: PREVIEW_TEXT,
        voice,
        output_format: "mp3",
        language: "it",
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
