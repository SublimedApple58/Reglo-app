import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import { createExamEvent } from "@/lib/actions/autoscuole.actions";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";

const createExamSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  instructorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");

    // Allow INSTRUCTOR and OWNER (not just OWNER like the server action)
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
    const payload = createExamSchema.parse(body);

    // Instructors (autonomous or not) can create exams for any student in the company.
    // The exam priority rules will naturally apply based on the students' own scope.

    // Use the existing server action (it checks OWNER — we need to call it directly)
    // Since the action requires OWNER, we'll replicate the core logic here for INSTRUCTOR
    if (membership.autoscuolaRole === "INSTRUCTOR") {
      const companyId = membership.companyId;
      const startsAt = new Date(payload.startsAt);
      const endsAt = new Date(payload.endsAt);

      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        return NextResponse.json(
          { success: false, message: "Orario non valido." },
          { status: 400 },
        );
      }

      // Auto-assign the creating instructor if not explicitly provided,
      // so the exam shows up in the creator's agenda.
      let resolvedInstructorId: string | null = payload.instructorId ?? null;
      if (!resolvedInstructorId) {
        const selfInstructor = await prisma.autoscuolaInstructor.findFirst({
          where: { companyId, userId: membership.userId, status: { not: "inactive" } },
          select: { id: true },
        });
        resolvedInstructorId = selfInstructor?.id ?? null;
      } else {
        const instr = await prisma.autoscuolaInstructor.findFirst({
          where: { id: resolvedInstructorId, companyId, status: { not: "inactive" } },
          select: { id: true },
        });
        if (!instr) {
          return NextResponse.json(
            { success: false, message: "Istruttore non trovato." },
            { status: 404 },
          );
        }
      }

      const members = await prisma.companyMember.findMany({
        where: { companyId, userId: { in: payload.studentIds }, autoscuolaRole: "STUDENT" },
        select: { userId: true },
      });
      const validIds = new Set(members.map((m) => m.userId));
      const invalidIds = payload.studentIds.filter((id) => !validIds.has(id));
      if (invalidIds.length) {
        return NextResponse.json(
          { success: false, message: `${invalidIds.length} allievi non trovati.` },
          { status: 400 },
        );
      }

      // Overlap check: no active appointment on students or the assigned instructor
      const activeStatuses = ["scheduled", "confirmed", "proposal", "checked_in"];
      const studentConflicts = await prisma.autoscuolaAppointment.findMany({
        where: {
          companyId,
          studentId: { in: payload.studentIds },
          status: { in: activeStatuses },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { studentId: true },
      });
      if (studentConflicts.length) {
        const count = new Set(studentConflicts.map((a) => a.studentId)).size;
        return NextResponse.json(
          {
            success: false,
            message: `${count} ${count === 1 ? "allievo ha" : "allievi hanno"} già un impegno in quell'orario.`,
          },
          { status: 400 },
        );
      }
      if (resolvedInstructorId) {
        const instrConflict = await prisma.autoscuolaAppointment.findFirst({
          where: {
            companyId,
            instructorId: resolvedInstructorId,
            status: { in: activeStatuses },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { id: true },
        });
        if (instrConflict) {
          return NextResponse.json(
            { success: false, message: "Hai già un impegno in quell'orario." },
            { status: 400 },
          );
        }
      }

      const appointments = await prisma.$transaction(
        payload.studentIds.map((studentId) =>
          prisma.autoscuolaAppointment.create({
            data: {
              companyId,
              studentId,
              type: "esame",
              startsAt,
              endsAt,
              status: "scheduled",
              instructorId: resolvedInstructorId,
              vehicleId: null,
              notes: payload.notes ?? null,
              paymentRequired: false,
            },
          }),
        ),
      );

      await invalidateAutoscuoleCache({
        companyId,
        segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA, AUTOSCUOLE_CACHE_SEGMENTS.PAYMENTS],
      });

      return NextResponse.json({
        success: true,
        data: { count: appointments.length },
      });
    }

    // OWNER/admin: use the existing action
    const result = await createExamEvent(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 400 },
    );
  }
}
