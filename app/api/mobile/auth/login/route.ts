import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { compare } from "@/lib/encrypt";
import { buildMobileAuthPayload } from "@/lib/mobile-auth-payload";

export async function POST(request: Request) {
  const payload = await request.json();
  const email = String(payload?.email ?? "").toLowerCase();
  const password = String(payload?.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: "Credenziali mancanti." },
      { status: 400 },
    );
  }

  // Qui c'era una scorciatoia che, con la credenziale unica del backoffice,
  // creava al volo un utente admin: tolta col REG-413 insieme alla password
  // di riserva nel codice.
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user || !user.password) {
    return NextResponse.json(
      { success: false, message: "Credenziali non valide." },
      { status: 401 },
    );
  }

  const ok = await compare(password, user.password);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Credenziali non valide." },
      { status: 401 },
    );
  }

  const data = await buildMobileAuthPayload(user);

  if (!data) {
    return NextResponse.json(
      { success: false, message: "Nessuna company associata." },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true, data });
}
