import { atom } from "jotai";
import type { IntegrationProviderKey } from "@/lib/integrations/oauth";

export type IntegrationConnection = {
  provider: IntegrationProviderKey;
  status: string;
  displayName: string | null;
  connectedAt: Date | string;
};

export const integrationConnectionsAtom = atom<IntegrationConnection[] | null>(null);
export const integrationsRefreshAtom = atom<boolean>(false);
