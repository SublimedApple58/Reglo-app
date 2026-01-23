import { task, wait } from "@trigger.dev/sdk/v3";
import {
  computeExecutionOrder,
  evaluateCondition,
  getNextNodeId,
  type Condition,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/lib/workflows/engine";
import { getPrisma } from "@/trigger/workflow-runner/prisma";
import { toJsonValue } from "@/trigger/workflow-runner/utils";
import { executeDocCompileTemplate } from "@/trigger/workflow-runner/steps/doc-compile";
import { executeRegloEmail } from "@/trigger/workflow-runner/steps/reglo-email";
import { executeSlackChannelMessageStep, executeSlackUserMessageStep } from "@/trigger/workflow-runner/steps/slack";
import { executeFicCreateInvoice, executeFicUpdateStatus } from "@/trigger/workflow-runner/steps/fic";

export const workflowRunner = task({
  id: "workflow-runner",
  run: async (payload: { runId: string }) => {
    const prisma = await getPrisma();
    if (!("workflowRun" in prisma)) {
      const prototypeKeys = Object.getOwnPropertyNames(
        Object.getPrototypeOf(prisma),
      ).filter((key) => !key.startsWith("$") && key !== "constructor");
      throw new Error(
        `Prisma client missing WorkflowRun model. Available models: ${prototypeKeys.join(", ")}`,
      );
    }
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
              result: toJsonValue(result),
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
        return executeSlackChannelMessageStep({
          prisma,
          run,
          nodeId,
          settings,
          context,
          stepOutputs,
        });
      }

      if (node.type === "slack-user-message") {
        return executeSlackUserMessageStep({
          prisma,
          run,
          nodeId,
          settings,
          context,
          stepOutputs,
        });
      }

      if (node.type === "doc-compile-template") {
        return executeDocCompileTemplate({
          prisma,
          run,
          nodeId,
          settings,
          context,
          stepOutputs,
          getAppBaseUrl,
        });
      }

      if (node.type === "reglo-email") {
        return executeRegloEmail({
          prisma,
          run,
          nodeId,
          settings,
          context,
          stepOutputs,
        });
      }

      if (node.type === "fic-create-invoice") {
        return executeFicCreateInvoice({
          prisma,
          run,
          nodeId,
          settings,
          context,
          stepOutputs,
        });
      }

      if (node.type === "fic-update-status") {
        return executeFicUpdateStatus({
          prisma,
          run,
          nodeId,
          settings,
          context,
          stepOutputs,
        });
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
