import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import { createExamEvent } from "@/lib/actions/autoscuole.actions";

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

    // For instructors: validate students are in their cluster (if autonomous)
    if (membership.autoscuolaRole === "INSTRUCTOR") {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: {
          companyId: membership.companyId,
          userId: membership.userId,
          status: { not: "inactive" },
        },
        select: { id: true, autonomousMode: true },
      });

      if (instructor?.autonomousMode) {
        const assignedMembers = await prisma.companyMember.findMany({
          where: {
            companyId: membership.companyId,
            assignedInstructorId: instructor.id,
            autoscuolaRole: "STUDENT",
          },
          select: { userId: true },
        });
        const assignedIds = new Set(assignedMembers.map((m) => m.userId));
        const unauthorized = payload.studentIds.filter((id) => !assignedIds.has(id));
        if (unauthorized.length) {
          return NextResponse.json(
            { success: false, message: `${unauthorized.length} allievi non assegnati al tuo gruppo.` },
            { status: 403 },
          );
        }
      }
    }

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

      if (payload.instructorId) {
        const instr = await prisma.autoscuolaInstructor.findFirst({
          where: { id: payload.instructorId, companyId, status: { not: "inactive" } },
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
              instructorId: payload.instructorId ?? null,
              vehicleId: null,
              notes: payload.notes ?? null,
              paymentRequired: false,
            },
          }),
        ),
      );

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
