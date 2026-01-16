import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import {
  IntegrationProviderKey,
  providerEnumMap,
  providerKeys,
} from "@/lib/integrations/oauth";
import { decryptSecret } from "@/lib/integrations/secrets";

const revokeSlack = async (token: string) => {
  await fetch("https://slack.com/api/auth.revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
};

const revokeFattureInCloud = async (token: string) => {
  const revokeUrl =
    process.env.FATTURE_IN_CLOUD_REVOKE_URL ||
    "https://api-v2.fattureincloud.it/oauth/revoke";
  await fetch(revokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const providerKey = provider as IntegrationProviderKey;
  if (!providerKeys.includes(providerKey)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  const isGlobalAdmin = session?.user?.role === "admin";

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  if (!isGlobalAdmin && membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId: membership.companyId,
        provider: providerEnumMap[providerKey],
      },
    },
  });

  if (!connection) {
    return NextResponse.json({ success: true });
  }

  if (connection.accessTokenCiphertext && connection.accessTokenIv && connection.accessTokenTag) {
    try {
      const token = decryptSecret({
        ciphertext: connection.accessTokenCiphertext,
        iv: connection.accessTokenIv,
        tag: connection.accessTokenTag,
      });
      if (providerKey === "slack") {
        await revokeSlack(token);
      }
      if (providerKey === "fatture-in-cloud") {
        await revokeFattureInCloud(token);
      }
    } catch {
      // best-effort revoke
    }
  }

  await prisma.integrationConnection.delete({
    where: { id: connection.id },
  });

  return NextResponse.json({ success: true });
}
