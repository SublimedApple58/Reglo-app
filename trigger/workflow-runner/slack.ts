import { decryptSecret } from "@/lib/integrations/secrets";

export type SlackProfileResponse = {
  ok: boolean;
  user?: { id?: string };
  error?: string;
};

export type SlackOpenConversationResponse = {
  ok: boolean;
  channel?: { id?: string };
  error?: string;
};

export type SlackPostMessageResponse = {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
};

export const getSlackToken = async (prisma: any, companyId: string) => {
  const connection = await prisma.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: "SLACK",
      },
    },
  });

  if (
    !connection?.accessTokenCiphertext ||
    !connection.accessTokenIv ||
    !connection.accessTokenTag
  ) {
    throw new Error("Slack integration not connected");
  }

  return decryptSecret({
    ciphertext: connection.accessTokenCiphertext,
    iv: connection.accessTokenIv,
    tag: connection.accessTokenTag,
  });
};

export const executeSlackChannelMessage = async (
  token: string,
  channel: string,
  message: string,
) => {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text: message }),
  });
  const payload = (await response.json()) as SlackPostMessageResponse;
  if (!payload.ok) {
    throw new Error(payload.error || "Slack message failed");
  }
  return payload;
};

export const executeSlackUserMessage = async (
  token: string,
  userInput: string,
  message: string,
) => {
  let userId = userInput.trim();
  if (userId.includes("@")) {
    const response = await fetch("https://slack.com/api/users.lookupByEmail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email: userId }),
    });
    const payload = (await response.json()) as SlackProfileResponse;
    if (!payload.ok || !payload.user?.id) {
      throw new Error(payload.error || "Slack user not found");
    }
    userId = payload.user.id;
  }

  const openResponse = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: userId }),
  });
  const openPayload = (await openResponse.json()) as SlackOpenConversationResponse;
  if (!openPayload.ok || !openPayload.channel?.id) {
    throw new Error(openPayload.error || "Slack DM failed");
  }

  return executeSlackChannelMessage(token, openPayload.channel.id, message);
};
