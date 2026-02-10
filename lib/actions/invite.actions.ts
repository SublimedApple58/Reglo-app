'use server';

import { auth, signIn } from '@/auth';
import { prisma } from '@/db/prisma';
import { sendCompanyInviteEmail } from '@/email';
import { routing } from '@/i18n/routing';
import { SERVER_URL } from '@/lib/constants';
import { formatError } from '@/lib/utils';
import { getDefaultAutoscuolaRole } from '@/lib/autoscuole/roles';
import {
  acceptCompanyInviteSchema,
  acceptCompanyInvitePasswordSchema,
  acceptCompanyInviteSignUpSchema,
  cancelCompanyInviteSchema,
  createCompanyInviteSchema,
  resendCompanyInviteSchema,
} from '@/lib/validators';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { compare, hash } from '@/lib/encrypt';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

const INVITE_TTL_DAYS = 7;

const buildMobileInviteUrl = (token: string) => {
  return `${SERVER_URL}/api/mobile/invites/${token}/open`;
};

export async function createCompanyInvite(
  input: z.infer<typeof createCompanyInviteSchema>
) {
  try {
    const payload = createCompanyInviteSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: payload.companyId },
      include: { company: true },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    if (membership.role !== 'admin') {
      throw new Error('Only admins can invite users');
    }

    const email = payload.email.trim().toLowerCase();

    const existingMember = await prisma.companyMember.findFirst({
      where: {
        companyId: payload.companyId,
        user: { email },
      },
    });

    if (existingMember) {
      throw new Error('User already belongs to this company');
    }

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const existingInvite = await prisma.companyInvite.findFirst({
      where: {
        companyId: payload.companyId,
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    const invite = existingInvite
      ? await prisma.companyInvite.update({
          where: { id: existingInvite.id },
          data: { role: payload.role, expiresAt },
        })
      : await prisma.companyInvite.create({
          data: {
            companyId: payload.companyId,
            email,
            role: payload.role,
            token: randomUUID(),
            status: 'pending',
            expiresAt,
            invitedById: userId,
          },
        });

    const autoscuolaService = await prisma.companyService.findFirst({
      where: {
        companyId: payload.companyId,
        serviceKey: 'AUTOSCUOLE',
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const inviteUrl = `${SERVER_URL}/${routing.defaultLocale}/invite/${invite.token}`;
    const mobileInviteUrl = autoscuolaService
      ? buildMobileInviteUrl(invite.token)
      : null;

    await sendCompanyInviteEmail({
      to: email,
      companyName: membership.company.name,
      inviteUrl,
      mobileInviteUrl,
      invitedByName: session?.user?.name ?? null,
    });

    return {
      success: true,
      message: 'Invite sent successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function resendCompanyInvite(
  input: z.infer<typeof resendCompanyInviteSchema>
) {
  try {
    const payload = resendCompanyInviteSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { id: payload.inviteId },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: invite.companyId },
      include: { company: true },
    });

    if (!membership || membership.role !== 'admin') {
      throw new Error('Only admins can resend invites');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const updatedInvite = await prisma.companyInvite.update({
      where: { id: invite.id },
      data: { expiresAt },
    });

    const inviteUrl = `${SERVER_URL}/${routing.defaultLocale}/invite/${updatedInvite.token}`;
    const autoscuolaService = await prisma.companyService.findFirst({
      where: {
        companyId: invite.companyId,
        serviceKey: 'AUTOSCUOLE',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const mobileInviteUrl = autoscuolaService
      ? buildMobileInviteUrl(updatedInvite.token)
      : null;

    await sendCompanyInviteEmail({
      to: invite.email,
      companyName: invite.company.name,
      inviteUrl,
      mobileInviteUrl,
      invitedByName: session?.user?.name ?? null,
    });

    return { success: true, message: 'Invite resent successfully' };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function cancelCompanyInvite(
  input: z.infer<typeof cancelCompanyInviteSchema>
) {
  try {
    const payload = cancelCompanyInviteSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { id: payload.inviteId },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: invite.companyId },
    });

    if (!membership || membership.role !== 'admin') {
      throw new Error('Only admins can cancel invites');
    }

    await prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: 'cancelled' },
    });

    return { success: true, message: 'Invite cancelled' };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCompanyInvite(
  input: z.infer<typeof acceptCompanyInviteSchema>
) {
  try {
    const payload = acceptCompanyInviteSchema.parse(input);
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      throw new Error('User is not authenticated');
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending' && invite.status !== 'accepted') {
      throw new Error('Invite is no longer active');
    }

    if (invite.status === 'pending' && invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    if (invite.email.toLowerCase() !== userEmail) {
      throw new Error('Invite email does not match the signed-in user');
    }

    return {
      success: true,
      data: {
        companyId: invite.companyId,
        companyName: invite.company.name,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCompanyInviteContext(
  input: z.infer<typeof acceptCompanyInviteSchema>
) {
  try {
    const payload = acceptCompanyInviteSchema.parse(input);
    const session = await auth();
    const sessionEmail = session?.user?.email?.toLowerCase() ?? null;

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    const user = await prisma.user.findFirst({
      where: { email: invite.email.toLowerCase() },
      select: { id: true },
    });

    const alreadyMember = user
      ? await prisma.companyMember.findFirst({
          where: { companyId: invite.companyId, userId: user.id },
        })
      : null;

    return {
      success: true,
      data: {
        companyId: invite.companyId,
        companyName: invite.company.name,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        hasAccount: Boolean(user),
        alreadyMember: Boolean(alreadyMember),
        isAuthenticated: Boolean(session?.user?.id),
        sessionEmail,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function acceptCompanyInvite(
  input: z.infer<typeof acceptCompanyInviteSchema>
) {
  try {
    const payload = acceptCompanyInviteSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userId || !userEmail) {
      throw new Error('User is not authenticated');
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    if (invite.email.toLowerCase() !== userEmail) {
      throw new Error('Invite email does not match the signed-in user');
    }

    const existingMember = await prisma.companyMember.findFirst({
      where: { companyId: invite.companyId, userId },
    });

    if (!existingMember) {
      await prisma.companyMember.create({
        data: {
          companyId: invite.companyId,
          userId,
          role: invite.role,
          autoscuolaRole: getDefaultAutoscuolaRole(invite.role),
        },
      });
    }

    await prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted' },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { activeCompanyId: invite.companyId },
    });

    return {
      success: true,
      message: `You joined ${invite.company.name}`,
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function acceptCompanyInviteWithPassword(
  input: z.infer<typeof acceptCompanyInvitePasswordSchema>
) {
  try {
    const payload = acceptCompanyInvitePasswordSchema.parse(input);

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    const user = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
    });

    if (!user || !user.password) {
      throw new Error('Account not found');
    }

    const isMatch = await compare(payload.password, user.password);
    if (!isMatch) {
      throw new Error('Invalid password');
    }

    const existingMember = await prisma.companyMember.findFirst({
      where: { companyId: invite.companyId, userId: user.id },
    });

    if (!existingMember) {
      await prisma.companyMember.create({
        data: {
          companyId: invite.companyId,
          userId: user.id,
          role: invite.role,
          autoscuolaRole: getDefaultAutoscuolaRole(invite.role),
        },
      });
    }

    await prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted' },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { activeCompanyId: invite.companyId },
    });

    await signIn('credentials', {
      email: invite.email,
      password: payload.password,
      redirectTo: `/${routing.defaultLocale}/user/home`,
    });

    return { success: true, message: 'Invite accepted' };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, message: formatError(error) };
  }
}

export async function acceptCompanyInviteAndRegister(
  input: z.infer<typeof acceptCompanyInviteSignUpSchema>
) {
  try {
    const payload = acceptCompanyInviteSignUpSchema.parse(input);

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('Account already exists');
    }

    const hashedPassword = await hash(payload.password);

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: payload.name,
          email: invite.email.toLowerCase(),
          password: hashedPassword,
          role: 'user',
          activeCompanyId: invite.companyId,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: invite.companyId,
          userId: user.id,
          role: invite.role,
          autoscuolaRole: getDefaultAutoscuolaRole(invite.role),
        },
      });

      await tx.companyInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted' },
      });

      return user;
    });

    await signIn('credentials', {
      email: createdUser.email,
      password: payload.password,
      redirectTo: `/${routing.defaultLocale}/user/home`,
    });

    return { success: true, message: 'Invite accepted' };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { success: false, message: formatError(error) };
  }
}
