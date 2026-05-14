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

    const member = await prisma.companyMember.findFirst({
      where: {
        companyId: membership.companyId,
        userId: membership.userId,
        autoscuolaRole: "STUDENT",
      },
      select: { studentPhase: true },
    });

    const latestCase = await prisma.autoscuolaCase.findFirst({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
      },
      orderBy: { createdAt: "desc" },
      select: { theoryExamAt: true, drivingExamAt: true },
    });

    const phase = member?.studentPhase ?? "PRATICA";
    const theoryExamAt = latestCase?.theoryExamAt ?? null;
    const drivingExamAt = latestCase?.drivingExamAt ?? null;

    return NextResponse.json({
      success: true,
      data: {
        phase,
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
