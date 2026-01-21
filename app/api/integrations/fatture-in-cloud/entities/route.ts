import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { decryptSecret } from "@/lib/integrations/secrets";
import { providerEnumMap } from "@/lib/integrations/oauth";
import { formatError } from "@/lib/utils";

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
        { success: false, message: "Solo gli admin possono gestire Fatture in Cloud" },
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

    const token = decryptSecret({
      ciphertext: connection.accessTokenCiphertext,
      iv: connection.accessTokenIv,
      tag: connection.accessTokenTag,
    });

    const response = await fetch("https://api-v2.fattureincloud.it/user/info", {
      headers: {
        Authorization: `Bearer ${token}`,
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

    const metadata =
      connection.metadata && typeof connection.metadata === "object"
        ? (connection.metadata as { entityId?: string; entityName?: string })
        : {};

    return NextResponse.json({
      success: true,
      data: options,
      selectedId: metadata.entityId ?? null,
      selectedLabel: metadata.entityName ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 500 },
    );
  }
}
