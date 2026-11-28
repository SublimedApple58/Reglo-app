import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/db/prisma";
import { clientIp, hitRateLimit } from "@/lib/auth/rate-limit";
import { buildSignupInstructor } from "@/lib/autoscuole/signup-instructor";
import { resolveSignupInviteCode } from "@/lib/autoscuole/signup-invite";
import { isEntryClosedByMaintenance, MAINTENANCE_PUBLIC_MESSAGE } from "@/lib/maintenance";
import { getSignedAssetUrl } from "@/lib/storage/r2";

/**
 * REG-812 — controlli della registrazione a passi dell'app, PRIMA di creare
 * l'account (`POST /api/mobile/auth/student-register` resta l'unico punto che
 * scrive e rifà gli stessi controlli).
 *
 *   { schoolCode } → l'autoscuola del codice (nome, logo), l'eventuale
 *                    istruttore (nome, foto, colore: REG-818) o luogo, e se
 *                    chiederà la patente all'allievo
 *   { email }      → l'email è libera?
 *
 * Senza sessione: limite di tentativi per IP (i codici sono di 6 caratteri).
 */
const schema = z.union([
  z.object({ schoolCode: z.string().trim().min(1) }),
  z.object({ email: z.string().trim().min(1) }),
]);

const SIGNUP_RATE_LIMIT_MESSAGE = "Troppi tentativi. Riprova tra qualche minuto.";

const fail = (message: string, status: number) =>
  NextResponse.json({ success: false, message }, { status });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Richiesta non valida.", 400);

  const ip = clientIp(request);

  if ("email" in parsed.data) {
    if (!(await hitRateLimit(`signup-email:ip:${ip}`, 30, 15 * 60))) {
      return fail(SIGNUP_RATE_LIMIT_MESSAGE, 429);
    }
    const email = parsed.data.email.toLowerCase();
    if (!z.string().email().safeParse(email).success) {
      return fail("Controlla l'email: non sembra valida.", 400);
    }
    // Sola lettura: un account orfano (senza autoscuole) verrà liberato dalla
    // registrazione vera, quindi qui conta come libero.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { _count: { select: { companyMembers: true } } },
    });
    const available = !existing || existing._count.companyMembers === 0;
    return NextResponse.json({ success: true, data: { emailAvailable: available } });
  }

  if (!(await hitRateLimit(`signup-code:ip:${ip}`, 20, 15 * 60))) {
    return fail(SIGNUP_RATE_LIMIT_MESSAGE, 429);
  }

  const invite = await resolveSignupInviteCode(parsed.data.schoolCode);
  const company = invite
    ? await prisma.company.findUnique({
        where: { id: invite.companyId },
        select: { id: true, name: true, logoKey: true, maintenanceScope: true },
      })
    : null;
  if (!invite || !company) return fail("Questo codice non esiste. Controlla di averlo scritto bene.", 404);
  if (isEntryClosedByMaintenance(company.maintenanceScope)) return fail(MAINTENANCE_PUBLIC_MESSAGE, 403);

  const [service, instructor, location] = await Promise.all([
    prisma.companyService.findFirst({
      where: { companyId: company.id, serviceKey: "AUTOSCUOLE", status: "ACTIVE" },
      select: { limits: true },
    }),
    invite.assignedInstructorId
      ? prisma.autoscuolaInstructor.findUnique({
          where: { id: invite.assignedInstructorId },
          select: { name: true, color: true, user: { select: { image: true, imageAvatar: true } } },
        })
      : null,
    invite.locationId
      ? prisma.autoscuolaLocation.findUnique({ where: { id: invite.locationId }, select: { name: true } })
      : null,
  ]);
  if (!service) return fail("Questa autoscuola non è attiva.", 403);

  let logoUrl: string | null = null;
  if (company.logoKey) {
    logoUrl = await getSignedAssetUrl(company.logoKey).catch(() => null);
  }

  // REG-818: la conferma mostra l'istruttore del codice (foto o iniziali).
  const instructorCard = await buildSignupInstructor(instructor, getSignedAssetUrl);

  const limits = (service.limits ?? null) as Record<string, unknown> | null;
  return NextResponse.json({
    success: true,
    data: {
      company: { name: company.name, logoUrl },
      // `instructorName` resta per le app già installate (REG-812).
      instructorName: instructor?.name ?? null,
      instructor: instructorCard,
      locationName: location?.name ?? null,
      // REG-424: con la patente fissa l'allievo non la sceglie.
      asksLicensePath: limits?.licensePathMode !== "fixed_default",
    },
  });
}
