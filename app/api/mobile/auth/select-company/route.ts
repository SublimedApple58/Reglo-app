import { NextResponse } from "next/server";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { prisma } from "@/db/prisma";

export async function POST(request: Request) {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Token mancante." },
      { status: 401 },
    );
  }

  const mobileToken = await getMobileToken(token);
  if (!mobileToken) {
    return NextResponse.json(
      { success: false, message: "Token non valido." },
      { status: 401 },
    );
  }

  const payload = await request.json();
  const companyId = payload?.companyId as string;
  if (!companyId) {
    return NextResponse.json(
      { success: false, message: "CompanyId mancante." },
      { status: 400 },
    );
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId: mobileToken.userId, companyId },
  });
  if (!membership) {
    return NextResponse.json(
      { success: false, message: "Utente non associato alla company." },
      { status: 403 },
    );
  }

  await prisma.user.update({
    where: { id: mobileToken.userId },
    data: { activeCompanyId: companyId },
  });

  return NextResponse.json({ success: true, data: { activeCompanyId: companyId } });
}
