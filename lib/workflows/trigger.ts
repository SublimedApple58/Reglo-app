import { prisma } from "@/db/prisma";
import { tasks } from "@trigger.dev/sdk/v3";
import { computeExecutionOrder } from "@/lib/workflows/engine";

type TriggerPayload = Record<string, unknown>;

type TriggerWorkflowInput = {
  companyId: string;
  templateId: string;
  triggerPayload: TriggerPayload;
};

export async function triggerDocumentCompletionWorkflows({
  companyId,
  templateId,
  triggerPayload,
}: TriggerWorkflowInput) {
  const workflows = await prisma.workflow.findMany({
    where: { companyId, status: "active" },
  });

  const matching = workflows.filter((workflow) => {
    const definition = workflow.definition as {
      trigger?: { type?: string; config?: Record<string, unknown> };
    };
    const trigger = definition?.trigger;
    if (trigger?.type !== "document_completed") return false;
    const config = trigger.config ?? {};
    return config.templateId === templateId;
  });

  if (matching.length === 0) return;

  await Promise.all(
    matching.map(async (workflow) => {
      const definition = workflow.definition as {
        nodes?: Array<{ id: string }>;
        edges?: Array<{ from: string; to: string; condition?: Record<string, unknown> | null }>;
      };
      const executionOrder = computeExecutionOrder(definition);

      const run = await prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          companyId,
          status: "queued",
          triggerType: "document_completed",
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
    }),
  );
}
