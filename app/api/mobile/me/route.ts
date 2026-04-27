import { NextResponse } from "next/server";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { prisma } from "@/db/prisma";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import { getOrCreateInstructorForUser } from "@/lib/autoscuole/instructors";
import { isInstructor } from "@/lib/autoscuole/roles";

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

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: mobileToken.userId } }),
    prisma.companyMember.findMany({
      where: { userId: mobileToken.userId },
      include: { company: { include: { services: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Utente non trovato." },
      { status: 404 },
    );
  }

  const companies = await Promise.all(
    memberships.map(async (entry) => {
      let logoUrl: string | null = null;
      if (entry.company.logoKey) {
        try {
          logoUrl = await getSignedAssetUrl(entry.company.logoKey);
        } catch {
          logoUrl = null;
        }
      }

      return {
        id: entry.company.id,
        name: entry.company.name,
        logoKey: entry.company.logoKey,
        logoUrl,
        role: entry.role,
        autoscuolaRole: entry.autoscuolaRole,
        services: entry.company.services,
      };
    }),
  );

  const activeMembership = memberships.find(
    (entry) => entry.companyId === user.activeCompanyId,
  );

  let instructorId: string | null = null;
  if (user.activeCompanyId && isInstructor(activeMembership?.autoscuolaRole)) {
    const instructor = await getOrCreateInstructorForUser({
      companyId: user.activeCompanyId,
      userId: user.id,
      name: user.name ?? user.email.split("@")[0] ?? "Istruttore",
    });
    instructorId = instructor.id;
  }

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        role: user.role,
      },
      activeCompanyId: user.activeCompanyId,
      autoscuolaRole: activeMembership?.autoscuolaRole ?? null,
      instructorId,
      companies,
    },
  });
}
