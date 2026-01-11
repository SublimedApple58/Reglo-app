'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { getSignedAssetUrl } from '@/lib/storage/r2';
import { updateCompanyNameSchema } from '@/lib/validators';
import { formatError } from '@/lib/utils';
import { z } from 'zod';

export async function getCurrentCompany() {
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

    let logoUrl: string | null = null;
    if (membership.company.logoKey) {
      try {
        logoUrl = await getSignedAssetUrl(membership.company.logoKey);
      } catch {
        logoUrl = null;
      }
    }

    return {
      success: true,
      data: {
        id: membership.company.id,
        name: membership.company.name,
        role: membership.role,
        logoUrl,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function updateCompanyName(
  input: z.infer<typeof updateCompanyNameSchema>
) {
  try {
    const payload = updateCompanyNameSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;
    const isGlobalAdmin = session?.user?.role === 'admin';

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: payload.companyId },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    if (!isGlobalAdmin && membership.role !== 'admin') {
      throw new Error('Only admins can update company settings');
    }

    const company = await prisma.company.update({
      where: { id: payload.companyId },
      data: { name: payload.name },
    });

    return {
      success: true,
      data: { id: company.id, name: company.name },
      message: 'Company updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
