import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { compare, hash } from "@/lib/encrypt";
import { GLOBAL_ADMIN_EMAIL, GLOBAL_ADMIN_PASSWORD } from "@/lib/constants";
import { issueMobileToken } from "@/lib/mobile-auth";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import { getOrCreateInstructorForUser } from "@/lib/autoscuole/instructors";

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

  const memberships = await prisma.companyMember.findMany({
    where: { userId: user.id },
    include: { company: { include: { services: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!memberships.length) {
    return NextResponse.json(
      { success: false, message: "Nessuna company associata." },
      { status: 403 },
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

  let activeCompanyId = user.activeCompanyId;
  if (!activeCompanyId && memberships.length === 1) {
    activeCompanyId = memberships[0].companyId;
    await prisma.user.update({
      where: { id: user.id },
      data: { activeCompanyId },
    });
  }

  const tokenRes = await issueMobileToken({
    userId: user.id,
    companyId: activeCompanyId ?? null,
  });

  const activeMembership = memberships.find(
    (entry) => entry.companyId === activeCompanyId,
  );

  let instructorId: string | null = null;
  if (activeCompanyId && activeMembership?.autoscuolaRole === "INSTRUCTOR") {
    const instructor = await getOrCreateInstructorForUser({
      companyId: activeCompanyId,
      userId: user.id,
      name: user.name ?? user.email.split("@")[0] ?? "Istruttore",
    });
    instructorId = instructor.id;
  }

  return NextResponse.json({
    success: true,
    data: {
      token: tokenRes.token,
      expiresAt: tokenRes.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      activeCompanyId,
      autoscuolaRole: activeMembership?.autoscuolaRole ?? null,
      instructorId,
      companies,
    },
  });
}
