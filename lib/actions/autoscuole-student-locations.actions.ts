"use server";

import { z } from "zod";

import { formatError } from "@/lib/utils";
import { requireServiceAccess } from "@/lib/service-access";
import { isInstructor, isOwner } from "@/lib/autoscuole/roles";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import {
  MemberLocationError,
  setStudentLocations as writeStudentLocations,
} from "@/lib/autoscuole/member-locations";

// ---------------------------------------------------------------------------
// Luoghi dell'allievo (REG-705)
// Stessi permessi del luogo di default (REG-392): istruttore + titolare, web e
// mobile. Lista vuota = l'allievo vede tutti i luoghi.
// ---------------------------------------------------------------------------

const setStudentLocationsSchema = z.object({
  studentId: z.string().uuid(),
  locationIds: z.array(z.string().uuid()).max(50),
});

export async function setStudentLocations(
  input: z.infer<typeof setStudentLocationsSchema>,
) {
  try {
    const { membership } = await requireServiceAccess("AUTOSCUOLE");
    if (
      !isInstructor(membership.autoscuolaRole) &&
      !isOwner(membership.autoscuolaRole) &&
      membership.role !== "admin"
    ) {
      return { success: false as const, message: "Operazione non consentita." };
    }
    const payload = setStudentLocationsSchema.parse(input);
    const data = await writeStudentLocations({
      companyId: membership.companyId,
      userId: payload.studentId,
      locationIds: payload.locationIds,
    });
    // I luoghi cambiano gli slot che l'allievo vede.
    await invalidateAutoscuoleCache({
      companyId: membership.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.AGENDA],
    });
    return { success: true as const, data };
  } catch (error) {
    if (error instanceof MemberLocationError) {
      return { success: false as const, message: error.message };
    }
    return { success: false as const, message: formatError(error) };
  }
}
