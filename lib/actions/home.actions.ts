"use server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";

type HomeOverview = {
  companyName: string;
  metrics: {
    documentsCompleted30d: number;
    workflowsCompleted30d: number;
    activeWorkflows: number;
    pendingDocuments: number;
  };
  recentDocuments: Array<{
    id: string;
    name: string;
    templateName: string;
    status: string;
    completedAt: string | null;
    updatedAt: string;
  }>;
  recentRuns: Array<{
    id: string;
    workflowName: string;
    status: string;
    finishedAt: string | null;
    createdAt: string;
  }>;
};

export async function getHomeOverview() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("User is not authenticated");
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId },
      include: { company: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new Error("Company not found");
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      documentsCompleted30d,
      workflowsCompleted30d,
      activeWorkflows,
      pendingDocuments,
      recentDocuments,
      recentRuns,
    ] = await prisma.$transaction([
      prisma.documentRequest.count({
        where: {
          companyId: membership.companyId,
          status: "completed",
          completedAt: { gte: since },
        },
      }),
      prisma.workflowRun.count({
        where: {
          companyId: membership.companyId,
          status: "completed",
          finishedAt: { gte: since },
        },
      }),
      prisma.workflow.count({
        where: { companyId: membership.companyId, status: "active" },
      }),
      prisma.documentRequest.count({
        where: { companyId: membership.companyId, status: { not: "completed" } },
      }),
      prisma.documentRequest.findMany({
        where: { companyId: membership.companyId },
        include: { template: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.workflowRun.findMany({
        where: { companyId: membership.companyId },
        include: { workflow: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const data: HomeOverview = {
      companyName: membership.company.name,
      metrics: {
        documentsCompleted30d,
        workflowsCompleted30d,
        activeWorkflows,
        pendingDocuments,
      },
      recentDocuments: recentDocuments.map((request) => ({
        id: request.id,
        name: request.name,
        templateName: request.template.name,
        status: request.status,
        completedAt: request.completedAt?.toISOString() ?? null,
        updatedAt: request.updatedAt.toISOString(),
      })),
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        workflowName: run.workflow.name,
        status: run.status,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
      })),
    };

    return { success: true, data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
