import { prisma } from "@/db/prisma";
import { tasks } from "@trigger.dev/sdk/v3";
import { computeExecutionOrder } from "@/lib/workflows/engine";
import { collectTriggerPayloadKeys } from "@/lib/workflows/payload";
import { extractSlackFields } from "@/lib/ai/slack-extract";

export type NormalizedInboundSlack = {
  teamId: string;
  channelId: string;
  userId: string;
  text: string;
  ts?: string;
  eventId?: string;
  raw?: unknown;
};

const matchKeywords = (text: string, keywords?: string) => {
  if (!keywords?.trim()) return true;
  const list = keywords
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.every((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
};

const normalizeUserFilter = (value?: string) => {
  if (!value) return "";
  return value.trim().replace(/^<@/, "").replace(/>$/, "");
};

export const triggerSlackInboundWorkflows = async ({
  inbound,
}: {
  inbound: NormalizedInboundSlack;
}) => {
  if (!inbound.teamId) return;

  const connection = await prisma.integrationConnection.findFirst({
    where: {
      provider: "SLACK",
      externalAccountId: inbound.teamId,
      status: "connected",
    },
  });

  if (!connection) return;

  const workflows = await prisma.workflow.findMany({
    where: { status: "active", companyId: connection.companyId },
  });

  for (const workflow of workflows) {
    const definition = workflow.definition as {
      trigger?: { type?: string; config?: Record<string, unknown> };
      nodes?: Array<{ id: string; type?: string; config?: Record<string, unknown> }>;
      edges?: Array<{ from: string; to: string; condition?: Record<string, unknown> | null }>;
    };
    const trigger = definition.trigger;
    if (trigger?.type !== "slack_message") continue;
    const config = trigger.config ?? {};
    const channelFilter = (config.channelId as string | undefined) ?? "";
    const userFilter = normalizeUserFilter(config.userFilter as string | undefined);
    const keywords = config.keywords as string | undefined;

    if (channelFilter && channelFilter !== "all" && channelFilter !== inbound.channelId) {
      continue;
    }
    if (userFilter && userFilter !== inbound.userId) {
      continue;
    }
    if (!matchKeywords(inbound.text, keywords)) continue;

    const slackFieldMeta = Array.isArray((config as { slackFieldMeta?: unknown }).slackFieldMeta)
      ? ((config as { slackFieldMeta?: Array<{ key: string; required: boolean }> })
          .slackFieldMeta ?? [])
      : [];
    const slackFields = Array.isArray((config as { slackFields?: unknown }).slackFields)
      ? ((config as { slackFields?: string[] }).slackFields ?? [])
      : [];

    const requiredFields = slackFieldMeta
      .filter((field) => field.key && field.required)
      .map((field) => field.key);

    const inferredKeys =
      slackFields.length > 0
        ? slackFields
        : slackFieldMeta.length > 0
          ? slackFieldMeta.map((field) => field.key)
          : collectTriggerPayloadKeys(definition);

    const schemaKeys = Array.from(new Set(inferredKeys.filter(Boolean)));
    const extraction = await extractSlackFields({
      schemaKeys,
      text: inbound.text,
    });

    const fields = Object.fromEntries(
      schemaKeys.map((key) => [key, extraction.fields[key] ?? ""]),
    );

    const warnings = [
      ...extraction.warnings,
      ...requiredFields
        .filter((key) => !fields[key] || !fields[key].trim())
        .map((key) => `Campo mancante: ${key}`),
    ];

    const triggerPayload = {
      ...fields,
      _slack: {
        channel: inbound.channelId,
        user: inbound.userId,
        text: inbound.text,
        ts: inbound.ts,
        eventId: inbound.eventId,
      },
      _warnings: warnings,
    };

    const executionOrder = computeExecutionOrder(definition);

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        companyId: workflow.companyId,
        status: "queued",
        triggerType: "slack_message",
        triggerPayload,
      },
    });

    if (executionOrder.length) {
      await prisma.workflowRunStep.createMany({
        data: executionOrder.map((nodeId) => ({
          runId: run.id,
          nodeId,
          status: "pending",
          attempt: 0,
        })),
      });
    }

    await tasks.trigger("workflow-runner", { runId: run.id });
  }
};
