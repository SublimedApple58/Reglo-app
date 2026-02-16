import { getFicConnection as getSharedFicConnection } from "@/lib/integrations/fatture-in-cloud";

export const getFicConnection = async (prisma: any, companyId: string) => {
  const connection = await getSharedFicConnection({
    prisma,
    companyId,
  });
  return {
    token: connection.token,
    entityId: connection.entityId,
    entityName: connection.entityName,
  };
};

export const ficFetch = async (
  path: string,
  token: string,
  init?: RequestInit,
) => {
  const response = await fetch(`https://api-v2.fattureincloud.it${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Errore Fatture in Cloud");
  }
  return response.json();
};
