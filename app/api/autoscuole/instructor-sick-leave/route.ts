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
import { operationallyCancelAppointment } from "@/lib/autoscuole/operational-cancellation";
import { isOwner } from "@/lib/autoscuole/roles";
import { buildLeaveWindow } from "@/lib/autoscuole/leave-window";

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

    // REG-797: offset di Roma della data (ora legale compresa), non +2 fisso.
    const leave = buildLeaveWindow(payload);
    const sickStart = leave.start;
    const sickEnd = leave.end;

    if (sickEnd < sickStart) {
      return NextResponse.json(
        { success: false, message: "Data fine deve essere dopo data inizio." },
        { status: 400 },
      );
    }

    const blocks = leave.blocks;

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

    // Cancel the instructor's lessons in the sick-leave window.
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        instructorId: targetInstructor.id,
        status: { in: ["scheduled", "confirmed", "checked_in"] },
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
      // Cancel the appointment + refund the credit + notify the student with
      // sick-leave-specific wording. No automatic repositioning.
      await operationallyCancelAppointment({
        companyId: membership.companyId,
        appointmentId: appointment.id,
        reason: "instructor_sick",
        actorUserId: membership.userId,
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
