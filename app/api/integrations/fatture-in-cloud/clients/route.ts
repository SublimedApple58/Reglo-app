import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { decryptSecret } from "@/lib/integrations/secrets";
import { providerEnumMap } from "@/lib/integrations/oauth";
import { formatError } from "@/lib/utils";

type FicClient = {
  id?: string;
  name?: string;
  company_name?: string;
  code?: string;
  fiscal_code?: string;
  vat_number?: string;
  firstname?: string;
  lastname?: string;
};

type FicClientsResponse = {
  data?: FicClient[];
};

const toLabel = (client: FicClient) => {
  const fallbackName =
    client.name ||
    client.company_name ||
    [client.firstname, client.lastname].filter(Boolean).join(" ");
  const identity = client.vat_number || client.fiscal_code || client.code;
  if (fallbackName && identity) return `${fallbackName} · ${identity}`;
  return fallbackName || identity || "Cliente";
};

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Utente non autenticato" },
        { status: 401 },
      );
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "Company non trovata" },
        { status: 404 },
      );
    }

    if (membership.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Solo gli admin possono vedere i clienti FIC" },
        { status: 403 },
      );
    }

    const connection = await prisma.integrationConnection.findUnique({
      where: {
        companyId_provider: {
          companyId: membership.companyId,
          provider: providerEnumMap["fatture-in-cloud"],
        },
      },
    });

    if (
      !connection ||
      !connection.accessTokenCiphertext ||
      !connection.accessTokenIv ||
      !connection.accessTokenTag
    ) {
      return NextResponse.json(
        { success: false, message: "Fatture in Cloud non è connesso" },
        { status: 400 },
      );
    }

    const metadata =
      connection.metadata && typeof connection.metadata === "object"
        ? (connection.metadata as { entityId?: string })
        : {};

    if (!metadata.entityId) {
      return NextResponse.json(
        { success: false, message: "Seleziona l'azienda FIC in Settings" },
        { status: 400 },
      );
    }

    const token = decryptSecret({
      ciphertext: connection.accessTokenCiphertext,
      iv: connection.accessTokenIv,
      tag: connection.accessTokenTag,
    });

    const response = await fetch(
      `https://api-v2.fattureincloud.it/c/${metadata.entityId}/entities/clients`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error("Impossibile ottenere i clienti FIC");
    }

    const payload = (await response.json()) as FicClientsResponse | FicClient[];
    const list = Array.isArray(payload) ? payload : payload.data ?? [];
    const options = list
      .map((client) => {
        if (!client.id) return null;
        return { value: client.id, label: toLabel(client) };
      })
      .filter(Boolean) as Array<{ value: string; label: string }>;

    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 500 },
    );
  }
}
