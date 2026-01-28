import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { providerEnumMap } from "@/lib/integrations/oauth";
import { formatError } from "@/lib/utils";
import { getActiveCompanyContext } from "@/lib/company-context";

export async function POST(request: Request) {
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
        { success: false, message: "Solo gli admin possono aggiornare FIC" },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as {
      entityId?: string;
      entityName?: string;
    };

    if (!payload.entityId) {
      return NextResponse.json(
        { success: false, message: "Seleziona un'azienda valida" },
        { status: 400 },
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

    if (!connection) {
      return NextResponse.json(
        { success: false, message: "Fatture in Cloud non è connesso" },
        { status: 400 },
      );
    }

    const existing =
      connection.metadata && typeof connection.metadata === "object"
        ? (connection.metadata as Record<string, unknown>)
        : {};

    const metadata = {
      ...existing,
      entityId: payload.entityId,
      entityName: payload.entityName ?? null,
    };

    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { metadata },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 500 },
    );
  }
}
