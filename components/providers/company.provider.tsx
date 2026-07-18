"use client";

import { useAtom, useSetAtom } from "jotai";
import type { WritableAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import {
  companyAtom,
  companyListAtom,
  companyRefreshAtom,
  type CompanyInfo,
  type CompanySummary,
} from "@/atoms/company.store";
import { getCompanyContext } from "@/lib/actions/company.actions";

export function CompanyDataProvider({
  children,
  initialCompany,
  initialCompanies,
}: {
  children: ReactNode;
  // Dati aziendali risolti lato server e passati al primo render: idratano
  // l'atom SUBITO, evitando il flash "tutto visibile" al primo accesso (prima
  // che la fetch client-side di getCompanyContext arrivi).
  initialCompany?: CompanyInfo | null;
  initialCompanies?: CompanySummary[];
}) {
  // Idrata gli atom con i dati server al primo render (una volta per store).
  type HydrateTuple = readonly [
    WritableAtom<unknown, [unknown], unknown>,
    unknown,
  ];
  const hydrateValues: HydrateTuple[] = initialCompany
    ? [
        [companyAtom as WritableAtom<unknown, [unknown], unknown>, initialCompany],
        [
          companyListAtom as WritableAtom<unknown, [unknown], unknown>,
          initialCompanies ?? [],
        ],
      ]
    : [];
  useHydrateAtoms(hydrateValues);
  const setCompany = useSetAtom(companyAtom);
  const setCompanyList = useSetAtom(companyListAtom);
  const [refresh, setRefresh] = useAtom(companyRefreshAtom);
  const requestIdRef = useRef(0);
  const hasInitial = Boolean(initialCompany);

  const loadCompany = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const res = await getCompanyContext();
    if (requestIdRef.current !== requestId) return;
    if (!res.success || !res.data) return;

    const normalizedRole =
      res.data.current.role === "admin" ? "admin" : "member";
    setCompany({ ...res.data.current, role: normalizedRole });
    setCompanyList(
      res.data.companies.map((company) => ({
        ...company,
        role: company.role === "admin" ? "admin" : "member",
      })),
    );
  }, [setCompany, setCompanyList]);

  useEffect(() => {
    // Se abbiamo già i dati dal server, l'atom è idratato: niente fetch al mount
    // (il refresh esplicito via companyRefreshAtom continua a funzionare).
    if (hasInitial) return;
    void loadCompany();
  }, [hasInitial, loadCompany]);

  useEffect(() => {
    if (!refresh) return;
    setRefresh(false);
    void loadCompany();
  }, [refresh, setRefresh, loadCompany]);

  return <>{children}</>;
}
