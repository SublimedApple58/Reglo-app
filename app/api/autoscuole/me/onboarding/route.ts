import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";
import { validateStudentPhone } from "@/lib/autoscuole/student-onboarding";
import { syncInstructorName } from "@/lib/sync-instructor-name";
import { studentAvailabilityInputSchema } from "@/lib/autoscuole/student-availability";
import {
  getStudentOnboarding,
  resolveStudentAvailabilityInput,
  saveStudentAvailability,
} from "@/lib/autoscuole/student-availability-store";

/**
 * REG-802 — fine dell'onboarding dell'allievo in app («primo accesso normale»,
 * cellulare mancante, disponibilità). L'app manda in un colpo solo quello che
 * ha raccolto negli step; il server ricontrolla quali step erano dovuti (gli
 * stessi di `onboarding` in `/api/mobile/me`) e pretende i dati di quelli
 * obbligatori.
 *
 *   POST { firstName?, lastName?, phone?, availability?: { ranges } | { days } }
 *   → { onboarding }   (null quando non manca più niente)
 *
 * Il profilo si segna completo (`User.profileCompletedAt`) quando c'erano gli
 * step del profilo. L'email non si cambia da qui: si chiede al supporto.
 */
const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  availability: studentAvailabilityInputSchema.optional(),
});

const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status });

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") {
      return fail("Endpoint disponibile solo per gli allievi.", 403);
    }
    const body = bodySchema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { email: true, phone: true, profileCompletedAt: true },
    });
    if (!user) return fail("Utente non trovato.", 404);

    const due = (await getStudentOnboarding(user, membership))?.steps ?? [];
    const isDue = (key: string) => due.find((s) => s.key === key);

    const name =
      body.firstName && body.lastName ? `${body.firstName} ${body.lastName}`.replace(/\s+/g, " ") : null;
    if (isDue("name") && (!name || name.length < 3)) return fail("Scrivi nome e cognome.");

    let phone: string | null = null;
    if (body.phone) {
      const checked = validateStudentPhone(body.phone);
      if (!checked.ok) return fail(checked.message);
      phone = checked.e164;
    } else if (isDue("phone")) {
      return fail("Scrivi il tuo numero di cellulare.");
    }

    const resolved = body.availability
      ? await resolveStudentAvailabilityInput(membership.companyId, body.availability)
      : null;
    if (resolved && !resolved.ok) return fail(resolved.message);
    const ranges = resolved?.ok ? resolved.ranges : null;
    if (isDue("availability")?.required && !ranges) return fail("Indica quando puoi fare guida.");

    const profileStep = Boolean(isDue("name"));
    if (name || phone || profileStep) {
      await prisma.user.update({
        where: { id: membership.userId },
        data: {
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
          ...(profileStep ? { profileCompletedAt: new Date() } : {}),
        },
      });
      if (name) await syncInstructorName(membership.userId, name);
    }
    if (ranges) await saveStudentAvailability(membership.companyId, membership.userId, ranges);

    const fresh = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { email: true, phone: true, profileCompletedAt: true },
    });
    const member = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId: membership.companyId, userId: membership.userId } },
    });
    const onboarding = fresh ? await getStudentOnboarding(fresh, member) : null;
    return NextResponse.json({ success: true, data: { onboarding } });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
