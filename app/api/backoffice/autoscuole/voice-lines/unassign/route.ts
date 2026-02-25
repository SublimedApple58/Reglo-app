import { NextResponse } from "next/server";
import { unassignAutoscuolaVoiceLine } from "@/lib/actions/backoffice.actions";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await unassignAutoscuolaVoiceLine(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Errore disassegnazione linea voce.",
      },
      { status: 400 },
    );
  }
}
