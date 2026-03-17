import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { studentRegisterSchema } from "@/lib/validators";
import { hash } from "@/lib/encrypt";
import { issueMobileToken } from "@/lib/mobile-auth";
import { formatError } from "@/lib/utils";
import { getSignedAssetUrl } from "@/lib/storage/r2";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = studentRegisterSchema.parse(payload);

    // Normalize school code
    const schoolCode = parsed.schoolCode.trim().toUpperCase();

    // Find company by invite code
    const company = await prisma.company.findUnique({
      where: { inviteCode: schoolCode },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, message: "Codice autoscuola non valido" },
        { status: 404 },
      );
    }

    // Check if the company has the AUTOSCUOLE service active
    const autoscuoleService = await prisma.companyService.findFirst({
      where: { companyId: company.id, serviceKey: "AUTOSCUOLE", status: "ACTIVE" },
    });

    if (!autoscuoleService) {
      return NextResponse.json(
        { success: false, message: "Questa autoscuola non è attiva" },
        { status: 403 },
      );
    }

    // Check if email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "Esiste già un account con questa email" },
        { status: 409 },
      );
    }

    const passwordHash = await hash(parsed.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email.toLowerCase(),
          password: passwordHash,
          role: "user",
          activeCompanyId: company.id,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: "member",
          autoscuolaRole: "STUDENT",
        },
      });

      await tx.autoscuolaCase.create({
        data: {
          studentId: user.id,
          companyId: company.id,
          status: "iscritto",
        },
      });

      return { user };
    });

    const tokenRes = await issueMobileToken({
      userId: result.user.id,
      companyId: company.id,
    });

    let logoUrl: string | null = null;
    if (company.logoKey) {
      try {
        logoUrl = await getSignedAssetUrl(company.logoKey);
      } catch {
        logoUrl = null;
      }
    }

    const services = await prisma.companyService.findMany({
      where: { companyId: company.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        token: tokenRes.token,
        expiresAt: tokenRes.expiresAt,
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
        },
        activeCompanyId: company.id,
        autoscuolaRole: "STUDENT",
        instructorId: null,
        companies: [
          {
            id: company.id,
            name: company.name,
            logoKey: company.logoKey,
            logoUrl,
            role: "member",
            autoscuolaRole: "STUDENT",
            services,
          },
        ],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
