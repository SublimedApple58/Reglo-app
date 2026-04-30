import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import {
  parseInstructorSettings,
  buildCompanyBookingDefaults,
  type InstructorSettings,
} from "@/lib/autoscuole/instructor-clusters";
import { isInstructor, isOwner } from "@/lib/autoscuole/roles";

export async function GET() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      !isInstructor(membership.autoscuolaRole) &&
      !isOwner(membership.autoscuolaRole) &&
      membership.role !== "admin"
    ) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }

    // Load company defaults
    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const companyDefaults = buildCompanyBookingDefaults(limits);

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: {
        companyId: membership.companyId,
        userId: membership.userId,
        status: { not: "inactive" },
      },
      select: {
        id: true,
        autonomousMode: true,
        settings: true,
      },
    });

    if (!instructor) {
      return NextResponse.json({
        success: true,
        data: {
          autonomousMode: false,
          settings: {},
          companyDefaults,
          students: [],
          assignedStudentIds: [],
        },
      });
    }

    const settings = parseInstructorSettings(instructor.settings);

    // Load published weeks from current Monday onwards
    const now = new Date();
    const currentMonday = new Date(now);
    const dow = currentMonday.getUTCDay();
    currentMonday.setUTCDate(currentMonday.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    currentMonday.setUTCHours(0, 0, 0, 0);

    const publishedWeeks = await prisma.autoscuolaInstructorPublishedWeek.findMany({
      where: {
        companyId: membership.companyId,
        instructorId: instructor.id,
        weekStart: { gte: currentMonday },
      },
      select: { id: true, weekStart: true, publishedAt: true },
      orderBy: { weekStart: "asc" },
    });

    // Load all students in the company + which are currently assigned to this instructor
    const studentMembers = await prisma.companyMember.findMany({
      where: {
        companyId: membership.companyId,
        autoscuolaRole: "STUDENT",
      },
      select: {
        userId: true,
        assignedInstructorId: true,
        user: { select: { name: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    const students = studentMembers.map((m) => {
      const fullName = (m.user?.name ?? "").trim();
      const [firstName, ...rest] = fullName.split(" ");
      return {
        id: m.userId,
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        assignedInstructorId: m.assignedInstructorId,
      };
    });
    const assignedStudentIds = studentMembers
      .filter((m) => m.assignedInstructorId === instructor.id)
      .map((m) => m.userId);

    // Load all autonomous instructors in company (for cluster labels in UI)
    const autonomousInstructors = await prisma.autoscuolaInstructor.findMany({
      where: {
        companyId: membership.companyId,
        autonomousMode: true,
        status: { not: "inactive" },
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        autonomousMode: instructor.autonomousMode,
        settings,
        companyDefaults,
        students,
        assignedStudentIds,
        instructorId: instructor.id,
        autonomousInstructors,
        publishedWeeks: publishedWeeks.map((pw) => ({
          id: pw.id,
          weekStart: pw.weekStart instanceof Date
            ? `${pw.weekStart.getFullYear()}-${String(pw.weekStart.getMonth() + 1).padStart(2, "0")}-${String(pw.weekStart.getDate()).padStart(2, "0")}`
            : String(pw.weekStart),
          publishedAt: pw.publishedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}

const patchSchema = z.object({
  bookingSlotDurations: z.array(z.number().int().min(30).max(120)).optional(),
  roundedHoursOnly: z.boolean().optional(),
  appBookingActors: z.enum(["students", "instructors", "both"]).optional(),
  instructorBookingMode: z.enum(["manual_full", "manual_engine"]).optional(),
  swapEnabled: z.boolean().optional(),
  swapNotifyMode: z.enum(["all", "available_only"]).optional(),
  bookingCutoffEnabled: z.boolean().optional(),
  bookingCutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weeklyBookingLimitEnabled: z.boolean().optional(),
  weeklyBookingLimit: z.number().int().min(1).max(50).optional(),
  emptySlotNotificationEnabled: z.boolean().optional(),
  emptySlotNotificationTarget: z.enum(["all", "availability_matching"]).optional(),
  emptySlotNotificationTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  restrictedTimeRangeEnabled: z.boolean().optional(),
  restrictedTimeRangeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  restrictedTimeRangeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weeklyAbsenceEnabled: z.boolean().optional(),
  availabilityMode: z.enum(["default", "publication"]).optional(),
  assignStudentIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      !isInstructor(membership.autoscuolaRole) &&
      !isOwner(membership.autoscuolaRole) &&
      membership.role !== "admin"
    ) {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const payload = patchSchema.parse(body);

    const instructor = await prisma.autoscuolaInstructor.findFirst({
      where: {
        companyId: membership.companyId,
        userId: membership.userId,
        status: { not: "inactive" },
      },
      select: {
        id: true,
        autonomousMode: true,
        settings: true,
      },
    });

    if (!instructor) {
      return NextResponse.json(
        { success: false, message: "Profilo istruttore non trovato." },
        { status: 404 },
      );
    }

    const current = parseInstructorSettings(instructor.settings);
    const next: InstructorSettings = { ...current };

    // availabilityMode can be saved regardless of autonomousMode
    const { assignStudentIds, availabilityMode, ...autonomousPayload } = payload;
    if (availabilityMode !== undefined) {
      next.availabilityMode = availabilityMode;
    }

    // All other settings require autonomousMode
    const hasAutonomousFields = Object.values(autonomousPayload).some((v) => v !== undefined);
    if ((hasAutonomousFields || assignStudentIds !== undefined) && !instructor.autonomousMode) {
      return NextResponse.json(
        { success: false, message: "La modalità autonoma non è attiva per il tuo profilo." },
        { status: 403 },
      );
    }

    for (const [key, value] of Object.entries(autonomousPayload)) {
      if (value !== undefined) {
        (next as Record<string, unknown>)[key] = value;
      }
    }

    await prisma.autoscuolaInstructor.update({
      where: { id: instructor.id },
      data: { settings: next },
    });

    // Handle student assignment changes
    if (assignStudentIds !== undefined) {
      await prisma.$transaction([
        // Remove current assignments for this instructor
        prisma.companyMember.updateMany({
          where: {
            companyId: membership.companyId,
            assignedInstructorId: instructor.id,
          },
          data: { assignedInstructorId: null },
        }),
        // Assign provided students to this instructor
        ...(assignStudentIds.length > 0
          ? [
              prisma.companyMember.updateMany({
                where: {
                  companyId: membership.companyId,
                  userId: { in: assignStudentIds },
                  autoscuolaRole: "STUDENT",
                },
                data: { assignedInstructorId: instructor.id },
              }),
            ]
          : []),
      ]);
    }

    return NextResponse.json({ success: true, data: next });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
