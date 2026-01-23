import { decryptSecret } from "@/lib/integrations/secrets";

export const getFicConnection = async (prisma: any, companyId: string) => {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: "FATTURE_IN_CLOUD",
      },
    },
  });

  if (
    !connection?.accessTokenCiphertext ||
    !connection.accessTokenIv ||
    !connection.accessTokenTag
  ) {
    throw new Error("Fatture in Cloud non connesso");
  }

  const metadata =
    connection.metadata && typeof connection.metadata === "object"
      ? (connection.metadata as { entityId?: string; entityName?: string })
      : {};

  if (!metadata.entityId) {
    throw new Error("Seleziona l'azienda FIC in Settings");
  }

  const token = decryptSecret({
    ciphertext: connection.accessTokenCiphertext,
    iv: connection.accessTokenIv,
    tag: connection.accessTokenTag,
  });

  return { token, entityId: metadata.entityId, entityName: metadata.entityName };
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
