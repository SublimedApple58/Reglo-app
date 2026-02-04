import { NextResponse } from "next/server";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { prisma } from "@/db/prisma";

export async function GET(request: Request) {
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

  const user = await prisma.user.findUnique({
    where: { id: mobileToken.userId },
  });
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Utente non trovato." },
      { status: 404 },
    );
  }

  const memberships = await prisma.companyMember.findMany({
    where: { userId: user.id },
    include: { company: { include: { services: true } } },
    orderBy: { createdAt: "asc" },
  });

  const activeMembership = memberships.find(
    (entry) => entry.companyId === user.activeCompanyId,
  );

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      activeCompanyId: user.activeCompanyId,
      autoscuolaRole: activeMembership?.autoscuolaRole ?? null,
      companies: memberships.map((entry) => ({
        id: entry.company.id,
        name: entry.company.name,
        logoKey: entry.company.logoKey,
        role: entry.role,
        autoscuolaRole: entry.autoscuolaRole,
        services: entry.company.services,
      })),
    },
  });
}
