import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { operationallyCancelAppointment } from "@/lib/autoscuole/operational-cancellation";
import { isOwner } from "@/lib/autoscuole/roles";

/**
 * Ferie istruttore. Stesso identico meccanismo della malattia
 * (instructor-sick-leave): scrive un blocco a giornata piena per ogni giorno
 * del periodo (reason "ferie"), poi cancella le guide che si sovrappongono —
 * ma con notifica dedicata all'allievo ("in ferie", reason instructor_vacation).
 */
const vacationSchema = z.object({
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
    const payload = vacationSchema.parse(body);

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
        { success: false, message: "Solo il titolare può segnare ferie per altri istruttori." },
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
    const ROME_OFFSET_HOURS = 2; // CEST (DST); CET is +1. Using +2 widens the window slightly.
    const toUtcFromRome = (dateStr: string, timeStr: string) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const [h, min] = timeStr.split(":").map(Number);
      return new Date(Date.UTC(y, m - 1, d, h - ROME_OFFSET_HOURS, min, 0));
    };

    const vacStart = payload.startTime
      ? toUtcFromRome(payload.startDate, payload.startTime)
      : toUtcFromRome(payload.startDate, "00:00");
    const vacEnd = toUtcFromRome(payload.endDate, "23:59");

    if (vacEnd < vacStart) {
      return NextResponse.json(
        { success: false, message: "Data fine deve essere dopo data inizio." },
        { status: 400 },
      );
    }

    // Blocco a giornata piena per ogni giorno del periodo (confini giorno Rome in UTC).
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

    await prisma.$transaction(
      blocks.map((block) =>
        prisma.autoscuolaInstructorBlock.create({
          data: {
            companyId: membership.companyId,
            instructorId: targetInstructor.id,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            reason: "ferie",
          },
        }),
      ),
    );

    // Cancella le guide dell'istruttore nel periodo di ferie.
    const appointments = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: membership.companyId,
        instructorId: targetInstructor.id,
        status: { in: ["scheduled", "confirmed", "checked_in"] },
        startsAt: { gte: vacStart, lte: vacEnd },
      },
      select: { id: true },
    });

    const cancelledIds: string[] = [];
    for (const appointment of appointments) {
      await operationallyCancelAppointment({
        companyId: membership.companyId,
        appointmentId: appointment.id,
        reason: "instructor_vacation",
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
