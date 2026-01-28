'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { createDocumentRequestSchema } from '@/lib/validators';
import { formatError } from '@/lib/utils';
import { getActiveCompanyContext } from '@/lib/company-context';
import { randomUUID } from 'crypto';
import { z } from 'zod';

async function requireMembership(companyId: string, userId: string) {
  const membership = await prisma.companyMember.findFirst({
    where: { companyId, userId },
  });

  if (!membership) {
    throw new Error('User is not authorized for this company');
  }
}

export async function createDocumentRequest(
  input: z.infer<typeof createDocumentRequestSchema>
) {
  try {
    const payload = createDocumentRequestSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    await requireMembership(payload.companyId, userId);

    const template = await prisma.documentTemplate.findFirst({
      where: { id: payload.templateId, companyId: payload.companyId },
      select: { id: true },
    });

    if (!template) {
      throw new Error('Document not found');
    }

    const token = randomUUID();

    const request = await prisma.documentRequest.create({
      data: {
        companyId: payload.companyId,
        templateId: payload.templateId,
        name: payload.name,
        publicToken: token,
        createdById: userId,
      },
    });

    return {
      success: true,
      data: {
        id: request.id,
        token: request.publicToken,
        status: request.status,
        path: `/public/documents/${request.publicToken}`,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function listDocumentRequests() {
  try {
    const { membership } = await getActiveCompanyContext();

    const requests = await prisma.documentRequest.findMany({
      where: { companyId: membership.companyId },
      include: {
        template: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      success: true,
      data: {
        companyId: membership.companyId,
        requests: requests.map((request) => ({
          id: request.id,
          name: request.name,
          status: request.status,
          templateName: request.template.name,
          publicToken: request.publicToken,
          completedByName: request.completedByName,
          completedAt: request.completedAt?.toISOString() ?? null,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
          resultUrl: request.resultUrl
            ? `/api/document-requests/${request.id}/file`
            : null,
        })),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getDocumentRequest(requestId: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const request = await prisma.documentRequest.findFirst({
      where: { id: requestId },
      include: { template: { select: { name: true } } },
    });

    if (!request) {
      throw new Error('Document request not found');
    }

    await requireMembership(request.companyId, userId);

    return {
      success: true,
      data: {
        id: request.id,
        name: request.name,
        status: request.status,
        templateName: request.template.name,
        publicToken: request.publicToken,
        completedByName: request.completedByName,
        completedAt: request.completedAt?.toISOString() ?? null,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        resultUrl: request.resultUrl
          ? `/api/document-requests/${request.id}/file`
          : null,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
