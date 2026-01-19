"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import {
  integrationConnectionsAtom,
  integrationsRefreshAtom,
} from "@/atoms/integrations.store";
import { companyAtom } from "@/atoms/company.store";
import { getIntegrationConnections } from "@/lib/actions/integration.actions";

export function IntegrationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const company = useAtomValue(companyAtom);
  const setConnections = useSetAtom(integrationConnectionsAtom);
  const [refresh, setRefresh] = useAtom(integrationsRefreshAtom);
  const requestIdRef = useRef(0);

  const loadConnections = useCallback(async () => {
    if (!company || company.role !== "admin") return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const res = await getIntegrationConnections();
    if (requestIdRef.current !== requestId) return;
    if (!res.success || !res.data) return;

    setConnections(res.data);
  }, [company, setConnections]);

  useEffect(() => {
    if (!company || company.role !== "admin") {
      setConnections(null);
      return;
    }
    void loadConnections();
  }, [company, loadConnections, setConnections]);

  useEffect(() => {
    if (!refresh) return;
    setRefresh(false);
    void loadConnections();
  }, [refresh, setRefresh, loadConnections]);

  return <>{children}</>;
}
