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
      membership.role === "admin" || membership.autoscuolaRole === "OWNER";

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

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);

    if (endDate < startDate) {
      return NextResponse.json(
        { success: false, message: "Data fine deve essere dopo data inizio." },
        { status: 400 },
      );
    }

    // Determine the sick period bounds
    const sickStart = payload.startTime
      ? new Date(`${payload.startDate}T${payload.startTime}:00`)
      : new Date(`${payload.startDate}T00:00:00`);
    const sickEnd = new Date(`${payload.endDate}T23:59:59`);

    // Create instructor blocks for each day
    const blocks: { startsAt: Date; endsAt: Date }[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      const isFirstDay = dateStr === payload.startDate && payload.startTime;
      const blockStart = isFirstDay
        ? new Date(`${dateStr}T${payload.startTime}:00`)
        : new Date(`${dateStr}T00:00:00`);
      const blockEnd = new Date(`${dateStr}T23:59:59`);
      blocks.push({ startsAt: blockStart, endsAt: blockEnd });
      current.setDate(current.getDate() + 1);
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
      select: { id: true, studentId: true },
    });

    const cancelledIds: string[] = [];
    for (const appointment of appointments) {
      // Queue repositioning — this cancels the appointment, notifies the student,
      // and attempts to find a new slot automatically
      await queueOperationalRepositionForAppointment({
        companyId: membership.companyId,
        appointmentId: appointment.id,
        reason: "instructor_sick",
        actorUserId: membership.userId,
        attemptNow: true,
      });
      cancelledIds.push(appointment.id);

      // Additional sick-leave-specific push (the repositioning sends a generic one,
      // this one is more specific with the emoji and reason)
      if (appointment.studentId) {
        try {
          await sendAutoscuolaPushToUsers({
            companyId: membership.companyId,
            userIds: [appointment.studentId],
            title: "🤒 Guida cancellata",
            body: `La tua guida è stata cancellata perché l'istruttore ${targetInstructor.name} è in malattia. Stiamo cercando un nuovo orario.`,
            data: {
              kind: "sick_leave_cancelled",
              appointmentId: appointment.id,
              instructorName: targetInstructor.name,
            },
          });
        } catch (error) {
          console.error("Sick leave push error", error);
        }
      }
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
