'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowDefinitionSchema,
} from '@/lib/validators';
import { formatError } from '@/lib/utils';
import { z } from 'zod';
import { tasks } from '@trigger.dev/sdk/v3';
import { computeExecutionOrder } from '@/lib/workflows/engine';

async function requireCompanyContext() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('User is not authenticated');
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId },
    include: { company: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    throw new Error('Company not found');
  }

  return {
    userId,
    companyId: membership.companyId,
    companyName: membership.company.name,
    ownerName: session?.user?.name ?? membership.company.name,
  };
}

export async function listWorkflows() {
  try {
    const context = await requireCompanyContext();

    const workflows = await prisma.workflow.findMany({
      where: { companyId: context.companyId },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      success: true,
      data: workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        updatedAt: workflow.updatedAt.toISOString(),
        owner: context.ownerName,
      })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getWorkflowById(id: string) {
  try {
    const context = await requireCompanyContext();

    const workflow = await prisma.workflow.findFirst({
      where: { id, companyId: context.companyId },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        definition: workflow.definition,
        updatedAt: workflow.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createWorkflow(
  input: z.infer<typeof createWorkflowSchema>
) {
  try {
    const payload = createWorkflowSchema.parse(input);
    const context = await requireCompanyContext();

    const definition = workflowDefinitionSchema.parse(
      payload.definition ?? {
        trigger: { type: 'manual', config: {} },
        nodes: [],
        edges: [],
      }
    );

    const workflow = await prisma.workflow.create({
      data: {
        companyId: context.companyId,
        name: payload.name,
        status: 'draft',
        definition,
      },
    });

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
      },
      message: 'Workflow created',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateWorkflow(
  input: z.infer<typeof updateWorkflowSchema>
) {
  try {
    const payload = updateWorkflowSchema.parse(input);
    const context = await requireCompanyContext();

    const workflow = await prisma.workflow.findFirst({
      where: { id: payload.id, companyId: context.companyId },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const definition = payload.definition
      ? workflowDefinitionSchema.parse(payload.definition)
      : undefined;

    await prisma.workflow.update({
      where: { id: payload.id },
      data: {
        name: payload.name ?? undefined,
        status: payload.status ?? undefined,
        definition: definition ?? undefined,
      },
    });

    return { success: true, message: 'Workflow updated' };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteWorkflow(id: string) {
  try {
    const context = await requireCompanyContext();

    const workflow = await prisma.workflow.findFirst({
      where: { id, companyId: context.companyId },
      select: { id: true },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    await prisma.workflow.delete({ where: { id: workflow.id } });

    return { success: true, message: 'Workflow deleted' };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function listWorkflowRuns(workflowId: string) {
  try {
    const context = await requireCompanyContext();

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, companyId: context.companyId },
      select: { id: true },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      success: true,
      data: runs.map((run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getWorkflowRunDetails(runId: string) {
  try {
    const context = await requireCompanyContext();

    const run = await prisma.workflowRun.findFirst({
      where: { id: runId, companyId: context.companyId },
      include: {
        workflow: true,
        steps: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!run) {
      throw new Error('Workflow run not found');
    }

    const definition = run.workflow.definition as
      | {
          nodes?: Array<{ id: string; config?: { label?: string } }>;
        }
      | null
      | undefined;

    const labelMap = new Map<string, string>();
    (definition?.nodes ?? []).forEach((node) => {
      labelMap.set(node.id, node.config?.label ?? node.id);
    });

    return {
      success: true,
      data: {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        steps: run.steps.map((step) => ({
          id: step.id,
          nodeId: step.nodeId,
          label: labelMap.get(step.nodeId) ?? step.nodeId,
          status: step.status,
          attempt: step.attempt,
          startedAt: step.startedAt?.toISOString() ?? null,
          finishedAt: step.finishedAt?.toISOString() ?? null,
          error: step.error ?? null,
          output: step.output ?? null,
        })),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function startWorkflowRun({
  workflowId,
  triggerType = 'manual',
  triggerPayload,
}: {
  workflowId: string;
  triggerType?: string;
  triggerPayload?: unknown;
}) {
  try {
    const context = await requireCompanyContext();

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, companyId: context.companyId },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const definition = workflow.definition as {
      nodes?: Array<{ id: string; type: string; config?: Record<string, unknown> }>;
      edges?: Array<{ from: string; to: string; condition?: Record<string, unknown> | null }>;
    };

    const executionOrder = computeExecutionOrder(definition);

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        companyId: context.companyId,
        status: 'queued',
        triggerType,
        triggerPayload: triggerPayload ?? undefined,
      },
    });

    if (executionOrder.length) {
      await prisma.workflowRunStep.createMany({
        data: executionOrder.map((nodeId) => ({
          runId: run.id,
          nodeId,
          status: 'pending',
          attempt: 0,
        })),
      });
    }

    await tasks.trigger('workflow-runner', {
      runId: run.id,
    });

    return {
      success: true,
      data: { runId: run.id },
      message: 'Workflow run started',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
