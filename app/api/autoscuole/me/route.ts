import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { getCachedCompanyServiceLimits } from "@/lib/autoscuole/cached-service";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

export async function GET() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    if (membership.autoscuolaRole !== "STUDENT") {
      return NextResponse.json(
        { success: false, message: "Endpoint disponibile solo per gli allievi." },
        { status: 403 },
      );
    }

    // `membership` already comes from getActiveCompanyContext (which selects every
    // CompanyMember scalar), so the per-student fields below — studentPhase,
    // quizSeatGrantedAt, licenseCategory, transmission — are already in hand. No
    // need to re-query CompanyMember. The two remaining reads (service config +
    // latest case) are independent → one parallel wave instead of two awaits.
    const [limits, latestCase] = await Promise.all([
      // Per-company configuration: which phases are active and whether
      // auto-assign on signup is enabled. Read through the Redis SETTINGS cache
      // (5min TTL) — same limits object slots/booking already share — instead of
      // a raw companyService.findFirst on every /me call.
      getCachedCompanyServiceLimits(membership.companyId),
      prisma.autoscuolaCase.findFirst({
        where: {
          companyId: membership.companyId,
          studentId: membership.userId,
        },
        orderBy: { createdAt: "desc" },
        select: { theoryExamAt: true, drivingExamAt: true },
      }),
    ]);
    const phasesEnabled: ("TEORIA" | "PRATICA")[] = Array.isArray(limits.phasesEnabled)
      ? limits.phasesEnabled.filter(
          (p): p is "TEORIA" | "PRATICA" => p === "TEORIA" || p === "PRATICA",
        )
      : ["PRATICA"];
    const autoAssignQuizOnSignup = Boolean(limits.autoAssignQuizOnSignup);

    const phase = membership.studentPhase ?? "PRATICA";
    const hasQuizAccess = Boolean(membership.quizSeatGrantedAt);
    const theoryExamAt = latestCase?.theoryExamAt ?? null;
    const drivingExamAt = latestCase?.drivingExamAt ?? null;

    // REG-410: a student who signed up in autonomy must pick their own license
    // path at first access. The mobile app shows a blocking gate while this is
    // true; it clears once they set the license via PATCH .../me/license-path.
    // Staff-created and every pre-existing student have selfRegistered=false and
    // are never gated.
    const needsLicensePath =
      membership.selfRegistered === true && !membership.licenseCategory;

    return NextResponse.json({
      success: true,
      data: {
        phase,
        hasQuizAccess,
        phasesEnabled,
        autoAssignQuizOnSignup,
        theoryExamAt: theoryExamAt ? theoryExamAt.toISOString() : null,
        drivingExamAt: drivingExamAt ? drivingExamAt.toISOString() : null,
        licenseCategory: membership.licenseCategory ?? null,
        transmission: membership.transmission ?? null,
        needsLicensePath,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
