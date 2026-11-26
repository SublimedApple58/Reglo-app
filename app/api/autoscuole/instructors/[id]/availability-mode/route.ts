import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { AUTOSCUOLE_CACHE_SEGMENTS, invalidateAutoscuoleCache } from "@/lib/autoscuole/cache";
import { isOwner } from "@/lib/autoscuole/roles";
import { requireServiceAccess } from "@/lib/service-access";
import { formatError } from "@/lib/utils";

/**
 * REG-794: modalità di disponibilità («Predefinita» / «A pubblicazione») di un
 * istruttore, letta e cambiata dal titolare dall'app.
 *
 * `PATCH instructors/[id]` sostituisce tutto `settings` con quello che riceve
 * (e il mobile conosce solo una parte dei campi); `instructor-settings` vale
 * solo per sé stessi. Qui si tocca SOLO la chiave `availabilityMode` del JSON
 * salvato: ogni altro campo, anche quelli che `parseInstructorSettings` non
 * conosce, resta com'è.
 *
 * Solo titolare, istruttore titolare o admin; l'istruttore dev'essere della
 * sua autoscuola.
 */

type Mode = "default" | "publication";

const patchSchema = z.object({ availabilityMode: z.enum(["default", "publication"]) });

const readMode = (settings: unknown): Mode =>
  settings && typeof settings === "object" && (settings as Record<string, unknown>).availabilityMode === "publication"
    ? "publication"
    : "default";

async function loadForOwner(id: string) {
  const { membership } = await requireServiceAccess("AUTOSCUOLE");
  if (membership.role !== "admin" && !isOwner(membership.autoscuolaRole)) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "Operazione non consentita." }, { status: 403 }) };
  }
  const instructor = await prisma.autoscuolaInstructor.findFirst({
    where: { id, companyId: membership.companyId },
    select: { id: true, settings: true },
  });
  if (!instructor) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "Istruttore non trovato." }, { status: 404 }) };
  }
  return { ok: true as const, membership, instructor };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await loadForOwner(id);
    if (!res.ok) return res.response;
    return NextResponse.json({
      success: true,
      data: { instructorId: res.instructor.id, availabilityMode: readMode(res.instructor.settings) },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = patchSchema.parse(await request.json());
    const res = await loadForOwner(id);
    if (!res.ok) return res.response;
    const { membership, instructor } = res;

    const current =
      instructor.settings && typeof instructor.settings === "object" && !Array.isArray(instructor.settings)
        ? (instructor.settings as Record<string, unknown>)
        : {};
    const next = { ...current, availabilityMode: payload.availabilityMode };

    await prisma.autoscuolaInstructor.update({
      where: { id: instructor.id },
      data: { settings: next as Prisma.InputJsonObject },
    });
    // Come il cambio di modalità dal web (`updateAutoscuolaInstructor`).
    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });

    return NextResponse.json({
      success: true,
      data: { instructorId: instructor.id, availabilityMode: payload.availabilityMode },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
