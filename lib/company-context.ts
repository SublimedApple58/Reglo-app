import { cache } from "react";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { prisma } from "@/db/prisma";
import { getMobileToken, parseBearerToken } from "@/lib/mobile-auth";
import { COMPANY_MAINTENANCE, isMemberBlockedByMaintenance } from "@/lib/maintenance";

export const ACTIVE_COMPANY_REQUIRED = "ACTIVE_COMPANY_REQUIRED";
export const NO_COMPANY_FOUND = "NO_COMPANY_FOUND";

// React.cache() deduplicates calls within a single request — every server action
// that calls requireServiceAccess -> getActiveCompanyContext hits the DB only once.
//
// "Unchecked" = senza il blocco della modalità manutenzione (REG-773). Lo usano
// solo le poche strade che devono restare aperte a un account in manutenzione:
// logout, stato dell'account (`/me`), disattivazione del token push, la
// schermata di manutenzione stessa. Tutto il resto passa da
// `getActiveCompanyContext`, qui sotto.
export const getActiveCompanyContextUnchecked = cache(async function getActiveCompanyContextUnchecked() {
  const headerList = await headers();
  const authHeader = headerList.get("authorization");
  const bearer = parseBearerToken(authHeader);
  const requestedCompanyId = headerList.get("x-reglo-company-id");
  let session = await auth();
  let userId = session?.user?.id;
  let tokenCompanyId: string | null = null;

  if (bearer) {
    const mobileToken = await getMobileToken(bearer);
    if (mobileToken) {
      userId = mobileToken.userId;
      tokenCompanyId = mobileToken.companyId ?? null;
      session = null;
    }
  }

  if (!userId) {
    throw new Error("USER_NOT_AUTHENTICATED");
  }

  // Impersonazione backoffice: la company target arriva dal claim di sessione e ha
  // priorità. Non viene MAI persistita su user.activeCompanyId (vedi sotto), così
  // la preferenza reale dell'owner resta intatta ("minimo impatto").
  const impersonationCompanyId = session?.impersonation?.companyId ?? null;

  // Two independent reads — no transactional guarantee needed. Running them in a
  // single $transaction forced BEGIN/COMMIT + serial round-trips over the Neon
  // serverless (WebSocket) driver; Promise.all issues both concurrently with no
  // transaction overhead. This runs on EVERY authenticated request.
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { activeCompanyId: true },
    }),
    prisma.companyMember.findMany({
      where: { userId },
      include: { company: { include: { services: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!memberships.length) {
    throw new Error(NO_COMPANY_FOUND);
  }

  let activeCompanyId =
    requestedCompanyId ?? impersonationCompanyId ?? tokenCompanyId ?? user?.activeCompanyId ?? null;
  if (!activeCompanyId) {
    if (memberships.length === 1) {
      activeCompanyId = memberships[0].companyId;
      if (!impersonationCompanyId) {
        await prisma.user.update({
          where: { id: userId },
          data: { activeCompanyId },
        });
      }
    } else {
      throw new Error(ACTIVE_COMPANY_REQUIRED);
    }
  }

  let membership = memberships.find(
    (entry) => entry.companyId === activeCompanyId,
  );

  if (!membership) {
    if (memberships.length === 1) {
      membership = memberships[0];
      activeCompanyId = membership.companyId;
      if (!impersonationCompanyId) {
        await prisma.user.update({
          where: { id: userId },
          data: { activeCompanyId },
        });
      }
    } else {
      throw new Error(ACTIVE_COMPANY_REQUIRED);
    }
  }

  return {
    session,
    membership,
    company: membership.company,
    activeCompanyId,
    memberships,
  };
});

/**
 * Contesto della company attiva, con il blocco della modalità manutenzione
 * (REG-773): se l'autoscuola è in manutenzione e il ruolo del membro rientra
 * nell'ambito, lancia `COMPANY_MAINTENANCE`. Passandoci ogni server action e
 * ogni route (web e mobile) il blocco vale per UI **e** API, ed è immediato: la
 * company si legge fresca dal DB a ogni richiesta, senza cache.
 *
 * Vale anche per il backoffice in impersonazione (decisione di Tiziano,
 * 2026-11-23): l'operatore entra come il titolare e vede la stessa schermata di
 * manutenzione. Da lì può terminare l'impersonazione (`endImpersonation`) e
 * gestire o sbloccare l'account dal backoffice, che ha un cookie suo.
 */
export const getActiveCompanyContext = cache(async function getActiveCompanyContext() {
  const context = await getActiveCompanyContextUnchecked();
  if (
    isMemberBlockedByMaintenance(
      context.company.maintenanceScope,
      context.membership.autoscuolaRole,
    )
  ) {
    throw new Error(COMPANY_MAINTENANCE);
  }
  return context;
});
