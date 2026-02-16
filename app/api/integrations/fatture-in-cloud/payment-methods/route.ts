import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { getFicConnection } from "@/lib/integrations/fatture-in-cloud";
import { formatError } from "@/lib/utils";
import { getActiveCompanyContext } from "@/lib/company-context";

type FicPaymentMethod = {
  id?: string | number;
  name?: string;
  type?: string;
};

type FicPaymentMethodsResponse = {
  data?: FicPaymentMethod[];
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
          message: "Solo admin o titolare autoscuola possono vedere i metodi di pagamento FIC",
        },
        { status: 403 },
      );
    }

    const connection = await getFicConnection({
      prisma,
      companyId: membership.companyId,
    });

    const response = await fetch(
      `https://api-v2.fattureincloud.it/c/${connection.entityId}/settings/payment_methods`,
      {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const fallback = await fetch(
        `https://api-v2.fattureincloud.it/c/${connection.entityId}/info/payment_methods`,
        {
          headers: {
            Authorization: `Bearer ${connection.token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );

      if (!fallback.ok) {
        throw new Error("Impossibile ottenere i metodi di pagamento FIC");
      }

      const fallbackPayload = (await fallback.json()) as
        | FicPaymentMethodsResponse
        | FicPaymentMethod[];
      const fallbackList = Array.isArray(fallbackPayload)
        ? fallbackPayload
        : fallbackPayload.data ?? [];
      const fallbackOptions = fallbackList
        .map((method) => {
          if (method.id == null) return null;
          return {
            value: String(method.id),
            label: method.name ?? "Metodo di pagamento",
          };
        })
        .filter(Boolean) as Array<{ value: string; label: string }>;

      return NextResponse.json({ success: true, data: fallbackOptions });
    }

    const payload = (await response.json()) as
      | FicPaymentMethodsResponse
      | FicPaymentMethod[];
    const list = Array.isArray(payload) ? payload : payload.data ?? [];
    const options = list
      .map((method) => {
        if (method.id == null) return null;
        return {
          value: String(method.id),
          label: method.name ?? "Metodo di pagamento",
        };
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
