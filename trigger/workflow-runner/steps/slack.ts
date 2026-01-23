import { interpolateTemplate } from "@/lib/workflows/engine";
import { executeSlackChannelMessage, executeSlackUserMessage, getSlackToken } from "@/trigger/workflow-runner/slack";

export const executeSlackChannelMessageStep = async ({
  prisma,
  run,
  nodeId,
  settings,
  context,
  stepOutputs,
}: {
  prisma: any;
  run: { id: string; companyId: string };
  nodeId: string;
  settings: Record<string, string>;
  context: { triggerPayload?: unknown; stepOutputs: Record<string, unknown> };
  stepOutputs: Record<string, unknown>;
}) => {
  const channel = settings.channel?.trim();
  if (!channel) {
    throw new Error("Slack channel is required");
  }
  const rawMessage = settings.message ?? "";
  const message = interpolateTemplate(rawMessage, context);
  const token = await getSlackToken(prisma, run.companyId);
  const result = await executeSlackChannelMessage(token, channel, message);
  const output = { channel: result.channel, ts: result.ts };
  stepOutputs[nodeId] = output;
  await prisma.workflowRunStep.updateMany({
    where: { runId: run.id, nodeId },
    data: {
      status: "completed",
      output,
      finishedAt: new Date(),
    },
  });
  return { branch: null };
};

export const executeSlackUserMessageStep = async ({
  prisma,
  run,
  nodeId,
  settings,
  context,
  stepOutputs,
}: {
  prisma: any;
  run: { id: string; companyId: string };
  nodeId: string;
  settings: Record<string, string>;
  context: { triggerPayload?: unknown; stepOutputs: Record<string, unknown> };
  stepOutputs: Record<string, unknown>;
}) => {
  const user = settings.user?.trim();
  if (!user) {
    throw new Error("Slack user is required");
  }
  const rawMessage = settings.message ?? "";
  const message = interpolateTemplate(rawMessage, context);
  const token = await getSlackToken(prisma, run.companyId);
  const result = await executeSlackUserMessage(token, user, message);
  const output = { channel: result.channel, ts: result.ts };
  stepOutputs[nodeId] = output;
  await prisma.workflowRunStep.updateMany({
    where: { runId: run.id, nodeId },
    data: {
      status: "completed",
      output,
      finishedAt: new Date(),
    },
  });
  return { branch: null };
};
