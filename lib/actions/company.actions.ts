'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { getSignedAssetUrl } from '@/lib/storage/r2';
import { updateCompanyNameSchema, createCompanySchema } from '@/lib/validators';
import { formatError } from '@/lib/utils';
import { normalizeCompanyServices } from '@/lib/services';
import { z } from 'zod';
import { getActiveCompanyContext } from '@/lib/company-context';

type CompanyRole = 'admin' | 'member';

type CompanySummary = {
  id: string;
  name: string;
  role: CompanyRole;
  logoUrl: string | null;
  plan: string;
};

export async function getCurrentCompany() {
  try {
    const { membership, company } = await getActiveCompanyContext();

    let logoUrl: string | null = null;
    if (company.logoKey) {
      try {
        logoUrl = await getSignedAssetUrl(company.logoKey);
      } catch {
        logoUrl = null;
      }
    }

    const role: CompanyRole =
      membership.role === 'admin' ? 'admin' : 'member';
    return {
      success: true,
      data: {
        id: company.id,
        name: company.name,
        role,
        logoUrl,
        services: normalizeCompanyServices(company.services),
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCompanyContext() {
  try {
    const { membership, company, memberships } = await getActiveCompanyContext();

    const companies: CompanySummary[] = await Promise.all(
      memberships.map(async (entry) => {
        let logoUrl: string | null = null;
        if (entry.company.logoKey) {
          try {
            logoUrl = await getSignedAssetUrl(entry.company.logoKey);
          } catch {
            logoUrl = null;
          }
        }
        const role: CompanyRole = entry.role === 'admin' ? 'admin' : 'member';
        return {
          id: entry.companyId,
          name: entry.company.name,
          role,
          logoUrl,
          plan: "Pro plan",
          services: normalizeCompanyServices(entry.company.services),
        };
      }),
    );

    let activeLogoUrl: string | null = null;
    if (company.logoKey) {
      try {
        activeLogoUrl = await getSignedAssetUrl(company.logoKey);
      } catch {
        activeLogoUrl = null;
      }
    }

    const currentRole: CompanyRole =
      membership.role === 'admin' ? 'admin' : 'member';
    return {
      success: true,
      data: {
        current: {
          id: company.id,
          name: company.name,
          role: currentRole,
          logoUrl: activeLogoUrl,
          services: normalizeCompanyServices(company.services),
        },
        companies,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getUserCompanies() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const [user, memberships] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: userId },
        select: { activeCompanyId: true },
      }),
      prisma.companyMember.findMany({
        where: { userId },
        include: { company: { include: { services: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const companies: CompanySummary[] = await Promise.all(
      memberships.map(async (membership) => {
        let logoUrl: string | null = null;
        if (membership.company.logoKey) {
          try {
            logoUrl = await getSignedAssetUrl(membership.company.logoKey);
          } catch {
            logoUrl = null;
          }
        }
        const role: CompanyRole =
          membership.role === 'admin' ? 'admin' : 'member';
        return {
          id: membership.companyId,
          name: membership.company.name,
          role,
          logoUrl,
          plan: 'Pro plan',
          services: normalizeCompanyServices(membership.company.services),
        };
      })
    );

    return {
      success: true,
      data: {
        activeCompanyId: user?.activeCompanyId ?? null,
        companies,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function setActiveCompany(input: { companyId: string }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: input.companyId },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { activeCompanyId: input.companyId },
    });

    return {
      success: true,
      message: 'Company switched',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createCompanyForUser(
  input: z.infer<typeof createCompanySchema>
) {
  try {
    const payload = createCompanySchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const company = await prisma.$transaction(async (tx) => {
      const createdCompany = await tx.company.create({
        data: { name: payload.name.trim() },
      });

      await tx.companyMember.create({
        data: {
          companyId: createdCompany.id,
          userId,
          role: 'admin',
        },
      });

      await tx.companyService.createMany({
        data: [
          { companyId: createdCompany.id, serviceKey: 'DOC_MANAGER' },
          { companyId: createdCompany.id, serviceKey: 'WORKFLOWS' },
          { companyId: createdCompany.id, serviceKey: 'AI_ASSISTANT' },
        ],
      });

      await tx.user.update({
        where: { id: userId },
        data: { activeCompanyId: createdCompany.id },
      });

      return createdCompany;
    });

    return {
      success: true,
      data: { id: company.id, name: company.name },
      message: 'Company created',
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
    const { membership } = await getActiveCompanyContext();

    if (membership.companyId !== payload.companyId) {
      throw new Error('User is not authorized for this company');
    }

    if (membership.role !== 'admin') {
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
