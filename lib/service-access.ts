import { getActiveCompanyContext } from "@/lib/company-context";
import {
  isConsortium,
  isServiceActive,
  normalizeCompanyServices,
  type ServiceKey,
} from "@/lib/services";

export async function requireServiceAccess(service: ServiceKey) {
  const context = await getActiveCompanyContext();
  const active = isServiceActive(
    normalizeCompanyServices(context.company.services),
    service,
    true,
  );

  if (!active) {
    throw new Error("SERVICE_NOT_ACTIVE");
  }

  return context;
}

/**
 * Come requireServiceAccess("AUTOSCUOLE"), ma richiede anche che la company
 * sia un CONSORZIO (limits.accountKind = "consorzio"). Prima riga di ogni
 * action/route solo-consorzio. Vedi docs/features/consorzio.md.
 */
export async function requireConsortium() {
  const context = await requireServiceAccess("AUTOSCUOLE");
  if (!isConsortium(normalizeCompanyServices(context.company.services))) {
    throw new Error("NOT_A_CONSORTIUM");
  }
  return context;
}
