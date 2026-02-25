import { NextResponse } from "next/server";
import { assignAutoscuolaVoiceLine } from "@/lib/actions/backoffice.actions";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await assignAutoscuolaVoiceLine(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore assegnazione linea voce.",
      },
      { status: 400 },
    );
  }
}
