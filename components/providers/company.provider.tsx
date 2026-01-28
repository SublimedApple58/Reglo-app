"use client";

import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import {
  companyAtom,
  companyListAtom,
  companyRefreshAtom,
} from "@/atoms/company.store";
import { getCompanyContext } from "@/lib/actions/company.actions";

export function CompanyDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const setCompany = useSetAtom(companyAtom);
  const setCompanyList = useSetAtom(companyListAtom);
  const [refresh, setRefresh] = useAtom(companyRefreshAtom);
  const requestIdRef = useRef(0);

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
    void loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    if (!refresh) return;
    setRefresh(false);
    void loadCompany();
  }, [refresh, setRefresh, loadCompany]);

  return <>{children}</>;
}
