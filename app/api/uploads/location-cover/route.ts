import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { requireServiceAccess } from "@/lib/service-access";
import { ACTIVE_COMPANY_REQUIRED, NO_COMPANY_FOUND } from "@/lib/company-context";
import { isOwner } from "@/lib/autoscuole/roles";
import {
  coverPhotoUrl,
  removeSedeCoverPhoto,
  saveSedeCoverPhoto,
} from "@/lib/autoscuole/location-cover";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";

export const runtime = "nodejs";

/** Sotto il limite di 4,5 MB del body delle funzioni Vercel: il browser rimpicciolisce prima di inviare. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Foto di copertina della SEDE (REG-639). POST `file` = carica o sostituisce,
 * DELETE = rimuove. Solo il titolare, solo la sede dell'autoscuola attiva.
 */
/** Errori di accesso di `requireServiceAccess` → 401/403, mai 500. */
const ACCESS_ERRORS: Record<string, { status: number; message: string }> = {
  USER_NOT_AUTHENTICATED: { status: 401, message: "Accedi per continuare." },
  [NO_COMPANY_FOUND]: { status: 403, message: "Nessuna autoscuola associata." },
  [ACTIVE_COMPANY_REQUIRED]: { status: 403, message: "Scegli prima un'autoscuola." },
  SERVICE_NOT_ACTIVE: { status: 403, message: "Servizio non attivo." },
};

async function resolveSede() {
  let membership;
  try {
    ({ membership } = await requireServiceAccess("AUTOSCUOLE"));
  } catch (error) {
    const known = error instanceof Error ? ACCESS_ERRORS[error.message] : undefined;
    if (!known) throw error;
    return { error: NextResponse.json({ success: false, message: known.message }, { status: known.status }) };
  }
  if (!isOwner(membership.autoscuolaRole)) {
    return { error: NextResponse.json({ success: false, message: "Solo il titolare può cambiare la foto della sede." }, { status: 403 }) };
  }
  const sede = await prisma.autoscuolaLocation.findFirst({
    where: { companyId: membership.companyId, isDefault: true, archivedAt: null },
    select: { id: true, coverPhotoKey: true },
  });
  if (!sede) {
    return { error: NextResponse.json({ success: false, message: "Imposta prima la sede dell'autoscuola." }, { status: 400 }) };
  }
  return { companyId: membership.companyId, sede };
}

async function invalidate(companyId: string) {
  await invalidateAutoscuoleCache({ companyId, segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS] });
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveSede();
    if ("error" in ctx) return ctx.error;

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "Nessuna foto ricevuta." }, { status: 400 });
    }
    if (!IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: "Usa una foto JPG, PNG o WebP." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, message: "La foto è troppo pesante." }, { status: 400 });
    }

    const key = await saveSedeCoverPhoto({
      companyId: ctx.companyId,
      locationId: ctx.sede.id,
      previousKey: ctx.sede.coverPhotoKey,
      file: Buffer.from(await file.arrayBuffer()),
    });
    await invalidate(ctx.companyId);
    return NextResponse.json({ success: true, data: { url: await coverPhotoUrl(key) } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Caricamento non riuscito." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const ctx = await resolveSede();
    if ("error" in ctx) return ctx.error;
    await removeSedeCoverPhoto({ locationId: ctx.sede.id, previousKey: ctx.sede.coverPhotoKey });
    await invalidate(ctx.companyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Rimozione non riuscita." },
      { status: 500 },
    );
  }
}
