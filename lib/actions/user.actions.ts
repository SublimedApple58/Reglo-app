'use server';

import {
  signInFormSchema,
  signUpFormSchema,
  paymentMethodSchema,
  updateUserSchema,
} from '../validators';
import { auth, signIn, signOut } from '@/auth';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { hash } from '../encrypt';
import { prisma } from '@/db/prisma';
import { formatError } from '../utils';
import { z } from 'zod';
import { PAGE_SIZE } from '../constants';
import { revalidatePath } from 'next/cache';
import { Prisma, User } from '@prisma/client';

// Sign in the user with credentials
export async function signInWithCredentials(
  prevState: unknown,
  formData: FormData
) {
  try {
    const callbackUrl = formData.get('callbackUrl')?.toString() || '/';
    const user = signInFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    await signIn('credentials', { ...user, redirectTo: callbackUrl });

    return { success: true, message: 'Signed in successfully' };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, message: 'Invalid email or password' };
  }
}

// Sign user out
export async function signOutUser() {
  await signOut();
}

// Sign up user
export async function signUpUser(prevState: unknown, formData: FormData) {
  try {
    const callbackUrl = formData.get('callbackUrl')?.toString() || '/';
    const user = signUpFormSchema.parse({
      companyName: formData.get('companyName'),
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    });

    const plainPassword = user.password;

    user.password = await hash(user.password);

    const companyName = user.companyName.trim();

    const createdUser = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: companyName },
      });

      const createdUser = await tx.user.create({
        data: {
          name: user.name,
          email: user.email,
          password: user.password,
          role: 'admin',
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: createdUser.id,
          role: 'admin',
        },
      });

      return createdUser;
    });

    await signIn('credentials', {
      email: createdUser.email,
      password: plainPassword,
      redirectTo: callbackUrl,
    });

    return { success: true, message: 'User registered successfully' };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, message: formatError(error) };
  }
}

// Get user by the ID
export async function getUserById(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
  });
  if (!user) throw new Error('User not found');
  return user;
}

// Update user's payment method
export async function updateUserPaymentMethod(
  data: z.infer<typeof paymentMethodSchema>
) {
  try {
    const session = await auth();
    const currentUser = await prisma.user.findFirst({
      where: { id: session?.user?.id },
    });

    if (!currentUser) throw new Error('User not found');

    const paymentMethod = paymentMethodSchema.parse(data);

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { paymentMethod: paymentMethod.type },
    });

    return {
      success: true,
      message: 'User updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// Update the user profile
export async function updateProfile(user: { name: string; email: string }) {
  try {
    const session = await auth();

    const currentUser = await prisma.user.findFirst({
      where: {
        id: session?.user?.id,
      },
    });

    if (!currentUser) throw new Error('User not found');

    await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        name: user.name,
      },
    });

    return {
      success: true,
      message: 'User updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

type PaginatedUsers<T> = {
  data: T[];
  totalPages: number;
};

type CompanyUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
};

async function requireCompanyAdminContext() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('User is not authenticated');
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) {
    throw new Error('Company not found');
  }

  const isAdmin =
    membership.role === 'admin';

  if (!isAdmin) {
    throw new Error('Only admins can manage users');
  }

  return { userId, companyId: membership.companyId };
}

export async function getCompanyUsers({
  limit = PAGE_SIZE,
  page,
  query = '',
}: {
  limit?: number;
  page: number;
  query?: string;
}): Promise<PaginatedUsers<CompanyUserRow>> {
  const context = await requireCompanyAdminContext();

  const userFilter: Prisma.UserWhereInput =
    query && query !== 'all'
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: 'insensitive',
              } as Prisma.StringFilter,
            },
            {
              email: {
                contains: query,
                mode: 'insensitive',
              } as Prisma.StringFilter,
            },
          ],
        }
      : {};

  const where: Prisma.CompanyMemberWhereInput = {
    companyId: context.companyId,
    user: Object.keys(userFilter).length ? userFilter : undefined,
  };

  const members = await prisma.companyMember.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
  });

  const data: CompanyUserRow[] = members.map((member) => ({
    id: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role === 'admin' ? 'admin' : 'member',
  }));

  const dataCount = await prisma.companyMember.count({ where });

  return {
    data,
    totalPages: Math.ceil(dataCount / limit),
  };
}

export async function getAllUsers({
  limit = PAGE_SIZE,
  page,
  query = '',
}: {
  limit?: number;
  page: number;
  query?: string;
}): Promise<PaginatedUsers<User>> {
  const queryFilter: Prisma.UserWhereInput =
    query && query !== 'all'
      ? {
          name: {
            contains: query,
            mode: 'insensitive',
          } as Prisma.StringFilter,
        }
      : {};

  const data = await prisma.user.findMany({
    where: {
      ...queryFilter,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
  });

  const dataCount = await prisma.user.count();

  return {
    data,
    totalPages: Math.ceil(dataCount / limit),
  };
}

// Delete a user
export async function deleteUser(id: string) {
  try {
    const context = await requireCompanyAdminContext();

    const targetMembership = await prisma.companyMember.findFirst({
      where: { companyId: context.companyId, userId: id },
    });

    if (!targetMembership) {
      throw new Error('User not found in this company');
    }

    const membershipCount = await prisma.companyMember.count({
      where: { userId: id },
    });

    if (membershipCount <= 1) {
      await prisma.user.delete({ where: { id } });
    } else {
      await prisma.companyMember.delete({
        where: {
          companyId_userId: {
            companyId: context.companyId,
            userId: id,
          },
        },
      });
    }

    revalidatePath('/admin/users');

    return {
      success: true,
      message: 'User deleted successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: formatError(error),
    };
  }
}

// Update a user
export async function updateUser(user: z.infer<typeof updateUserSchema>) {
  try {
    const context = await requireCompanyAdminContext();

    const targetMembership = await prisma.companyMember.findFirst({
      where: { companyId: context.companyId, userId: user.id },
    });

    if (!targetMembership) {
      throw new Error('User not found in this company');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { name: user.name },
    });

    await prisma.companyMember.update({
      where: {
        companyId_userId: {
          companyId: context.companyId,
          userId: user.id,
        },
      },
      data: { role: user.role },
    });

    revalidatePath('/admin/users');

    return {
      success: true,
      message: 'User updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
