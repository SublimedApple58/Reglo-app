import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import {
  parseInstructorSettings,
  buildCompanyBookingDefaults,
} from "@/lib/autoscuole/instructor-clusters";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";

const postSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") {
      return NextResponse.json(
        { success: false, message: "Solo gli allievi possono dichiarare assenza." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const payload = postSchema.parse(body);

    // Find assigned instructor
    const member = await prisma.companyMember.findFirst({
      where: { companyId: membership.companyId, userId: membership.userId, autoscuolaRole: "STUDENT" },
      select: {
        assignedInstructorId: true,
        assignedInstructor: { select: { id: true, autonomousMode: true, settings: true, userId: true } },
        user: { select: { name: true } },
      },
    });

    if (!member?.assignedInstructorId || !member.assignedInstructor?.autonomousMode) {
      return NextResponse.json(
        { success: false, message: "Non sei assegnato a un istruttore autonomo." },
        { status: 400 },
      );
    }

    // Check if weekly absence is enabled for this cluster
    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const companyDefaults = buildCompanyBookingDefaults(limits);
    const settings = parseInstructorSettings(member.assignedInstructor.settings);
    const weeklyAbsenceEnabled = typeof settings.weeklyAbsenceEnabled === "boolean"
      ? settings.weeklyAbsenceEnabled
      : companyDefaults.weeklyAbsenceEnabled;

    if (!weeklyAbsenceEnabled) {
      return NextResponse.json(
        { success: false, message: "Funzionalità assenza settimanale non attiva." },
        { status: 400 },
      );
    }

    const weekStartDate = new Date(payload.weekStart);

    const absence = await prisma.autoscuolaStudentWeeklyAbsence.upsert({
      where: {
        companyId_studentId_weekStart: {
          companyId: membership.companyId,
          studentId: membership.userId,
          weekStart: weekStartDate,
        },
      },
      create: {
        companyId: membership.companyId,
        studentId: membership.userId,
        instructorId: member.assignedInstructorId,
        weekStart: weekStartDate,
      },
      update: {},
    });

    // Notify instructor
    if (member.assignedInstructor.userId) {
      const studentName = member.user?.name ?? "Un allievo";
      try {
        await sendAutoscuolaPushToUsers({
          companyId: membership.companyId,
          userIds: [member.assignedInstructor.userId],
          title: "Assenza settimanale",
          body: `${studentName} ha dichiarato assenza per la settimana del ${payload.weekStart}.`,
          data: {
            kind: "weekly_absence",
            studentId: membership.userId,
            studentName: studentName,
            weekStart: payload.weekStart,
          },
        });
      } catch (error) {
        console.error("Weekly absence push error", error);
      }
    }

    return NextResponse.json({ success: true, data: absence });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    const where: Record<string, unknown> = {
      companyId: membership.companyId,
    };

    if (membership.autoscuolaRole === "STUDENT") {
      where.studentId = membership.userId;
    } else if (membership.autoscuolaRole === "INSTRUCTOR") {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId: membership.companyId, userId: membership.userId },
        select: { id: true },
      });
      if (instructor) where.instructorId = instructor.id;
    }

    if (weekStart) where.weekStart = new Date(weekStart);

    const absences = await prisma.autoscuolaStudentWeeklyAbsence.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: absences });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") {
      return NextResponse.json(
        { success: false, message: "Solo gli allievi possono annullare l'assenza." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");
    if (!weekStart) {
      return NextResponse.json(
        { success: false, message: "weekStart richiesto." },
        { status: 400 },
      );
    }

    await prisma.autoscuolaStudentWeeklyAbsence.deleteMany({
      where: {
        companyId: membership.companyId,
        studentId: membership.userId,
        weekStart: new Date(weekStart),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
