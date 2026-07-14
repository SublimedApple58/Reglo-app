'use server';

import crypto from 'crypto';
import {
  signInFormSchema,
  signUpFormSchema,
  updateUserSchema,
} from '../validators';
import { auth, signIn, signOut } from '@/auth';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { hash } from '../encrypt';
import { prisma } from '@/db/prisma';
import { syncInstructorName } from '../sync-instructor-name';
import { formatError } from '../utils';
import { z } from 'zod';
import { PAGE_SIZE } from '../constants';
import { revalidatePath } from 'next/cache';
import { Prisma, User } from '@prisma/client';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getDefaultAutoscuolaRole, deriveCompanyMemberRole, isInstructor } from '@/lib/autoscuole/roles';
import { isLicenseCategory, isTransmission } from '@/lib/autoscuole/license';
import { operationallyCancelAppointmentsByResource } from '@/lib/autoscuole/operational-cancellation';
import { deleteAndAnonymizeUserAccount, releaseEmailIfOrphaned } from '@/lib/account-deletion';

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

    // Check if user has multiple companies — if so, redirect to company selector
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { _count: { select: { companyMembers: true } } },
    });
    const redirectTo =
      dbUser && dbUser._count.companyMembers > 1
        ? '/select-company'
        : callbackUrl;

    await signIn('credentials', { ...user, redirectTo });

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

    // A previously deleted (orphaned) account must not block re-registration
    // with the same email.
    const emailFree = await releaseEmailIfOrphaned(user.email);
    if (!emailFree) throw new Error('Esiste già un account con questa email.');

    user.password = await hash(user.password);

    const companyName = user.companyName.trim();

    const createdUser = await prisma.$transaction(async (tx) => {
      const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
      const company = await tx.company.create({
        data: { name: companyName, inviteCode },
      });

      const createdUser = await tx.user.create({
        data: {
          name: user.name,
          email: user.email,
          password: user.password,
          role: 'admin',
          activeCompanyId: company.id,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: createdUser.id,
          role: 'admin',
          autoscuolaRole: getDefaultAutoscuolaRole('admin'),
        },
      });

      await tx.companyService.createMany({
        data: [
          { companyId: company.id, serviceKey: 'AUTOSCUOLE', status: 'DISABLED' },
        ],
      });

      await tx.autoscuolaLocation.create({
        data: {
          companyId: company.id,
          name: `Sede ${company.name}`,
          isDefault: true,
          isPrecise: false,
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

// Update the user profile
/** Profilo dell'utente loggato (per la pane "Informazioni aziendali" e simili). */
export async function getMyProfile() {
  try {
    const session = await auth();
    const currentUser = await prisma.user.findFirst({
      where: { id: session?.user?.id },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!currentUser) throw new Error('User not found');
    return { success: true as const, data: currentUser };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function updateProfile(user: { name: string; email: string; phone?: string | null }) {
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
        ...(user.phone !== undefined ? { phone: user.phone?.trim() || null } : {}),
      },
    });

    // Keep the denormalized instructor name (used in all instructor
    // lists/selectors) in sync with the account name.
    await syncInstructorName(currentUser.id, user.name);

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
  /** Conteggio complessivo (post filtri) — presente solo per getCompanyUsers. */
  total?: number;
};

type CompanyUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  autoscuolaRole?: 'OWNER' | 'INSTRUCTOR_OWNER' | 'INSTRUCTOR' | 'STUDENT' | null;
  status: 'active' | 'invited';
};

type CompanyUserRowWithDate = CompanyUserRow & { createdAt: Date };
type CompanyUserRole = CompanyUserRow['role'];

const normalizeMemberRole = (role: string): CompanyUserRole =>
  role === 'admin' ? 'admin' : 'member';

async function requireCompanyAdminContext() {
  const { session, membership } = await getActiveCompanyContext();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('User is not authenticated');
  }

  if (membership.role !== 'admin') {
    throw new Error('Only admins can manage users');
  }

  return { userId, companyId: membership.companyId };
}

export async function getCompanyUsers({
  limit = PAGE_SIZE,
  page,
  query = '',
  role,
}: {
  limit?: number;
  page: number;
  query?: string;
  role?: 'OWNER' | 'INSTRUCTOR_OWNER' | 'INSTRUCTOR' | 'STUDENT';
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
  });

  const invites = await prisma.companyInvite.findMany({
    where: {
      companyId: context.companyId,
      status: 'pending',
      expiresAt: { gt: new Date() },
      email:
        query && query !== 'all'
          ? {
              contains: query,
              mode: 'insensitive',
            }
          : undefined,
    },
    orderBy: { createdAt: 'desc' },
  });

  const memberEmails = new Set(
    members.map((member) => member.user.email.toLowerCase())
  );

  const inviteRows: CompanyUserRowWithDate[] = invites
    .filter((invite) => !memberEmails.has(invite.email.toLowerCase()))
    .map((invite) => ({
      id: invite.id,
      name: invite.email.split('@')[0] || 'Invited',
      email: invite.email,
      role: normalizeMemberRole(invite.role),
      autoscuolaRole: invite.role === 'admin' ? 'OWNER' : 'STUDENT',
      status: 'invited',
      createdAt: invite.createdAt,
    }));

  const memberRows: CompanyUserRowWithDate[] = members.map((member) => ({
    id: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: normalizeMemberRole(member.role),
    autoscuolaRole: member.autoscuolaRole,
    status: 'active',
    createdAt: member.createdAt,
  }));

  const rows = [...inviteRows, ...memberRows]
    .filter((row) => !role || (row.autoscuolaRole ?? 'STUDENT') === role)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const dataCount = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);

  return {
    data: paged.map(
      ({ createdAt, ...rest }) => rest as CompanyUserRow
    ),
    totalPages: Math.ceil(dataCount / limit),
    total: dataCount,
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

    await prisma.$transaction(async (tx) => {
      await tx.companyMember.delete({
        where: {
          companyId_userId: {
            companyId: context.companyId,
            userId: id,
          },
        },
      });

      const user = await tx.user.findUnique({
        where: { id },
        select: { activeCompanyId: true },
      });

      if (user?.activeCompanyId === context.companyId) {
        const fallbackMembership = await tx.companyMember.findFirst({
          where: { userId: id },
          orderBy: { createdAt: 'asc' },
          select: { companyId: true },
        });

        await tx.user.update({
          where: { id },
          data: { activeCompanyId: fallbackMembership?.companyId ?? null },
        });
      }
    });

    if (isInstructor(targetMembership.autoscuolaRole)) {
      const instructor = await prisma.autoscuolaInstructor.findFirst({
        where: {
          companyId: context.companyId,
          userId: id,
        },
        select: { id: true },
      });

      if (instructor) {
        await prisma.autoscuolaInstructor.update({
          where: { id: instructor.id },
          data: {
            status: 'inactive',
            userId: null,
          },
        });

        const impactedAppointments = await prisma.autoscuolaAppointment.findMany({
          where: {
            companyId: context.companyId,
            instructorId: instructor.id,
            startsAt: { gt: new Date() },
            status: { in: ['scheduled', 'confirmed', 'checked_in'] },
          },
          select: { id: true },
        });

        await operationallyCancelAppointmentsByResource({
          companyId: context.companyId,
          appointmentIds: impactedAppointments.map((item) => item.id),
          reason: 'directory_instructor_removed',
          actorUserId: context.userId,
        });
      }
    }

    // Free the email when the user no longer belongs to ANY company. Removing a
    // member left the User row (with its email) in place, so re-registering the
    // same email later failed with "Esiste già un account per questa email".
    // Anonymising the orphaned account (email → deleted+<id>@…, password null)
    // releases the address, matching the mobile self-deletion behaviour. Users
    // still in other companies are left untouched (their email must stay).
    const remainingMemberships = await prisma.companyMember.count({
      where: { userId: id },
    });
    if (remainingMemberships === 0) {
      await deleteAndAnonymizeUserAccount(id, {
        trigger: "directory_removal",
        actorUserId: context.userId,
        companyId: context.companyId,
      });
    }

    revalidatePath('/admin/users');

    return {
      success: true,
      message: 'User removed from company',
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
      data: {
        ...(user.autoscuolaRole
          ? {
              autoscuolaRole: user.autoscuolaRole,
              role: deriveCompanyMemberRole(user.autoscuolaRole),
            }
          : {}),
      },
    });

    // Auto-sync AutoscuolaInstructor record when role changes
    if (user.autoscuolaRole) {
      if (isInstructor(user.autoscuolaRole)) {
        await prisma.autoscuolaInstructor.upsert({
          where: {
            companyId_userId: {
              companyId: context.companyId,
              userId: user.id,
            },
          },
          update: { status: 'active', name: user.name || undefined },
          create: {
            companyId: context.companyId,
            userId: user.id,
            name: user.name || user.id,
          },
        });
      } else {
        // Role changed away from instructor — deactivate instructor record
        await prisma.autoscuolaInstructor.updateMany({
          where: { companyId: context.companyId, userId: user.id },
          data: { status: 'inactive' },
        });
      }
    }

    revalidatePath('/admin/users');

    return {
      success: true,
      message: 'User updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

// Create a user directly (no invite) and add them to the company
export async function createCompanyUser(input: {
  companyId: string;
  name: string;
  email: string;
  password: string;
  autoscuolaRole: 'OWNER' | 'INSTRUCTOR_OWNER' | 'INSTRUCTOR' | 'STUDENT';
  // Student-only (ignored for other roles): license path + optional
  // assignment to an autonomous instructor.
  licenseCategory?: string;
  transmission?: string;
  assignedInstructorId?: string | null;
  // Student-only: starting phase. TEORIA consumes a quiz seat (same rules as
  // grantQuizSeat); AWAITING/TEORIA are valid only if the school has the
  // TEORIA phase enabled. Omitted → PRATICA (schema default).
  studentPhase?: 'AWAITING' | 'TEORIA' | 'PRATICA';
}) {
  try {
    const session = await auth();
    const callerId = session?.user?.id;
    if (!callerId) throw new Error('Non autenticato.');

    const membership = await prisma.companyMember.findFirst({
      where: { userId: callerId, companyId: input.companyId },
    });
    if (!membership || membership.role !== 'admin') {
      throw new Error('Solo gli admin possono creare utenti.');
    }

    const email = input.email.trim().toLowerCase();

    // Students get their license path at creation (falling back to the
    // autoscuola's configured default, like the mobile self-registration).
    let studentFields: {
      licenseCategory: string;
      transmission: string;
      assignedInstructorId: string | null;
      studentPhase?: 'AWAITING' | 'TEORIA' | 'PRATICA';
      quizSeatGrantedAt?: Date;
      phaseClassifiedAt?: Date;
    } | null = null;
    if (input.autoscuolaRole === 'STUDENT') {
      const service = await prisma.companyService.findFirst({
        where: { companyId: input.companyId, serviceKey: 'AUTOSCUOLE', status: 'ACTIVE' },
        select: { limits: true },
      });
      const limits = (service?.limits ?? null) as Record<string, unknown> | null;

      let assignedInstructorId: string | null = null;
      if (input.assignedInstructorId) {
        const instructor = await prisma.autoscuolaInstructor.findFirst({
          where: {
            id: input.assignedInstructorId,
            companyId: input.companyId,
            autonomousMode: true,
          },
          select: { id: true },
        });
        if (!instructor) throw new Error('Istruttore non valido o non autonomo.');
        assignedInstructorId = instructor.id;
      }

      studentFields = {
        licenseCategory: isLicenseCategory(input.licenseCategory)
          ? input.licenseCategory
          : typeof limits?.defaultLicenseCategory === 'string'
            ? limits.defaultLicenseCategory
            : 'B',
        transmission: isTransmission(input.transmission)
          ? input.transmission
          : typeof limits?.defaultTransmission === 'string'
            ? limits.defaultTransmission
            : 'manual',
        assignedInstructorId,
      };

      if (input.studentPhase && input.studentPhase !== 'PRATICA') {
        const phasesEnabledRaw = Array.isArray(limits?.phasesEnabled)
          ? (limits.phasesEnabled as unknown[])
          : ['PRATICA'];
        const teoriaEnabled = phasesEnabledRaw.includes('TEORIA');
        if (!teoriaEnabled) {
          throw new Error('La fase Teoria non è attiva per questa autoscuola.');
        }
        if (input.studentPhase === 'TEORIA') {
          const quizSeats =
            typeof limits?.quizSeats === 'number' && Number.isFinite(limits.quizSeats)
              ? Math.max(0, Math.floor(limits.quizSeats))
              : 0;
          const used = await prisma.companyMember.count({
            where: {
              companyId: input.companyId,
              role: 'member',
              quizSeatGrantedAt: { not: null },
            },
          });
          if (used >= quizSeats) {
            throw new Error('Posti quiz esauriti. Contatta Reglo per acquistarne altri.');
          }
          const now = new Date();
          studentFields.studentPhase = 'TEORIA';
          studentFields.quizSeatGrantedAt = now;
          studentFields.phaseClassifiedAt = now;
        } else {
          studentFields.studentPhase = 'AWAITING';
          studentFields.phaseClassifiedAt = new Date();
        }
      } else if (input.studentPhase === 'PRATICA') {
        studentFields.studentPhase = 'PRATICA';
        studentFields.phaseClassifiedAt = new Date();
      }
    }

    // Orphaned accounts (deleted from the Directory but still holding the
    // email) get anonymized on the spot so the address can be reused.
    const emailFree = await releaseEmailIfOrphaned(email);
    if (!emailFree) throw new Error('Esiste già un account con questa email.');

    const hashedPassword = await hash(input.password);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          password: hashedPassword,
          role: 'user',
          activeCompanyId: input.companyId,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: input.companyId,
          userId: user.id,
          role: deriveCompanyMemberRole(input.autoscuolaRole),
          autoscuolaRole: input.autoscuolaRole,
          ...(studentFields ?? {}),
        },
      });

      // Auto-create AutoscuolaInstructor record when role includes instructor
      if (isInstructor(input.autoscuolaRole)) {
        await tx.autoscuolaInstructor.create({
          data: {
            companyId: input.companyId,
            userId: user.id,
            name: input.name.trim(),
          },
        });
      }
    });

    revalidatePath('/admin/users');
    return { success: true, message: 'Utente creato con successo.' };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
