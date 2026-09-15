import { NextResponse } from "next/server";
import { z } from "zod";
import { requireServiceAccess } from "@/lib/service-access";
import {
  linkStudentToInstructor,
  previewInstructorLink,
} from "@/lib/autoscuole/instructor-link";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { formatError } from "@/lib/utils";

/**
 * REG-451 — l'allievo si associa a un istruttore leggendo il QR della sua card.
 * GET  ?code=<codice o URL del QR> → anteprima per la schermata di conferma.
 * POST { code }                     → imposta l'istruttore di riferimento.
 * Self-scoped: agisce solo sulla membership STUDENT dell'utente nell'autoscuola attiva.
 */
const onlyStudents = () =>
  NextResponse.json(
    { success: false, message: "Endpoint disponibile solo per gli allievi." },
    { status: 403 },
  );

export async function GET(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") return onlyStudents();
    const code = new URL(request.url).searchParams.get("code");
    const preview = await previewInstructorLink(
      { companyId: membership.companyId, userId: membership.userId },
      code,
    );
    return NextResponse.json({ success: true, data: preview });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}

const bodySchema = z.object({ code: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (membership.autoscuolaRole !== "STUDENT") return onlyStudents();
    const { code } = bodySchema.parse(await request.json());
    const result = await linkStudentToInstructor(
      { companyId: membership.companyId, userId: membership.userId },
      code,
    );
    if (result.status === "linked") {
      await invalidateAutoscuoleCache({
        companyId: membership.companyId,
        segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
      });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: formatError(error) }, { status: 400 });
  }
}
