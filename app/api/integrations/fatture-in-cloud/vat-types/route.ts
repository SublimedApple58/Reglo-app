import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { getFicConnection } from "@/lib/integrations/fatture-in-cloud";
import { formatError } from "@/lib/utils";
import { getActiveCompanyContext } from "@/lib/company-context";

type FicVatType = {
  id?: string;
  description?: string;
  value?: number;
};

type FicVatTypesResponse = {
  data?: FicVatType[];
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

    if (membership.role !== "admin" && membership.autoscuolaRole !== "OWNER") {
      return NextResponse.json(
        {
          success: false,
          message: "Solo admin o titolare autoscuola possono vedere le aliquote FIC",
        },
        { status: 403 },
      );
    }

    const connection = await getFicConnection({
      prisma,
      companyId: membership.companyId,
    });

    const response = await fetch(
      `https://api-v2.fattureincloud.it/c/${connection.entityId}/info/vat_types`,
      {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error("Impossibile ottenere le aliquote FIC");
    }

    const payload = (await response.json()) as FicVatTypesResponse | FicVatType[];
    const list = Array.isArray(payload) ? payload : payload.data ?? [];
    const options = list
      .map((vat) => {
        if (vat.id == null) return null;
        const label = vat.description
          ? vat.value != null
            ? `${vat.description} (${vat.value}%)`
            : vat.description
          : vat.value != null
            ? `IVA ${vat.value}%`
            : "Aliquota IVA";
        return { value: String(vat.id), label, rate: vat.value };
      })
      .filter(Boolean) as Array<{ value: string; label: string; rate?: number }>;

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
