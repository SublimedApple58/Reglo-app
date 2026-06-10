import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { studentRegisterSchema } from "@/lib/validators";
import { hash } from "@/lib/encrypt";
import { issueMobileToken } from "@/lib/mobile-auth";
import { formatError } from "@/lib/utils";
import { getSignedAssetUrl } from "@/lib/storage/r2";
import type { ServiceLimits } from "@/lib/services";

/**
 * Decide which student phase and quiz seat status a new sign-up should land in,
 * based on the autoscuola configuration (`phasesEnabled`, `autoAssignQuizOnSignup`,
 * `quizSeats`) and the live count of seats already consumed.
 *
 *   TEORIA disabled  → PRATICA (legacy default, no quiz seat)
 *   TEORIA enabled + auto-assign OFF → AWAITING
 *   TEORIA enabled + auto-assign ON + free seat → TEORIA + seat granted
 *   TEORIA enabled + auto-assign ON + no free seat → AWAITING (soft degrade)
 */
function decideOnboardingPhase(
  limits: ServiceLimits | null,
  seatsConsumed: number,
): { studentPhase: "TEORIA" | "PRATICA" | "AWAITING"; grantSeat: boolean } {
  const phasesEnabled = Array.isArray(limits?.phasesEnabled)
    ? limits!.phasesEnabled
    : ["PRATICA"];
  if (!phasesEnabled.includes("TEORIA")) {
    return { studentPhase: "PRATICA", grantSeat: false };
  }
  const autoAssign = Boolean(limits?.autoAssignQuizOnSignup);
  if (!autoAssign) {
    return { studentPhase: "AWAITING", grantSeat: false };
  }
  const quizSeats =
    typeof limits?.quizSeats === "number" && Number.isFinite(limits.quizSeats)
      ? Math.max(0, Math.floor(limits.quizSeats))
      : 0;
  if (seatsConsumed < quizSeats) {
    return { studentPhase: "TEORIA", grantSeat: true };
  }
  return { studentPhase: "AWAITING", grantSeat: false };
}

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
      // Resolve the phase + quiz seat state INSIDE the transaction so that
      // a concurrent registration on the same autoscuola cannot race past the
      // quizSeats limit (we read the live counter atomically with the create).
      const limits = (autoscuoleService.limits ?? null) as ServiceLimits | null;
      const seatsConsumed = await tx.companyMember.count({
        where: {
          companyId: company.id,
          role: "member",
          quizSeatGrantedAt: { not: null },
        },
      });
      const decision = decideOnboardingPhase(limits, seatsConsumed);

      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email.toLowerCase(),
          phone: parsed.phone.trim(),
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
          studentPhase: decision.studentPhase,
          quizSeatGrantedAt: decision.grantSeat ? new Date() : null,
          // We classify the phase explicitly here (auto-assigned by the
          // system following titolare-configured rules), so the "Conferma
          // fase" badge in the titolare dashboard does NOT trigger.
          phaseClassifiedAt: new Date(),
          // Default pursued license: the autoscuola's configured default (moto
          // schools set it once), falling back to B / manual. The titolare can
          // still change it per-student when classifying in PRATICA.
          licenseCategory:
            (limits as Record<string, unknown> | null)?.defaultLicenseCategory as
              | string
              | undefined ?? "B",
          transmission:
            (limits as Record<string, unknown> | null)?.defaultTransmission as
              | string
              | undefined ?? "manual",
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
          phone: result.user.phone ?? null,
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
