import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

/**
 * Server-side notification aggregator.
 * Returns recent notification-worthy events from the database so the mobile app
 * can recover notifications missed when offline / no push token.
 *
 * Role-based:
 * - STUDENT: swap offers, proposals, sick leave cancellations, appointment
 *   cancellations, holiday declarations, waitlist offers, rescheduled appointments
 * - INSTRUCTOR: weekly absences, sick leave cancellations, rescheduled appointments
 * - OWNER: same as instructor
 */
export async function GET(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    const companyId = membership.companyId;
    const userId = membership.userId;
    const role = membership.autoscuolaRole;

    // Notifications from the last 14 days
    const since = new Date();
    since.setDate(since.getDate() - 14);

    type NotificationPayload = {
      id: string;
      kind: string;
      data: Record<string, unknown>;
      createdAt: string;
    };

    const notifications: NotificationPayload[] = [];

    if (role === "STUDENT") {
      // 1. Active swap offers (broadcasted, not expired, not from this student)
      const swapOffers = await prisma.autoscuolaSwapOffer.findMany({
        where: {
          companyId,
          status: "broadcasted",
          expiresAt: { gt: new Date() },
          requestingStudentId: { not: userId },
          createdAt: { gte: since },
        },
        include: {
          appointment: { select: { startsAt: true, endsAt: true, instructorId: true } },
          requestingStudent: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      for (const offer of swapOffers) {
        notifications.push({
          id: `swap_${offer.id}`,
          kind: "swap",
          data: {
            id: offer.id,
            requestingStudentName: offer.requestingStudent?.name ?? "Un allievo",
            appointment: {
              startsAt: offer.appointment.startsAt.toISOString(),
              endsAt: offer.appointment.endsAt?.toISOString() ?? null,
            },
            expiresAt: offer.expiresAt.toISOString(),
          },
          createdAt: offer.createdAt.toISOString(),
        });
      }

      // 2. Pending proposals (appointments with status "proposal" for this student)
      const proposals = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: userId,
          status: "proposal",
          startsAt: { gte: new Date() },
          createdAt: { gte: since },
        },
        include: {
          instructor: { select: { name: true } },
          vehicle: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      for (const p of proposals) {
        notifications.push({
          id: `proposal_${p.id}`,
          kind: "proposal",
          data: {
            id: p.id,
            startsAt: p.startsAt.toISOString(),
            endsAt: p.endsAt?.toISOString() ?? null,
            instructorName: p.instructor?.name ?? null,
            vehicleName: p.vehicle?.name ?? null,
            type: p.type,
          },
          createdAt: p.createdAt.toISOString(),
        });
      }

      // 3. Sick leave cancellations (appointments cancelled due to instructor sick)
      const sickCancellations = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: userId,
          status: "cancelled",
          cancellationReason: "instructor_sick",
          cancelledAt: { gte: since },
        },
        include: {
          instructor: { select: { name: true } },
        },
        orderBy: { cancelledAt: "desc" },
        take: limit,
      });
      for (const appt of sickCancellations) {
        notifications.push({
          id: `sick_leave_${appt.id}`,
          kind: "sick_leave_cancelled",
          data: {
            appointmentId: appt.id,
            instructorName: appt.instructor?.name ?? "",
            startsAt: appt.startsAt.toISOString(),
          },
          createdAt: (appt.cancelledAt ?? appt.updatedAt).toISOString(),
        });
      }

      // 4. Cancelled appointments (non-sick — sick_leave_cancelled handled above)
      const cancelledAppointments = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: userId,
          status: "cancelled",
          cancelledAt: { gte: since },
          cancellationReason: { not: "instructor_sick" },
          cancelledByUserId: { not: userId },
        },
        include: {
          instructor: { select: { name: true } },
        },
        orderBy: { cancelledAt: "desc" },
        take: limit,
      });
      for (const appt of cancelledAppointments) {
        notifications.push({
          id: `cancelled_${appt.id}`,
          kind: "appointment_cancelled",
          data: {
            appointmentId: appt.id,
            startsAt: appt.startsAt.toISOString(),
            instructorName: appt.instructor?.name ?? "",
            cancellationKind: appt.cancellationKind ?? "manual_cancel",
          },
          createdAt: (appt.cancelledAt ?? appt.updatedAt).toISOString(),
        });
      }

      // 5. Holiday declarations
      const holidays = await prisma.autoscuolaHoliday.findMany({
        where: {
          companyId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      for (const h of holidays) {
        const dateStr = h.date instanceof Date
          ? h.date.toISOString().slice(0, 10)
          : String(h.date);
        notifications.push({
          id: `holiday_${h.id}`,
          kind: "holiday_declared",
          data: {
            date: dateStr,
            label: h.label ?? undefined,
            appointmentsCancelled: true,
          },
          createdAt: h.createdAt.toISOString(),
        });
      }

      // 6. Active waitlist offers (slot became available)
      const waitlistOffers = await prisma.autoscuolaWaitlistOffer.findMany({
        where: {
          companyId,
          status: "broadcasted",
          expiresAt: { gt: new Date() },
          createdAt: { gte: since },
        },
        include: {
          slot: { select: { startsAt: true, endsAt: true, ownerId: true, ownerType: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      for (const offer of waitlistOffers) {
        notifications.push({
          id: `waitlist_${offer.id}`,
          kind: "waitlist",
          data: {
            id: offer.id,
            slot: {
              startsAt: offer.slot.startsAt.toISOString(),
              endsAt: offer.slot.endsAt.toISOString(),
            },
            expiresAt: offer.expiresAt.toISOString(),
          },
          createdAt: offer.createdAt.toISOString(),
        });
      }

      // 7. Rescheduled appointments (student's lessons that were moved)
      const rescheduledStudent = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: userId,
          rescheduledAt: { gte: since },
        },
        orderBy: { rescheduledAt: "desc" },
        take: limit,
      });
      for (const appt of rescheduledStudent) {
        notifications.push({
          id: `reschedule_${appt.id}`,
          kind: "appointment_rescheduled",
          data: {
            appointmentId: appt.id,
            startsAt: appt.startsAt.toISOString(),
            oldStartsAt: appt.rescheduledFromStartsAt?.toISOString() ?? "",
          },
          createdAt: appt.rescheduledAt!.toISOString(),
        });
      }
    }

    if (role === "INSTRUCTOR" || role === "OWNER") {
      // Find instructor profile
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: { companyId, userId, status: { not: "inactive" } },
        select: { id: true },
      });

      if (instructor) {
        // Rescheduled appointments (instructor's lessons moved by the owner)
        const rescheduledInstr = await prisma.autoscuolaAppointment.findMany({
          where: {
            companyId,
            instructorId: instructor.id,
            rescheduledAt: { gte: since },
          },
          orderBy: { rescheduledAt: "desc" },
          take: limit,
        });
        for (const appt of rescheduledInstr) {
          notifications.push({
            id: `reschedule_${appt.id}`,
            kind: "appointment_rescheduled",
            data: {
              appointmentId: appt.id,
              startsAt: appt.startsAt.toISOString(),
              oldStartsAt: appt.rescheduledFromStartsAt?.toISOString() ?? "",
            },
            createdAt: appt.rescheduledAt!.toISOString(),
          });
        }

        // Weekly absences from assigned students
        const absences = await prisma.autoscuolaStudentWeeklyAbsence.findMany({
          where: {
            companyId,
            instructorId: instructor.id,
            createdAt: { gte: since },
          },
          include: {
            student: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        for (const absence of absences) {
          const weekStartStr = absence.weekStart instanceof Date
            ? `${absence.weekStart.getFullYear()}-${String(absence.weekStart.getMonth() + 1).padStart(2, "0")}-${String(absence.weekStart.getDate()).padStart(2, "0")}`
            : String(absence.weekStart);
          notifications.push({
            id: `weekly_absence_${absence.id}`,
            kind: "weekly_absence",
            data: {
              studentId: absence.studentId,
              studentName: absence.student?.name ?? "Un allievo",
              weekStart: weekStartStr,
            },
            createdAt: absence.createdAt.toISOString(),
          });
        }
      }
    }

    // Sort by createdAt desc and apply limit
    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const trimmed = notifications.slice(0, limit);

    return NextResponse.json({ success: true, data: trimmed });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
