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

export async function GET() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.autoscuolaRole !== "INSTRUCTOR" &&
      membership.autoscuolaRole !== "OWNER" &&
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
        },
      });
    }

    const settings = parseInstructorSettings(instructor.settings);

    return NextResponse.json({
      success: true,
      data: {
        autonomousMode: instructor.autonomousMode,
        settings,
        companyDefaults,
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
  instructorBookingMode: z.enum(["manual_full", "manual_engine", "guided_proposal"]).optional(),
  studentBookingMode: z.enum(["engine", "free_choice"]).optional(),
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
});

export async function PATCH(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      membership.autoscuolaRole !== "INSTRUCTOR" &&
      membership.autoscuolaRole !== "OWNER" &&
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

    if (!instructor.autonomousMode) {
      return NextResponse.json(
        { success: false, message: "La modalità autonoma non è attiva per il tuo profilo." },
        { status: 403 },
      );
    }

    const current = parseInstructorSettings(instructor.settings);
    const next: InstructorSettings = { ...current };

    // Apply all provided fields
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        (next as Record<string, unknown>)[key] = value;
      }
    }

    await prisma.autoscuolaInstructor.update({
      where: { id: instructor.id },
      data: { settings: next },
    });

    return NextResponse.json({ success: true, data: next });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
