"use server";

import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { getActiveCompanyContext } from "@/lib/company-context";
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
    const { membership } = await getActiveCompanyContext();

    if (membership.role !== "admin") {
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
