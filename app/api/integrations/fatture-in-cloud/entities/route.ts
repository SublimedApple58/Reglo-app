import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { getFicConnection } from "@/lib/integrations/fatture-in-cloud";
import { formatError } from "@/lib/utils";
import { getActiveCompanyContext } from "@/lib/company-context";

type FicCompany = {
  id?: string;
  name?: string;
  company_id?: string;
  company_name?: string;
  fiscal_name?: string;
};

type FicUserInfoResponse = {
  companies?: FicCompany[];
  company?: FicCompany[];
  data?: { companies?: FicCompany[] } | FicCompany[];
};

const getCompanies = (payload: FicUserInfoResponse) => {
  if (Array.isArray(payload.companies)) return payload.companies;
  if (Array.isArray(payload.company)) return payload.company;
  if (payload.data && Array.isArray(payload.data)) return payload.data;
  if (
    payload.data &&
    typeof payload.data === "object" &&
    Array.isArray((payload.data as { companies?: FicCompany[] }).companies)
  ) {
    return (payload.data as { companies?: FicCompany[] }).companies ?? [];
  }
  return [];
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
        { success: false, message: "Solo gli admin possono gestire Fatture in Cloud" },
        { status: 403 },
      );
    }

    const connection = await getFicConnection({
      prisma,
      companyId: membership.companyId,
      requireEntity: false,
    });

    const response = await fetch("https://api-v2.fattureincloud.it/user/info", {
      headers: {
        Authorization: `Bearer ${connection.token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Impossibile ottenere le aziende FIC");
    }

    const payload = (await response.json()) as FicUserInfoResponse;
    const companies = getCompanies(payload);
    const options = companies
      .map((company) => {
        const value = company.id ?? company.company_id;
        if (!value) return null;
        const label =
          company.name ??
          company.company_name ??
          company.fiscal_name ??
          value;
        return { value, label };
      })
      .filter(Boolean) as Array<{ value: string; label: string }>;

    return NextResponse.json({
      success: true,
      data: options,
      selectedId: connection.entityId ?? null,
      selectedLabel: connection.entityName ?? null,
    });
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
