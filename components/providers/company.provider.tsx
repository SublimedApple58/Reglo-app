"use client";

import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { companyAtom, companyRefreshAtom } from "@/atoms/company.store";
import { getCurrentCompany } from "@/lib/actions/company.actions";

export function CompanyDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const setCompany = useSetAtom(companyAtom);
  const [refresh, setRefresh] = useAtom(companyRefreshAtom);
  const requestIdRef = useRef(0);

  const loadCompany = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const res = await getCurrentCompany();
    if (requestIdRef.current !== requestId) return;
    if (!res.success || !res.data) return;

    const normalizedRole = res.data.role === "admin" ? "admin" : "member";
    setCompany({ ...res.data, role: normalizedRole });
  }, [setCompany]);

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
