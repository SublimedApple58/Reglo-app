"use server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";

type HomeOverview = {
  companyName: string;
  metrics: {
    documentsCompletedMonth: number;
    workflowsCompletedMonth: number;
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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      documentsCompletedMonth,
      workflowsCompletedMonth,
      activeWorkflows,
      pendingDocuments,
      recentDocuments,
      recentRuns,
    ] = await prisma.$transaction([
      prisma.documentRequest.count({
        where: {
          companyId: membership.companyId,
          status: "completed",
          completedAt: { gte: monthStart },
        },
      }),
      prisma.workflowRun.count({
        where: {
          companyId: membership.companyId,
          status: "completed",
          finishedAt: { gte: monthStart },
        },
      }),
      prisma.workflow.count({
        where: { companyId: membership.companyId, status: "active" },
      }),
      prisma.documentRequest.count({
        where: {
          companyId: membership.companyId,
          status: { not: "completed" },
          updatedAt: { gte: monthStart },
        },
      }),
      prisma.documentRequest.findMany({
        where: { companyId: membership.companyId, updatedAt: { gte: monthStart } },
        include: { template: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.workflowRun.findMany({
        where: { companyId: membership.companyId, createdAt: { gte: monthStart } },
        include: { workflow: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const data: HomeOverview = {
      companyName: membership.company.name,
      metrics: {
        documentsCompletedMonth,
        workflowsCompletedMonth,
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
