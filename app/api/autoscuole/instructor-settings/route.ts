import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import {
  parseInstructorSettings,
  type InstructorSettings,
} from "@/lib/autoscuole/instructor-clusters";
import { normalizeBookingSlotDurations } from "@/lib/autoscuole/lesson-policy";

export async function GET() {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "INSTRUCTOR" && membership.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Operazione non consentita." },
        { status: 403 },
      );
    }

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

    // Load company defaults
    const service = await prisma.companyService.findFirst({
      where: { companyId: membership.companyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const companyBookingSlotDurations = normalizeBookingSlotDurations(
      limits.bookingSlotDurations,
    );
    const companyRoundedHoursOnly = limits.roundedHoursOnly === true;

    const settings = parseInstructorSettings(instructor.settings);

    return NextResponse.json({
      success: true,
      data: {
        autonomousMode: instructor.autonomousMode,
        settings,
        companyDefaults: {
          bookingSlotDurations: companyBookingSlotDurations,
          roundedHoursOnly: companyRoundedHoursOnly,
        },
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
});

export async function PATCH(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "INSTRUCTOR" && membership.role !== "admin") {
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
    const next: InstructorSettings = {
      ...current,
      ...(payload.bookingSlotDurations !== undefined
        ? { bookingSlotDurations: payload.bookingSlotDurations }
        : {}),
      ...(payload.roundedHoursOnly !== undefined
        ? { roundedHoursOnly: payload.roundedHoursOnly }
        : {}),
    };

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
