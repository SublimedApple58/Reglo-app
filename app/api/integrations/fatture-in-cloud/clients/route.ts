import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { getFicConnection } from "@/lib/integrations/fatture-in-cloud";
import { formatError } from "@/lib/utils";
import { getActiveCompanyContext } from "@/lib/company-context";

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

    const { membership } = await getActiveCompanyContext();

    if (membership.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Solo gli admin possono vedere i clienti FIC" },
        { status: 403 },
      );
    }

    const connection = await getFicConnection({
      prisma,
      companyId: membership.companyId,
    });

    const response = await fetch(
      `https://api-v2.fattureincloud.it/c/${connection.entityId}/entities/clients`,
      {
        headers: {
          Authorization: `Bearer ${connection.token}`,
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
    const message = formatError(error);
    const normalized = message.toLowerCase();
    return NextResponse.json(
      { success: false, message },
      {
        status:
          normalized.includes("fatture in cloud non connesso") ||
          normalized.includes("seleziona l'azienda fic")
            ? 400
            : 500,
      },
    );
  }
}
