import { getActiveCompanyContext } from "@/lib/company-context";
import { isServiceActive, normalizeCompanyServices, type ServiceKey } from "@/lib/services";

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
