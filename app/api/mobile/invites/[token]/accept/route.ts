import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { compare, hash } from "@/lib/encrypt";
import { getDefaultAutoscuolaRole } from "@/lib/autoscuole/roles";
import { formatError } from "@/lib/utils";
import { issueMobileToken } from "@/lib/mobile-auth";
import { buildMobileAuthPayload } from "@/lib/mobile-auth-response";

const acceptInviteSchema = z.object({
  mode: z.enum(["existing", "register"]),
  name: z.string().trim().optional(),
  password: z.string().min(1, "Password obbligatoria."),
  confirmPassword: z.string().optional(),
  phone: z.string().trim().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const payload = acceptInviteSchema.parse(await request.json());

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

    const autoscuolaActive = invite.company.services.some(
      (service) => service.serviceKey === "AUTOSCUOLE" && service.status === "ACTIVE",
    );
    const requiresPhone = autoscuolaActive && invite.role !== "admin";
    const phone = payload.phone?.trim() || null;

    if (requiresPhone && !phone) {
      return NextResponse.json(
        { success: false, message: "Numero di cellulare obbligatorio." },
        { status: 400 },
      );
    }

    let userId = "";
    const inviteEmail = invite.email.toLowerCase();

    if (payload.mode === "existing") {
      const existingUser = await prisma.user.findUnique({
        where: { email: inviteEmail },
      });

      if (!existingUser || !existingUser.password) {
        return NextResponse.json(
          { success: false, message: "Account non trovato per questo invito." },
          { status: 400 },
        );
      }

      const passwordOk = await compare(payload.password, existingUser.password);
      if (!passwordOk) {
        return NextResponse.json(
          { success: false, message: "Password non valida." },
          { status: 401 },
        );
      }

      await prisma.$transaction(async (tx) => {
        const existingMember = await tx.companyMember.findFirst({
          where: {
            companyId: invite.companyId,
            userId: existingUser.id,
          },
        });

        if (!existingMember) {
          await tx.companyMember.create({
            data: {
              companyId: invite.companyId,
              userId: existingUser.id,
              role: invite.role,
              autoscuolaRole: getDefaultAutoscuolaRole(invite.role),
            },
          });
        }

        await tx.companyInvite.update({
          where: { id: invite.id },
          data: { status: "accepted" },
        });

        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            activeCompanyId: invite.companyId,
            ...(requiresPhone && phone ? { phone } : {}),
          },
        });
      });

      userId = existingUser.id;
    } else {
      const name = payload.name?.trim() ?? "";
      if (!name) {
        return NextResponse.json(
          { success: false, message: "Nome obbligatorio." },
          { status: 400 },
        );
      }
      if (payload.password.length < 6) {
        return NextResponse.json(
          { success: false, message: "Password minima 6 caratteri." },
          { status: 400 },
        );
      }
      if (!payload.confirmPassword || payload.confirmPassword !== payload.password) {
        return NextResponse.json(
          { success: false, message: "Le password non coincidono." },
          { status: 400 },
        );
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: inviteEmail },
        select: { id: true },
      });
      if (existingUser) {
        return NextResponse.json(
          {
            success: false,
            message: "Esiste già un account per questa email. Usa la modalità accesso.",
          },
          { status: 400 },
        );
      }

      const passwordHash = await hash(payload.password);
      const createdUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email: inviteEmail,
            password: passwordHash,
            role: "user",
            activeCompanyId: invite.companyId,
            ...(requiresPhone && phone ? { phone } : {}),
          },
        });

        await tx.companyMember.create({
          data: {
            companyId: invite.companyId,
            userId: user.id,
            role: invite.role,
            autoscuolaRole: getDefaultAutoscuolaRole(invite.role),
          },
        });

        await tx.companyInvite.update({
          where: { id: invite.id },
          data: { status: "accepted" },
        });

        return user;
      });

      userId = createdUser.id;
    }

    const tokenRes = await issueMobileToken({
      userId,
      companyId: invite.companyId,
    });

    const authPayload = await buildMobileAuthPayload({
      userId,
      activeCompanyId: invite.companyId,
    });

    return NextResponse.json({
      success: true,
      data: {
        token: tokenRes.token,
        expiresAt: tokenRes.expiresAt,
        ...authPayload,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
