import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await prisma.companyInvite.findUnique({
    where: { token },
    include: {
      company: {
        include: {
          services: true,
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json(
      { success: false, message: "Invito non trovato." },
      { status: 404 },
    );
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { success: false, message: "Invito non più attivo." },
      { status: 400 },
    );
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { success: false, message: "Invito scaduto." },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email.toLowerCase() },
    select: { id: true },
  });

  const alreadyMember = existingUser
    ? await prisma.companyMember.findFirst({
        where: {
          companyId: invite.companyId,
          userId: existingUser.id,
        },
        select: { userId: true },
      })
    : null;

  const autoscuolaActive = invite.company.services.some(
    (service) => service.serviceKey === "AUTOSCUOLE" && service.status === "ACTIVE",
  );

  return NextResponse.json({
    success: true,
    data: {
      companyName: invite.company.name,
      companyId: invite.companyId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      hasAccount: Boolean(existingUser),
      alreadyMember: Boolean(alreadyMember),
      autoscuolaActive,
      requiresPhone: autoscuolaActive && invite.role !== "admin",
    },
  });
}
