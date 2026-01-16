"use server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import {
  IntegrationProviderKey,
  providerEnumMap,
} from "@/lib/integrations/oauth";

const providerKeyMap: Record<string, IntegrationProviderKey> = {
  SLACK: "slack",
  FATTURE_IN_CLOUD: "fatture-in-cloud",
};

export async function getIntegrationConnections() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const isGlobalAdmin = session?.user?.role === "admin";

    if (!userId) {
      throw new Error("User is not authenticated");
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId },
      include: { company: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new Error("Company not found");
    }

    if (!isGlobalAdmin && membership.role !== "admin") {
      throw new Error("Only admins can view integrations");
    }

    const connections = await prisma.integrationConnection.findMany({
      where: { companyId: membership.companyId },
      orderBy: { updatedAt: "desc" },
    });

    return {
      success: true,
      data: connections.map((connection) => ({
        provider: providerKeyMap[connection.provider],
        status: connection.status,
        displayName: connection.displayName,
        connectedAt: connection.updatedAt,
      })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
