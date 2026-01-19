'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import type { Prisma } from '@prisma/client';
import {
  createDocumentTemplateSchema,
  getDocumentConfigSchema,
  saveDocumentFieldsSchema,
} from '@/lib/validators';
import { formatError } from '@/lib/utils';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Bucket, getR2Client } from '@/lib/storage/r2';
import { randomUUID } from 'crypto';

async function requireCompanyAccess(companyId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('User is not authenticated');
  }

  const membership = await prisma.companyMember.findFirst({
    where: { companyId, userId },
  });

  if (!membership) {
    throw new Error('User is not authorized for this company');
  }

  return { userId };
}

export async function listDocumentTemplates() {
  try {
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

    const templates = await prisma.documentTemplate.findMany({
      where: { companyId: membership.companyId },
      include: {
        fields: {
          select: { bindingKey: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const owner = session?.user?.name ?? membership.company.name;
    const documents = templates.map((template) => {
      const previewUrl = template.sourceUrl
        ? `/api/documents/${template.id}/file`
        : null;
      const hasFields = template.fields.length > 0;
      const allBound = hasFields
        ? template.fields.every((field) => Boolean(field.bindingKey))
        : false;
      const status = hasFields
        ? allBound
          ? 'Bindato'
          : 'Configurato'
        : 'Bozza';
      const bindingKeys = Array.from(
        new Set(
          template.fields
            .map((field) => field.bindingKey?.trim())
            .filter(Boolean) as string[]
        )
      );
      return {
        id: template.id,
        title: template.name,
        updatedAt: template.updatedAt.toISOString(),
        owner,
        previewUrl,
        sourceUrl: template.sourceUrl,
        status,
        bindingKeys,
      };
    });

    return {
      success: true,
      data: {
        companyId: membership.companyId,
        companyName: membership.company.name,
        documents,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createDocumentTemplate(
  input: z.infer<typeof createDocumentTemplateSchema>
) {
  try {
    const payload = createDocumentTemplateSchema.parse(input);
    await requireCompanyAccess(payload.companyId);

    const template = await prisma.documentTemplate.create({
      data: {
        companyId: payload.companyId,
        name: payload.name,
        sourceUrl: payload.sourceUrl,
      },
    });

    return {
      success: true,
      templateId: template.id,
      message: 'Document created',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createBlankDocumentTemplate(
  input: z.infer<typeof createDocumentTemplateSchema>
) {
  try {
    const payload = createDocumentTemplateSchema.parse(input);
    await requireCompanyAccess(payload.companyId);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const pdfBytes = await pdfDoc.save();
    const key = `companies/${payload.companyId}/documents/${randomUUID()}.pdf`;

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: Buffer.from(pdfBytes),
        ContentType: 'application/pdf',
      })
    );

    const template = await prisma.documentTemplate.create({
      data: {
        companyId: payload.companyId,
        name: payload.name,
        sourceUrl: key,
      },
    });

    return {
      success: true,
      templateId: template.id,
      message: 'Document created',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function deleteDocumentTemplate(templateId: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const template = await prisma.documentTemplate.findFirst({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Document not found');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: template.companyId },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    const workflows = await prisma.workflow.findMany({
      where: { companyId: template.companyId, status: 'active' },
    });

    const affected = workflows.filter((workflow) => {
      const definition = workflow.definition as {
        trigger?: { type?: string; config?: Record<string, unknown> };
        nodes?: Array<{ type?: string; config?: Record<string, unknown> }>;
      };
      const trigger = definition?.trigger;
      if (trigger?.type === 'document_completed') {
        const config = trigger.config ?? {};
        if (config.templateId === templateId) return true;
      }
      const nodes = definition?.nodes ?? [];
      return nodes.some((node) => {
        if (node.type !== 'doc-compile-template') return false;
        const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
        return settings.templateId === templateId;
      });
    });

    if (affected.length > 0) {
      await prisma.workflow.updateMany({
        where: { id: { in: affected.map((workflow) => workflow.id) } },
        data: { status: 'paused' },
      });
    }

    await prisma.documentTemplate.delete({
      where: { id: templateId },
    });

    const message =
      affected.length > 0
        ? `Documento eliminato. ${affected.length} workflow disattivati perché usavano questo template.`
        : 'Document deleted';

    return { success: true, message };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function saveDocumentFields(
  input: z.infer<typeof saveDocumentFieldsSchema>
) {
  try {
    const payload = saveDocumentFieldsSchema.parse(input);
    await requireCompanyAccess(payload.companyId);

    const template = await prisma.documentTemplate.findFirst({
      where: { id: payload.templateId, companyId: payload.companyId },
    });

    if (!template) {
      throw new Error('Document not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentField.deleteMany({
        where: { templateId: payload.templateId },
      });

      if (payload.fields.length > 0) {
        await tx.documentField.createMany({
          data: payload.fields.map((field) => ({
            templateId: payload.templateId,
            type: field.type,
            label: field.label,
            bindingKey: field.bindingKey,
            page: field.page,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            meta: field.meta as Prisma.InputJsonValue | undefined,
          })),
        });
      }
    });

    return { success: true, message: 'Fields saved' };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getDocumentConfig(
  input: z.infer<typeof getDocumentConfigSchema>
) {
  try {
    const payload = getDocumentConfigSchema.parse(input);
    await requireCompanyAccess(payload.companyId);

    const template = await prisma.documentTemplate.findFirst({
      where: { id: payload.templateId, companyId: payload.companyId },
      include: {
        fields: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!template) {
      throw new Error('Document not found');
    }

    const sourceUrl = template.sourceUrl
      ? `/api/documents/${template.id}/file`
      : null;

    return {
      success: true,
      data: {
        ...template,
        sourceUrl,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
