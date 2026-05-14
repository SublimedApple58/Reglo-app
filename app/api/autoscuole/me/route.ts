import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
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

    // Per-student membership: phase + quiz seat status
    const member = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        userId: membership.userId,
        autoscuolaRole: "STUDENT",
      },
      select: {
        studentPhase: true,
        quizSeatGrantedAt: true,
      },
    });

    // Per-company configuration: which phases are active and whether
    // auto-assign on signup is enabled.
    const service = await prisma.companyService.findFirst({
      where: {
        companyId: membership.companyId,
        serviceKey: "AUTOSCUOLE",
      },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const phasesEnabled: ("TEORIA" | "PRATICA")[] = Array.isArray(limits.phasesEnabled)
      ? limits.phasesEnabled.filter(
          (p): p is "TEORIA" | "PRATICA" => p === "TEORIA" || p === "PRATICA",
        )
      : ["PRATICA"];
    const autoAssignQuizOnSignup = Boolean(limits.autoAssignQuizOnSignup);

    const latestCase = await prisma.autoscuolaCase.findFirst({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
      },
      orderBy: { createdAt: "desc" },
      select: { theoryExamAt: true, drivingExamAt: true },
    });

    const phase = member?.studentPhase ?? "PRATICA";
    const hasQuizAccess = Boolean(member?.quizSeatGrantedAt);
    const theoryExamAt = latestCase?.theoryExamAt ?? null;
    const drivingExamAt = latestCase?.drivingExamAt ?? null;

    return NextResponse.json({
      success: true,
      data: {
        phase,
        hasQuizAccess,
        phasesEnabled,
        autoAssignQuizOnSignup,
        theoryExamAt: theoryExamAt ? theoryExamAt.toISOString() : null,
        drivingExamAt: drivingExamAt ? drivingExamAt.toISOString() : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
