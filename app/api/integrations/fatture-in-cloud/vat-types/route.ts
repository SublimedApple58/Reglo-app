import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { decryptSecret } from "@/lib/integrations/secrets";
import { providerEnumMap } from "@/lib/integrations/oauth";
import { formatError } from "@/lib/utils";

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
        { success: false, message: "Solo gli admin possono vedere le aliquote FIC" },
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
      `https://api-v2.fattureincloud.it/c/${metadata.entityId}/info/vat_types`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
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
        if (!vat.id) return null;
        const label = vat.description
          ? vat.value != null
            ? `${vat.description} (${vat.value}%)`
            : vat.description
          : vat.value != null
            ? `IVA ${vat.value}%`
            : "Aliquota IVA";
        return { value: vat.id, label, rate: vat.value };
      })
      .filter(Boolean) as Array<{ value: string; label: string; rate?: number }>;

    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 500 },
    );
  }
}
