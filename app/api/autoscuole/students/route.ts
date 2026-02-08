import { NextResponse } from "next/server";
import { getAutoscuolaStudents } from "@/lib/actions/autoscuole.actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const res = await getAutoscuolaStudents(search);
  return NextResponse.json(res, { status: res.success ? 200 : 400 });
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message:
        "Creazione allievi da questo endpoint disattivata. Usa la Directory utenti (ruolo Allievo).",
    },
    { status: 405 },
  );
}
