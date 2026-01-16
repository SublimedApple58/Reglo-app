import { task, wait } from "@trigger.dev/sdk/v3";
import { prisma } from "@/db/prisma";
import {
  computeExecutionOrder,
  evaluateCondition,
  getNextNodeId,
  interpolateTemplate,
  type Condition,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/lib/workflows/engine";
import { decryptSecret } from "@/lib/integrations/secrets";
import { randomUUID } from "crypto";

type SlackProfileResponse = {
  ok: boolean;
  user?: { id?: string };
  error?: string;
};

type SlackOpenConversationResponse = {
  ok: boolean;
  channel?: { id?: string };
  error?: string;
};

type SlackPostMessageResponse = {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
};

export const workflowRunner = task({
  id: "workflow-runner",
  run: async (payload: { runId: string }) => {
    const run = await prisma.workflowRun.findUnique({
      where: { id: payload.runId },
      include: { workflow: true },
    });

    if (!run) {
      throw new Error("Workflow run not found");
    }

    const definition = run.workflow.definition as {
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
      settings?: {
        retryPolicy?: { maxAttempts?: number; backoffSeconds?: number };
      };
    };

    const executionOrder = computeExecutionOrder(definition);
    const retryPolicy = definition.settings?.retryPolicy ?? {};
    const maxAttempts = retryPolicy.maxAttempts ?? 3;
    const backoffSeconds = retryPolicy.backoffSeconds ?? 5;

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "running",
        startedAt: new Date(),
      },
    });

    const nodes = definition.nodes ?? [];
    const edges = definition.edges ?? [];
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const stepOutputs: Record<string, unknown> = {};
    const loopCounters = new Map<string, number>();
    const maxSteps = Math.max(50, nodes.length * 5);

    const getAppBaseUrl = () =>
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_SERVER_URL ||
      "http://localhost:3000";

    const getSlackToken = async (companyId: string) => {
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

    const executeSlackChannelMessage = async (
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

    const executeSlackUserMessage = async (
      token: string,
      userInput: string,
      message: string,
    ) => {
      let userId = userInput.trim();
      if (userId.includes("@")) {
        const response = await fetch(
          "https://slack.com/api/users.lookupByEmail",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ email: userId }),
          },
        );
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

    const executeNode = async (nodeId: string) => {
      const node = nodesById.get(nodeId);
      if (!node) {
        throw new Error("Workflow node not found");
      }

      await prisma.workflowRunStep.updateMany({
        where: { runId: run.id, nodeId },
        data: {
          status: "running",
          startedAt: new Date(),
        },
      });

      if (node.type === "logicIf") {
        const condition = node.config?.condition as Condition | undefined;
        const result = condition
          ? evaluateCondition(condition, {
              triggerPayload: run.triggerPayload ?? undefined,
              stepOutputs,
            })
          : false;
        const output = { result };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });
        return { branch: result ? "yes" : "no" };
      }

      if (node.type === "logicLoop") {
        const mode = (node.config?.mode as string | undefined) ?? "for";
        const condition = node.config?.condition as Condition | undefined;
        let shouldLoop = false;
        let iterationsLeft = loopCounters.get(nodeId) ?? 0;

        if (mode === "while") {
          shouldLoop = condition
            ? evaluateCondition(condition, {
                triggerPayload: run.triggerPayload ?? undefined,
                stepOutputs,
              })
            : false;
        } else {
          if (iterationsLeft === 0) {
            const total = Number(node.config?.iterations ?? 0);
            iterationsLeft = Number.isFinite(total) ? total : 0;
          }
          if (iterationsLeft > 0) {
            shouldLoop = true;
            iterationsLeft -= 1;
          }
          loopCounters.set(nodeId, iterationsLeft);
        }

        const output = { shouldLoop, iterationsLeft };
        stepOutputs[nodeId] = output;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output,
            finishedAt: new Date(),
          },
        });

        return { branch: shouldLoop ? "loop" : "next" };
      }

      if (node.type === "wait") {
        const timeout =
          typeof node.config?.timeout === "string" ? node.config.timeout : "24h";
        const token = await wait.createToken({
          timeout,
          tags: [run.id, nodeId],
        });
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "waiting",
            output: {
              waitpointId: token.id,
              url: token.url,
            },
          },
        });
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: "waiting" },
        });

        const result = await wait.forToken(token).unwrap();

        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId },
          data: {
            status: "completed",
            output: {
              waitpointId: token.id,
              result,
            },
            finishedAt: new Date(),
          },
        });

        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: "running" },
        });

        stepOutputs[nodeId] = result;
        return { branch: null };
      }

      const settings = (node.config?.settings ?? {}) as Record<string, string>;
      const context = {
        triggerPayload: run.triggerPayload ?? undefined,
        stepOutputs,
      };

      if (node.type === "slack-channel-message") {
        const channel = settings.channel?.trim();
        if (!channel) {
          throw new Error("Slack channel is required");
        }
        const rawMessage = settings.message ?? "";
        const message = interpolateTemplate(rawMessage, context);
        const token = await getSlackToken(run.companyId);
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
      }

      if (node.type === "slack-user-message") {
        const user = settings.user?.trim();
        if (!user) {
          throw new Error("Slack user is required");
        }
        const rawMessage = settings.message ?? "";
        const message = interpolateTemplate(rawMessage, context);
        const token = await getSlackToken(run.companyId);
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
      }

      if (node.type === "doc-compile-template") {
        const templateId = settings.templateId?.trim();
        const rawName = settings.requestName ?? "";
        if (!templateId) {
          throw new Error("Template is required");
        }
        if (!rawName.trim()) {
          throw new Error("Request name is required");
        }
        const name = interpolateTemplate(rawName, context);
        const template = await prisma.documentTemplate.findFirst({
          where: { id: templateId, companyId: run.companyId },
          select: { id: true, name: true },
        });
        if (!template) {
          throw new Error("Template not found");
        }
        const token = randomUUID();
        const request = await prisma.documentRequest.create({
          data: {
            companyId: run.companyId,
            templateId,
            name,
            publicToken: token,
          },
        });
        const path = `/public/documents/${request.publicToken}`;
        const publicUrl = `${getAppBaseUrl()}${path}`;
        const output = {
          requestId: request.id,
          templateId,
          templateName: template.name,
          publicToken: request.publicToken,
          path,
          publicUrl,
        };
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
      }

      const output = { message: "Step executed (stub)" };
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

    let current: string | null = executionOrder[0] ?? null;
    let stepsVisited = 0;

    while (current && stepsVisited < maxSteps) {
      stepsVisited += 1;
      let branch: string | null = null;
      let attempt = 0;
      while (attempt < maxAttempts) {
        attempt += 1;
        await prisma.workflowRunStep.updateMany({
          where: { runId: run.id, nodeId: current },
          data: { attempt },
        });
        try {
          const result = await executeNode(current);
          branch = result.branch ?? null;
          break;
        } catch (error) {
          if (attempt >= maxAttempts) {
            await prisma.workflowRunStep.updateMany({
              where: { runId: run.id, nodeId: current },
              data: {
                status: "failed",
                error: {
                  message: error instanceof Error ? error.message : "Step failed",
                },
                finishedAt: new Date(),
              },
            });
            await prisma.workflowRun.update({
              where: { id: run.id },
              data: { status: "failed", finishedAt: new Date() },
            });
            return { status: "failed" };
          }
          await new Promise((resolve) =>
            setTimeout(resolve, backoffSeconds * 1000),
          );
        }
      }

      current = getNextNodeId(current, edges, branch);
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
      },
    });

    return { status: "completed" };
  },
});
