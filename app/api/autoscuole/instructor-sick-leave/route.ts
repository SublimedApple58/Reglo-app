import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import { sendAutoscuolaPushToUsers } from "@/lib/autoscuole/push";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  queueOperationalRepositionForAppointment,
} from "@/lib/autoscuole/repositioning";
import { isOwner } from "@/lib/autoscuole/roles";

const sickLeaveSchema = z.object({
  instructorId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const isOwnerOrAdmin =
      membership.role === "admin" || isOwner(membership.autoscuolaRole);

    const body = await request.json();
    const payload = sickLeaveSchema.parse(body);

    let resolvedInstructorId = payload.instructorId;

    if (!resolvedInstructorId) {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: {
          companyId: membership.companyId,
          userId: membership.userId,
          status: { not: "inactive" },
        },
        select: { id: true },
      });
      if (!instructor) {
        return NextResponse.json(
          { success: false, message: "Profilo istruttore non trovato." },
          { status: 404 },
        );
      }
      resolvedInstructorId = instructor.id;
    } else if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { success: false, message: "Solo il titolare può segnare malattia per altri istruttori." },
        { status: 403 },
      );
    }

    const targetInstructor = await prisma.autoscuolaInstructor.findFirst({
      where: {
        id: resolvedInstructorId,
        companyId: membership.companyId,
        status: { not: "inactive" },
      },
      select: { id: true, name: true },
    });
    if (!targetInstructor) {
      return NextResponse.json(
        { success: false, message: "Istruttore non trovato." },
        { status: 404 },
      );
    }

    // Rome-timezone-aware date parsing (business is Italian driving school).
    // Convert "YYYY-MM-DD HH:mm Rome" → UTC Date.
    const ROME_OFFSET_HOURS = 2; // CEST (DST); CET is +1. Using +2 to be safe — widens the window slightly.
    const toUtcFromRome = (dateStr: string, timeStr: string) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const [h, min] = timeStr.split(":").map(Number);
      return new Date(Date.UTC(y, m - 1, d, h - ROME_OFFSET_HOURS, min, 0));
    };

    const sickStart = payload.startTime
      ? toUtcFromRome(payload.startDate, payload.startTime)
      : toUtcFromRome(payload.startDate, "00:00");
    const sickEnd = toUtcFromRome(payload.endDate, "23:59");

    if (sickEnd < sickStart) {
      return NextResponse.json(
        { success: false, message: "Data fine deve essere dopo data inizio." },
        { status: 400 },
      );
    }

    // Create instructor blocks for each day (using Rome-local day boundaries in UTC)
    const [sy, sm, sd] = payload.startDate.split("-").map(Number);
    const [ey, em, ed] = payload.endDate.split("-").map(Number);
    const blocks: { startsAt: Date; endsAt: Date }[] = [];
    for (
      let d = new Date(Date.UTC(sy, sm - 1, sd));
      d.getTime() <= Date.UTC(ey, em - 1, ed);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isFirstDay = dateStr === payload.startDate && Boolean(payload.startTime);
      const blockStart = isFirstDay && payload.startTime
        ? toUtcFromRome(dateStr, payload.startTime)
        : toUtcFromRome(dateStr, "00:00");
      const blockEnd = toUtcFromRome(dateStr, "23:59");
      blocks.push({ startsAt: blockStart, endsAt: blockEnd });
    }

    // Create blocks in transaction
    await prisma.$transaction(
      blocks.map((block) =>
        prisma.autoscuolaInstructorBlock.create({
          data: {
            companyId: membership.companyId,
            instructorId: targetInstructor.id,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            reason: "sick_leave",
          },
        }),
      ),
    );

    // Cancel appointments and queue repositioning
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        instructorId: targetInstructor.id,
        status: { in: ["scheduled", "confirmed", "proposal", "checked_in"] },
        startsAt: { gte: sickStart, lte: sickEnd },
      },
      select: { id: true, studentId: true, startsAt: true, status: true },
    });

    console.log("[sick-leave] Query result", {
      instructorId: targetInstructor.id,
      sickStartIso: sickStart.toISOString(),
      sickEndIso: sickEnd.toISOString(),
      appointmentsFound: appointments.length,
      appointments: appointments.map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        status: a.status,
      })),
    });

    const cancelledIds: string[] = [];
    for (const appointment of appointments) {
      // Queue repositioning — cancels the appointment, notifies the student
      // (with sick-leave-specific wording from formatCancellationBody),
      // and attempts to find a new slot automatically (unless student is in manual_full cluster).
      await queueOperationalRepositionForAppointment({
        companyId: membership.companyId,
        appointmentId: appointment.id,
        reason: "instructor_sick",
        actorUserId: membership.userId,
        attemptNow: true,
      });
      cancelledIds.push(appointment.id);
    }

    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
    });

    return NextResponse.json({
      success: true,
      data: {
        blocksCreated: blocks.length,
        appointmentsCancelled: cancelledIds.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
