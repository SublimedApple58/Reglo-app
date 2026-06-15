import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { compare, hash } from "@/lib/encrypt";
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from "@/lib/constants";
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

  let user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    const isGlobalAdmin =
      email === GLOBAL_ADMIN_EMAIL && password === GLOBAL_ADMIN_PASSWORD;
    if (isGlobalAdmin) {
      user = await prisma.user.create({
        data: {
          email: GLOBAL_ADMIN_EMAIL,
          password: await hash(GLOBAL_ADMIN_PASSWORD),
          role: "admin",
          name: GLOBAL_ADMIN_EMAIL.split("@")[0] ?? "admin",
        },
      });
    }
  }

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
