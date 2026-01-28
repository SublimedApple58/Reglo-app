import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { decryptSecret } from "@/lib/integrations/secrets";
import { providerEnumMap } from "@/lib/integrations/oauth";
import { getActiveCompanyContext } from "@/lib/company-context";

type SlackChannelOption = {
  value: string;
  label: string;
  isPrivate?: boolean;
};

type SlackChannelsResponse = {
  ok: boolean;
  channels?: Array<{
    id: string;
    name?: string;
    is_archived?: boolean;
    is_private?: boolean;
  }>;
  response_metadata?: { next_cursor?: string };
  error?: string;
};

const listSlackChannels = async (token: string): Promise<SlackChannelOption[]> => {
  const results: SlackChannelOption[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL("https://slack.com/api/conversations.list");
    url.searchParams.set("limit", "200");
    url.searchParams.set("types", "public_channel,private_channel");
    url.searchParams.set("exclude_archived", "true");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to reach Slack");
    }

    const payload = (await response.json()) as SlackChannelsResponse;
    if (!payload.ok) {
      throw new Error(payload.error ?? "Slack requested the channels but did not return data.");
    }

    const channels = payload.channels ?? [];
    for (const channel of channels) {
      if (!channel.id) continue;
      const label = channel.name ? `#${channel.name}` : channel.id;
      results.push({
        value: channel.id,
        label,
        isPrivate: Boolean(channel.is_private),
      });
    }

    cursor = payload.response_metadata?.next_cursor;
  } while (cursor && results.length < 500);

  return results.slice(0, 250);
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
        { success: false, message: "Solo gli admin possono visualizzare i canali Slack" },
        { status: 403 },
      );
    }

    const connection = await prisma.integrationConnection.findUnique({
      where: {
        companyId_provider: {
          companyId: membership.companyId,
          provider: providerEnumMap.slack,
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
        { success: false, message: "Slack non è connesso" },
        { status: 400 },
      );
    }

    const token = decryptSecret({
      ciphertext: connection.accessTokenCiphertext,
      iv: connection.accessTokenIv,
      tag: connection.accessTokenTag,
    });

    const channels = await listSlackChannels(token);
    return NextResponse.json({ success: true, data: channels });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: formatError(error) },
      { status: 500 },
    );
  }
}
