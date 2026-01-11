'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import {
  createDocumentTemplateSchema,
  getDocumentConfigSchema,
  saveDocumentFieldsSchema,
} from '@/lib/validators';
import { formatError } from '@/lib/utils';
import { z } from 'zod';

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
            meta: field.meta,
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

    return { success: true, data: template };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
