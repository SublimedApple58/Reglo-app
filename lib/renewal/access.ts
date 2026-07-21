import "server-only";

import { requireServiceAccess } from "@/lib/service-access";
import { isOwner } from "@/lib/autoscuole/roles";
import { getServiceLimits, normalizeCompanyServices } from "@/lib/services";

/**
 * Rinnovo Patenti — admin gate.
 * Requires: AUTOSCUOLE service active + `licenseRenewalEnabled` flag + OWNER role.
 * Used by every management server action of the Rinnovi section.
 */
export async function requireRenewalOwner() {
  const context = await requireServiceAccess("AUTOSCUOLE");
  const limits = getServiceLimits(
    normalizeCompanyServices(context.company.services),
    "AUTOSCUOLE",
  );
  if (!limits.licenseRenewalEnabled) throw new Error("RENEWAL_NOT_ENABLED");
  if (!isOwner(context.membership.autoscuolaRole)) throw new Error("FORBIDDEN");
  return context;
}
