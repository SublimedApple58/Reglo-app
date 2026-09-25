import { getActiveCompanyContext } from "@/lib/company-context";
import { prisma } from "@/db/prisma";
import {
  affiliateConsorzioId,
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

/**
 * Guardia delle action di un'**autoscuola consorziata** verso il consorzio
 * (elenco allievi/mezzi della scuola, slot occupati, invio richiesta di guida).
 *
 * Sono le prime action della piattaforma che attraversano il confine fra due
 * tenant, quindi qui non basta il flag nei limits: si rilegge
 * `ConsorzioSchool`, che è l'autorità, e si pretende che il collegamento sia
 * esattamente quello dichiarato. Restituisce anche `schoolId`, perché ogni
 * query a valle deve restare filtrata su QUELLA scuola: due consorziate dello
 * stesso consorzio non devono vedersi fra loro.
 *
 * Volutamente NON richiede `requireServiceAccess`: funziona anche a servizio
 * spento — è il senso della vista ridotta.
 */
export async function requireAffiliateSchool() {
  const context = await getActiveCompanyContext();
  const services = normalizeCompanyServices(context.company.services);
  const consorzioCompanyId = affiliateConsorzioId(services);
  if (!consorzioCompanyId) {
    throw new Error("NOT_A_CONSORZIO_AFFILIATE");
  }

  const school = await prisma.consorzioSchool.findFirst({
    where: {
      consorzioCompanyId,
      linkedCompanyId: context.membership.companyId,
      status: { not: "removed" },
    },
    select: { id: true, name: true, status: true },
  });
  if (!school) {
    // Il flag dice "consorziata" ma il collegamento non esiste più (scollegata
    // dal backoffice, o limits rimasti indietro): si nega, non si indovina.
    throw new Error("NOT_A_CONSORZIO_AFFILIATE");
  }

  return {
    ...context,
    consorzioCompanyId,
    schoolId: school.id,
    schoolName: school.name,
    schoolSuspended: school.status === "suspended",
    regloActive: isServiceActive(services, "AUTOSCUOLE", true),
  };
}
