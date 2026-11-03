"use server";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { ensureLocationInviteCode } from "@/lib/autoscuole/invite-codes";
import { getLocationAvailabilityState } from "@/lib/autoscuole/member-locations";

// ---------------------------------------------------------------------------
// Codici di invito per luogo (REG-706)
// Stessi permessi del codice dell'autoscuola (`getCompanyInviteCode`): chi
// vede la «Chiave di accesso» in Allievi. Solo con «Disponibilità per luogo»
// effettiva (interruttore acceso + almeno 2 luoghi); spenta, `enabled: false`
// e nessun codice (non se ne generano).
// ---------------------------------------------------------------------------

export type LocationInviteCode = {
  id: string;
  name: string;
  address: string | null;
  isPrecise: boolean;
  isDefault: boolean;
  code: string | null;
};

export async function getLocationInviteCodes() {
  try {
    const { activeCompanyId } = await requireServiceAccess("AUTOSCUOLE");
    const state = await getLocationAvailabilityState(activeCompanyId);
    if (!state.enabled) {
      return { success: true as const, data: { enabled: false, locations: [] as LocationInviteCode[] } };
    }
    const locations = await prisma.autoscuolaLocation.findMany({
      where: { companyId: activeCompanyId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, address: true, isPrecise: true, isDefault: true, inviteCode: true },
    });
    const data: LocationInviteCode[] = [];
    for (const loc of locations) {
      data.push({
        id: loc.id,
        name: loc.name,
        address: loc.address,
        isPrecise: loc.isPrecise,
        isDefault: loc.isDefault,
        code: loc.inviteCode ?? (await ensureLocationInviteCode(loc.id)),
      });
    }
    return { success: true as const, data: { enabled: true, locations: data } };
  } catch (error) {
    return { success: false as const, message: formatError(error), data: null };
  }
}
