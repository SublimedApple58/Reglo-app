import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { triggerSlackInboundWorkflows } from "@/lib/workflows/slack-inbound";

const verifySlackSignature = (
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string,
) => {
  const time = Number(timestamp);
  if (!Number.isFinite(time)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - time) > 60 * 5) {
    return false;
  }
  const baseString = `v0:${timestamp}:${body}`;
  const digest = crypto
    .createHmac("sha256", signingSecret)
    .update(baseString, "utf8")
    .digest("hex");
  const computed = `v0=${digest}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
};

export async function POST(request: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "Slack signing secret missing" }, { status: 500 });
  }

  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";
  const body = await request.text();

  if (!timestamp || !signature || !verifySlackSignature(body, timestamp, signature, signingSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!payload) {
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const event = payload.event as Record<string, unknown> | undefined;
  const eventType = event?.type as string | undefined;
  const teamId =
    (payload.team_id as string | undefined) ??
    (event?.team as string | undefined) ??
    ((payload.team as { id?: string } | undefined)?.id ?? undefined) ??
    (Array.isArray(payload.authorizations)
      ? ((payload.authorizations[0] as { team_id?: string } | undefined)?.team_id ?? undefined)
      : undefined);

  if (!teamId || !event || !eventType) {
    return NextResponse.json({ ok: true });
  }

  const subtype = event.subtype as string | undefined;
  const botId = event.bot_id as string | undefined;
  if (subtype || botId) {
    return NextResponse.json({ ok: true });
  }

  if (eventType !== "message" && eventType !== "app_mention") {
    return NextResponse.json({ ok: true });
  }

  const text = (event.text as string | undefined) ?? "";
  const userId = (event.user as string | undefined) ?? "";
  const channelId = (event.channel as string | undefined) ?? "";
  const ts = (event.ts as string | undefined) ?? "";
  const eventId = (payload.event_id as string | undefined) ?? "";

  if (!text || !userId || !channelId) {
    return NextResponse.json({ ok: true });
  }

  console.info("[slack inbound]", {
    teamId,
    eventType,
    channelId,
    userId,
    eventId,
    textPreview: text.slice(0, 160),
  });

  await triggerSlackInboundWorkflows({
    inbound: {
      teamId,
      channelId,
      userId,
      text,
      ts,
      eventId,
      raw: payload,
    },
  });

  return NextResponse.json({ ok: true });
}
