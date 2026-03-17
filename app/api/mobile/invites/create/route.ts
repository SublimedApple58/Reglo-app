import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/db/prisma";
import { parseBearerToken, getMobileToken } from "@/lib/mobile-auth";
import { sendCompanyInviteEmail } from "@/email";
import { SERVER_URL } from "@/lib/constants";
import { routing } from "@/i18n/routing";
import { formatError } from "@/lib/utils";

const INVITE_TTL_DAYS = 7;

const createMobileInviteSchema = z.object({
  email: z.string().email("Email non valida"),
  autoscuolaRole: z.enum(["INSTRUCTOR", "STUDENT"]).default("INSTRUCTOR"),
});

const buildMobileInviteUrl = (token: string) => {
  return `${SERVER_URL}/api/mobile/invites/${token}/open`;
};

export async function POST(request: Request) {
  try {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Token mancante." },
        { status: 401 },
      );
    }

    const mobileToken = await getMobileToken(token);
    if (!mobileToken || !mobileToken.companyId) {
      return NextResponse.json(
        { success: false, message: "Token non valido." },
        { status: 401 },
      );
    }

    // Verify the user is an admin (OWNER) in this company
    const membership = await prisma.companyMember.findFirst({
      where: { userId: mobileToken.userId, companyId: mobileToken.companyId },
      include: { company: true },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Solo i titolari possono invitare." },
        { status: 403 },
      );
    }

    const payload = createMobileInviteSchema.parse(await request.json());
    const email = payload.email.trim().toLowerCase();

    // Check if user already belongs to this company
    const existingMember = await prisma.companyMember.findFirst({
      where: {
        companyId: mobileToken.companyId,
        user: { email },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { success: false, message: "Questo utente appartiene già all'autoscuola." },
        { status: 400 },
      );
    }

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    // Upsert: re-use existing pending invite or create new one
    const existingInvite = await prisma.companyInvite.findFirst({
      where: {
        companyId: mobileToken.companyId,
        email,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });

    const invite = existingInvite
      ? await prisma.companyInvite.update({
          where: { id: existingInvite.id },
          data: {
            role: "member",
            autoscuolaRole: payload.autoscuolaRole,
            expiresAt,
            platform: "ios", // mobile origin
          },
        })
      : await prisma.companyInvite.create({
          data: {
            companyId: mobileToken.companyId,
            email,
            role: "member",
            autoscuolaRole: payload.autoscuolaRole,
            token: randomUUID(),
            status: "pending",
            platform: "ios",
            expiresAt,
            invitedById: mobileToken.userId,
          },
        });

    // Send invite email
    const inviteUrl = `${SERVER_URL}/${routing.defaultLocale}/invite/${invite.token}`;
    const mobileInviteUrl = buildMobileInviteUrl(invite.token);

    const inviter = await prisma.user.findUnique({
      where: { id: mobileToken.userId },
      select: { name: true },
    });

    await sendCompanyInviteEmail({
      to: email,
      companyName: membership.company.name,
      inviteUrl,
      mobileInviteUrl,
      invitedByName: inviter?.name ?? null,
    });

    return NextResponse.json({
      success: true,
      data: { message: "Invito inviato" },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
