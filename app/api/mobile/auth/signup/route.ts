import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { signUpFormSchema } from "@/lib/validators";
import { hash } from "@/lib/encrypt";
import { issueMobileToken } from "@/lib/mobile-auth";
import { formatError } from "@/lib/utils";
import { getDefaultAutoscuolaRole } from "@/lib/autoscuole/roles";
import { getSignedAssetUrl } from "@/lib/storage/r2";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = signUpFormSchema.parse(payload);

    const plainPassword = parsed.password;
    const passwordHash = await hash(parsed.password);

    const createdUser = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: parsed.companyName.trim() },
      });

      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email.toLowerCase(),
          password: passwordHash,
          role: "admin",
          activeCompanyId: company.id,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: "admin",
          autoscuolaRole: getDefaultAutoscuolaRole("admin"),
        },
      });

      await tx.companyService.createMany({
        data: [
          { companyId: company.id, serviceKey: "DOC_MANAGER" },
          { companyId: company.id, serviceKey: "WORKFLOWS" },
          { companyId: company.id, serviceKey: "AI_ASSISTANT" },
        ],
      });

      return { user, company };
    });

    const tokenRes = await issueMobileToken({
      userId: createdUser.user.id,
      companyId: createdUser.company.id,
    });

    let logoUrl: string | null = null;
    if (createdUser.company.logoKey) {
      try {
        logoUrl = await getSignedAssetUrl(createdUser.company.logoKey);
      } catch {
        logoUrl = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        token: tokenRes.token,
        expiresAt: tokenRes.expiresAt,
        user: {
          id: createdUser.user.id,
          name: createdUser.user.name,
          email: createdUser.user.email,
          role: createdUser.user.role,
        },
        activeCompanyId: createdUser.company.id,
        autoscuolaRole: getDefaultAutoscuolaRole("admin"),
        instructorId: null,
        companies: [
          {
            id: createdUser.company.id,
            name: createdUser.company.name,
            logoKey: createdUser.company.logoKey,
            logoUrl,
            role: "admin",
            autoscuolaRole: getDefaultAutoscuolaRole("admin"),
            services: await prisma.companyService.findMany({
              where: { companyId: createdUser.company.id },
            }),
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
